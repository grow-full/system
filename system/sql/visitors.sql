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
alter table public.site_visitors enable row level security;
alter table public.site_visitor_totals enable row level security;
revoke all on public.site_visitors, public.site_visitor_totals from public, anon, authenticated;

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
commit;
