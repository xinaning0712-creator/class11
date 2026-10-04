-- ============================================================
-- 最閃亮的11班：資料庫設定（聯絡簿連結等網站設定）
-- 使用方式：整份複製，貼到 Supabase 的 SQL Editor（New query），按 Run。
-- ============================================================

create table if not exists public.settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;

drop policy if exists "大家都能看設定" on public.settings;
create policy "大家都能看設定" on public.settings
  for select to anon, authenticated using (true);

drop policy if exists "老師可以新增設定" on public.settings;
create policy "老師可以新增設定" on public.settings
  for insert to authenticated with check (public.my_role() = 'teacher');

drop policy if exists "老師可以修改設定" on public.settings;
create policy "老師可以修改設定" on public.settings
  for update to authenticated
  using (public.my_role() = 'teacher') with check (public.my_role() = 'teacher');

do $$
begin
  alter publication supabase_realtime add table public.settings;
exception when duplicate_object then null;
end $$;
