-- Supabase SQL Editor에서 실행. 기존 saves 테이블과 진행 데이터는 변경하지 않습니다.
begin;

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author text not null check (char_length(author) between 1 and 100),
  dest_id text not null check (char_length(dest_id) between 1 and 100),
  category text not null check (category in ('교통','맛집','숙소','관광','쇼핑','기타')),
  text text not null check (char_length(text) between 5 and 300),
  created_at timestamptz not null default now()
);
alter table public.community_posts add column if not exists pet_snapshot jsonb
  check (pet_snapshot is null or (jsonb_typeof(pet_snapshot) = 'object' and octet_length(pet_snapshot::text) <= 1024));
create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author text not null check (char_length(author) between 1 and 100),
  text text not null check (char_length(text) between 2 and 100),
  created_at timestamptz not null default now()
);
create table if not exists public.community_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (post_id, user_id)
);

create index if not exists community_posts_created_idx on public.community_posts(created_at desc);
create index if not exists community_comments_post_idx on public.community_comments(post_id);

alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_likes enable row level security;

revoke all on public.community_posts, public.community_comments, public.community_likes from anon, authenticated;
grant select on public.community_posts, public.community_comments, public.community_likes to anon, authenticated;
grant insert (user_id, author, dest_id, category, text, pet_snapshot) on public.community_posts to authenticated;
grant insert (post_id, user_id, author, text) on public.community_comments to authenticated;
grant insert (post_id, user_id), update (post_id, user_id) on public.community_likes to authenticated;
grant delete on public.community_posts, public.community_comments, public.community_likes to authenticated;

drop policy if exists posts_read on public.community_posts;
create policy posts_read on public.community_posts for select to anon, authenticated using (true);
drop policy if exists posts_insert on public.community_posts;
create policy posts_insert on public.community_posts for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists posts_delete on public.community_posts;
create policy posts_delete on public.community_posts for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists comments_read on public.community_comments;
create policy comments_read on public.community_comments for select to anon, authenticated using (true);
drop policy if exists comments_insert on public.community_comments;
create policy comments_insert on public.community_comments for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists comments_delete on public.community_comments;
create policy comments_delete on public.community_comments for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists likes_read on public.community_likes;
create policy likes_read on public.community_likes for select to anon, authenticated using (true);
drop policy if exists likes_insert on public.community_likes;
create policy likes_insert on public.community_likes for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists likes_update on public.community_likes;
create policy likes_update on public.community_likes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists likes_delete on public.community_likes;
create policy likes_delete on public.community_likes for delete to authenticated using ((select auth.uid()) = user_id);

commit;
