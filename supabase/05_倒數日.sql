-- ============================================================
-- 最閃亮的11班：資料庫設定（倒數日）
-- 使用方式：整份複製，貼到 Supabase 的 SQL Editor（New query），按 Run。
-- ============================================================

create table if not exists public.countdowns (
  id bigint generated always as identity primary key,
  title text not null check (length(trim(title)) > 0),
  date date not null,
  created_at timestamptz not null default now()
);
alter table public.countdowns enable row level security;

drop policy if exists "大家都能看倒數日" on public.countdowns;
create policy "大家都能看倒數日" on public.countdowns
  for select to anon, authenticated using (true);

drop policy if exists "老師管理倒數日" on public.countdowns;
create policy "老師管理倒數日" on public.countdowns
  for all to authenticated
  using (public.my_role() = 'teacher') with check (public.my_role() = 'teacher');

do $$
begin
  alter publication supabase_realtime add table public.countdowns;
exception when duplicate_object then null;
end $$;
