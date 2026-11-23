-- Supabase SQL Editor에서 실행. 적용 이후 방문부터 집계합니다.
begin;
create table if not exists public.site_visitors (
  visitor_id uuid primary key,
  first_seen_at timestamptz not null default now()
);
create table if not exists public.site_visitor_totals (
  id integer primary key check (id = 1),
  total bigint not null default 0 check (total >= 0)
);
insert into public.site_visitor_totals(id, total) values (1, 0) on conflict (id) do nothing;
alter table public.site_visitor_totals
  add column if not exists daily_tracking_started_at timestamptz not null default now();
create table if not exists public.site_daily_visitors (
  visit_date date not null,
  visitor_id uuid not null references public.site_visitors(visitor_id) on delete cascade,
  primary key (visit_date, visitor_id)
);
create table if not exists public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.site_visitors enable row level security;
alter table public.site_visitor_totals enable row level security;
alter table public.site_daily_visitors enable row level security;
alter table public.site_admins enable row level security;
revoke all on public.site_visitors, public.site_visitor_totals, public.site_daily_visitors, public.site_admins from public, anon, authenticated;
create index if not exists site_visitors_first_seen_at_idx on public.site_visitors (first_seen_at);

-- 원본 방문자 목록은 공개하지 않고 숫자만 반환합니다.
create or replace function public.record_site_visitor(p_visitor_id uuid default null)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  inserted integer;
  visitor_total bigint;
begin
  if p_visitor_id is not null then
    insert into public.site_visitors(visitor_id) values (p_visitor_id) on conflict (visitor_id) do nothing;
    get diagnostics inserted = row_count;
    insert into public.site_daily_visitors(visit_date, visitor_id)
      values ((now() at time zone 'Asia/Seoul')::date, p_visitor_id)
      on conflict do nothing;
    if inserted = 1 then
      update public.site_visitor_totals set total = total + 1 where id = 1 returning total into visitor_total;
      return visitor_total::text;
    end if;
  end if;
  select total into visitor_total from public.site_visitor_totals where id = 1;
  return visitor_total::text;
end;
$$;
revoke all on function public.record_site_visitor(uuid) from public;
grant execute on function public.record_site_visitor(uuid) to anon, authenticated;

-- Only an approved account receives the rendered dashboard.
create or replace function public.site_admin_dashboard()
returns text language plpgsql stable security definer set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  first_day date := today - 29;
  tracking_day date;
  total_visitors bigint;
  today_visitors bigint;
  today_new bigint;
  total_accounts bigint;
  daily_rows text;
begin
  if not exists (select 1 from public.site_admins where user_id = auth.uid()) then
    raise insufficient_privilege using message = 'Administrator access required';
  end if;

  select total, (daily_tracking_started_at at time zone 'Asia/Seoul')::date
    into total_visitors, tracking_day from public.site_visitor_totals where id = 1;
  select count(*) into today_visitors from public.site_daily_visitors where visit_date = today;
  select count(*) into total_accounts from auth.users;

  with new_visitors as (
    select (first_seen_at at time zone 'Asia/Seoul')::date as day, count(*) as visitors
    from public.site_visitors
    where first_seen_at >= (first_day::timestamp at time zone 'Asia/Seoul')
    group by 1
  ), visits as (
    select visit_date as day, count(*) as visitors
    from public.site_daily_visitors where visit_date between first_day and today
    group by visit_date
  ), days as (
    select today - n as day from pg_catalog.generate_series(0, 29) as series(n)
  )
  select coalesce(max(new_visitors.visitors) filter (where days.day = today), 0),
    pg_catalog.string_agg(pg_catalog.format('<tr><th scope="row">%s</th><td>%s</td><td>%s</td></tr>',
      pg_catalog.to_char(days.day, 'YYYY-MM-DD'),
      case when days.day < tracking_day then '집계 전' else coalesce(visits.visitors, 0)::text end,
      coalesce(new_visitors.visitors, 0)), '' order by days.day desc)
  into today_new, daily_rows
  from days left join visits using (day) left join new_visitors using (day);

  return pg_catalog.format($html$<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>방문 통계</title><style>
body{font:1rem/1.5 system-ui,sans-serif;color:#202938;background:#f6f8fc;margin:0}
main{max-width:54rem;margin:auto;padding:clamp(1rem,4vw,2rem)}
dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.75rem}
dl div,section{background:white;border:1px solid #dce2ea;border-radius:.75rem;padding:1rem}
dd{font-size:1.6rem;font-weight:700;margin:0} table{border-collapse:collapse;width:100%%}
th,td{padding:.5rem;border-bottom:1px solid #e3e8ef;text-align:right}
th:first-child{text-align:left} small{color:#455268}
</style></head><body><main>
<h1>방문 통계</h1>
<dl><div><dt>누적 방문자</dt><dd>%s</dd></div><div><dt>오늘 방문자</dt><dd>%s</dd></div>
<div><dt>오늘 신규 방문자</dt><dd>%s</dd></div><div><dt>누적 가입 계정</dt><dd>%s</dd></div></dl>
<section><h2>최근 30일 방문 기록</h2>
<p><small>한국 시간 기준 · 방문자는 브라우저별로 집계합니다. 일별 방문 집계는 %s부터 시작했고 첫날 수치는 일부 방문만 포함할 수 있습니다.</small></p>
<table><thead><tr><th scope="col">날짜</th><th scope="col">방문자</th><th scope="col">신규 방문자</th></tr></thead>
<tbody>%s</tbody></table></section>
</main></body></html>$html$, total_visitors, today_visitors, today_new, total_accounts,
    pg_catalog.to_char(tracking_day, 'YYYY-MM-DD'), daily_rows);
end;
$$;
revoke all on function public.site_admin_dashboard() from public, anon, authenticated;
grant execute on function public.site_admin_dashboard() to authenticated;
commit;
