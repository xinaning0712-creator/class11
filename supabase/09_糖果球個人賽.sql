-- ============================================================
-- 最閃亮的11班：資料庫設定（成績紀錄加入「🍬 糖果球個人賽」）
-- 使用方式：整份複製，貼到 Supabase 的 SQL Editor（New query），按 Run。
-- 要先執行過 08_成績紀錄.sql。執行一次就好；重複執行也不會壞掉。
-- ============================================================

alter table public.game_results drop constraint if exists game_results_mode_check;
alter table public.game_results add constraint game_results_mode_check
  check (mode in ('tug', 'marble', 'quiz', 'candy'));

-- 執行完，下面應該看到一列，裡面有 candy
select pg_get_constraintdef(oid) as 允許的玩法 from pg_constraint where conname = 'game_results_mode_check';
