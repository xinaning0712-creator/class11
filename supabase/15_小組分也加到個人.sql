-- ============================================================
-- 最閃亮的11班：資料庫設定（熊熊遊樂園：小組加分也累積到組員的個人分）
-- 使用方式：整份複製，貼到 Supabase 的 SQL Editor（New query），按 Run。
-- 要先執行過 10～14。執行一次就好；重複執行也不會壞掉。
--
--   ・每位老師多一個設定 group_to_member：小組加分時，組員每人的個人分也加一樣的分數（預設打開）
--   ・組員分到的分數記成 source = 'group'，學期統計會另外列「👥 小組」一欄
--   ・以前加過的小組分不會補到個人分，只有從現在開始加的才會
-- ============================================================

alter table public.rc_teachers add column if not exists group_to_member boolean not null default true;
grant update (group_to_member) on public.rc_teachers to authenticated;

alter table public.rc_events drop constraint if exists rc_events_source_check;
alter table public.rc_events add constraint rc_events_source_check check (source in ('manual', 'game', 'group'));

drop policy if exists "rc_events 科任老師新增" on public.rc_events;
create policy "rc_events 科任老師新增" on public.rc_events
  for insert to authenticated
  with check (public.rc_is_owner(course_id) and source in ('manual', 'group') and undone_at is null);

-- 執行完，下面會列出每位老師的設定
select subject as 科目, group_to_member as 小組分也加到個人 from public.rc_teachers;
