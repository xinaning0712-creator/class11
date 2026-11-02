-- ============================================================
-- 最閃亮的11班：資料庫設定（熊熊遊樂園換成課堂分數的規則，可以自由編輯）
-- 使用方式：整份複製，貼到 Supabase 的 SQL Editor（New query），按 Run。
-- 要先執行過 10～12。執行一次就好；重複執行也不會壞掉。
--
-- 規則存在每位老師自己的 game_rules（一條一條，可以新增、刪除、改分數）：
--   join     有答題的同學                 +pts
--   correct  每答對 1 題                   +pts × 答對題數
--   rank     個人第 n 名（依答對題數／分數） +pts
--   top      個人前 n 名                   +pts
--   win      獲勝隊伍的同學（拔河、玻璃球）  +pts
--   perfect  全部答對（答錯 0 題）          +pts
--   pts 可以是 −10～+10；同一個孩子符合好幾條就加總（一場最多 ±50）
-- ============================================================

alter table public.rc_teachers add column if not exists game_rules jsonb;

-- 以前的三條固定規則，搬成新的格式（已經搬過的不動）
update public.rc_teachers set game_rules = jsonb_build_array(
    jsonb_build_object('t', 'join', 'pts', game_join),
    jsonb_build_object('t', 'top', 'n', 3, 'pts', game_top),
    jsonb_build_object('t', 'win', 'pts', game_win))
 where game_rules is null;

alter table public.rc_teachers alter column game_rules set default
  '[{"t":"join","pts":1},{"t":"top","n":3,"pts":1},{"t":"win","pts":1}]'::jsonb;
alter table public.rc_teachers alter column game_rules set not null;
alter table public.rc_teachers drop constraint if exists rc_teachers_game_rules_check;
alter table public.rc_teachers add constraint rc_teachers_game_rules_check
  check (jsonb_typeof(game_rules) = 'array' and jsonb_array_length(game_rules) <= 20);

grant update (game_rules) on public.rc_teachers to authenticated;

-- 換分：依老師自己的規則
create or replace function public.rc_award_game(p_game bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  g public.game_results%rowtype;
  v_rules jsonb;
  r jsonb;
  p jsonb;
  v_stu bigint;
  v_pts int;
  v_n int := 0;
  v_team boolean;
  v_winner int;
  v_correct int;
  v_wrong int;
  v_rank int;
  v_k int;
  v_add int;
begin
  select * into g from public.game_results where id = p_game for update;
  if not found then raise exception '找不到這一場'; end if;
  if g.course_id is null or not public.rc_is_owner(g.course_id) then raise exception '沒有權限'; end if;
  if g.awarded_at is not null then raise exception '這一場已經換過分數了'; end if;
  select coalesce(game_rules, '[]'::jsonb) into v_rules from public.rc_teachers where user_id = auth.uid();

  v_team := g.mode in ('tug', 'marble');
  v_winner := case when (g.summary->>'winner') ~ '^-?[0-9]+$' then (g.summary->>'winner')::int else -1 end;

  for p in select * from jsonb_array_elements(g.players) loop
    continue when (p->>'seat') is null or (p->>'seat') !~ '^[0-9]+$';
    select id into v_stu from public.rc_students where course_id = g.course_id and seat = (p->>'seat')::int;
    continue when v_stu is null;
    v_correct := case when (p->>'correct') ~ '^[0-9]+$' then (p->>'correct')::int else 0 end;
    v_wrong := case when (p->>'wrong') ~ '^[0-9]+$' then (p->>'wrong')::int else 0 end;
    v_rank := case when (p->>'rank') ~ '^[0-9]+$' then (p->>'rank')::int else 999 end;
    continue when v_correct + v_wrong = 0;        -- 沒答題的不算

    v_pts := 0;
    for r in select * from jsonb_array_elements(v_rules) loop
      continue when jsonb_typeof(r) <> 'object' or (r->>'pts') !~ '^-?[0-9]+$';
      v_add := greatest(-10, least(10, (r->>'pts')::int));
      v_k := case when (r->>'n') ~ '^[0-9]+$' then (r->>'n')::int else 0 end;
      case r->>'t'
        when 'join' then v_pts := v_pts + v_add;
        when 'correct' then v_pts := v_pts + v_add * v_correct;
        when 'rank' then if v_rank = v_k then v_pts := v_pts + v_add; end if;
        when 'top' then if v_rank <= v_k then v_pts := v_pts + v_add; end if;
        when 'win' then
          if v_team and v_winner >= 0 and (p->>'team') ~ '^[0-9]+$' and (p->>'team')::int = v_winner then
            v_pts := v_pts + v_add;
          end if;
        when 'perfect' then if v_wrong = 0 and v_correct > 0 then v_pts := v_pts + v_add; end if;
        else null;
      end case;
    end loop;

    v_pts := greatest(-50, least(50, v_pts));
    continue when v_pts = 0;
    insert into public.rc_events (course_id, student_id, label, points, source, game_id, batch)
    values (g.course_id, v_stu, '🎡 熊熊遊樂園', v_pts, 'game', g.id, 'game-' || p_game);
    v_n := v_n + 1;
  end loop;

  update public.game_results set awarded_at = now() where id = p_game;
  return v_n;
end $$;
revoke execute on function public.rc_award_game(bigint) from public, anon;
grant execute on function public.rc_award_game(bigint) to authenticated;

-- 執行完，下面會列出每位老師目前的規則
select subject as 科目, jsonb_pretty(game_rules) as 換分規則 from public.rc_teachers;
