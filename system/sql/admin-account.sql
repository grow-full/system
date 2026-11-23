-- Run in the Supabase SQL Editor after visitors.sql.
-- Grants access to the existing aaaa account without changing its password.
do $$
declare
  admin_id uuid;
begin
  select id into admin_id from auth.users where email = 'aaaa@wooang.app';
  if admin_id is null then
    raise exception 'The existing aaaa account was not found';
  end if;
  insert into public.site_admins (user_id) values (admin_id) on conflict do nothing;
end;
$$;
