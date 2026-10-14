-- ============================================================
-- 最閃亮的11班：資料庫設定（全班對戰成績紀錄）
-- 使用方式：整份複製，貼到 Supabase 的 SQL Editor（New query），按 Run。
-- 執行一次就好；重複執行也不會壞掉。
--
-- 存什麼：
--   每一場比賽一列：玩法、題組、整體結果（獲勝隊伍、每題全班答對率）、
--   每個孩子的「座號、暱稱、隊伍、答對、答錯、分數、名次」。
--   不存孩子的姓名。
-- 誰能存：白板電腦（教室模式）或老師登入時，比賽結束會自動存。
-- 誰能看、能刪：只有老師（後台「📊 成績紀錄」）。
-- ============================================================

create table if not exists public.game_results (
  id bigint generated always as identity primary key,
  played_at timestamptz not null default now(),
  mode text not null check (mode in ('tug', 'marble', 'quiz')),
  source text not null default '' check (char_length(source) <= 80),   -- 題組名稱或「自動出題」
  player_count integer not null default 0 check (player_count between 0 and 60),
  -- [{seat, name, team, correct, wrong, score, rank}]
  players jsonb not null default '[]'::jsonb
    check (jsonb_typeof(players) = 'array' and jsonb_array_length(players) <= 60),
  -- 整體結果：獲勝隊伍、每隊答對題數、每題答對率…
  summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(summary) = 'object' and pg_column_size(summary) < 200000)
);

create index if not exists game_results_played_at on public.game_results (played_at desc);

alter table public.game_results enable row level security;

drop policy if exists "game_results 白板或老師可新增" on public.game_results;
create policy "game_results 白板或老師可新增" on public.game_results
  for insert to authenticated with check (public.my_role() is not null);

drop policy if exists "game_results 老師可查看" on public.game_results;
create policy "game_results 老師可查看" on public.game_results
  for select to authenticated using (public.my_role() = 'teacher');

drop policy if exists "game_results 老師可刪除" on public.game_results;
create policy "game_results 老師可刪除" on public.game_results
  for delete to authenticated using (public.my_role() = 'teacher');

grant select, insert, delete on public.game_results to authenticated;

-- 執行完，下面應該看到 game_results 和 0（目前還沒有紀錄）
select 'game_results' as 資料表, count(*) as 筆數 from public.game_results;
