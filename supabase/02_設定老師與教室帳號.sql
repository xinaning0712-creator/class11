-- ============================================================
-- 在 Supabase「Authentication → Users」建立兩個帳號之後，再執行這一份。
--   老師帳號： teacher@shiny11.local
--   教室帳號： classroom@shiny11.local
-- （這兩個 Email 是虛構的，只拿來登入用，不會收信。）
-- ============================================================

insert into public.app_roles (user_id, role)
select id, 'teacher' from auth.users where email = 'teacher@shiny11.local'
on conflict (user_id) do update set role = excluded.role;

insert into public.app_roles (user_id, role)
select id, 'classroom' from auth.users where email = 'classroom@shiny11.local'
on conflict (user_id) do update set role = excluded.role;

-- 執行完，下面應該看到兩列：一個 teacher、一個 classroom
select u.email, r.role from public.app_roles r join auth.users u on u.id = r.user_id;
