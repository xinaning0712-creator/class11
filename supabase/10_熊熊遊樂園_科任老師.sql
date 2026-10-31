-- ============================================================
-- 最閃亮的11班：資料庫設定（熊熊遊樂園・科任老師計分系統）
-- 使用方式：整份複製，貼到 Supabase 的 SQL Editor（New query），按 Run。
-- 要先執行過 01～09。執行一次就好；重複執行也不會壞掉。
--
-- 這一份做了什麼：
--   1. 科任老師帳號（例如智慧閱讀老師）：和班導的老師帳號完全分開，
--      看不到也改不到 11 班的作業燈號、扭蛋、懲罰、聯絡簿。
--   2. 科任老師的班級（11班、509…）、名單（座號＋姓名）、分組、
--      加扣分項目、加扣分紀錄、11 班的扭蛋點數兌換紀錄。
--   3. 題庫分開：每位老師只能改自己的題組。
--   4. 熊熊遊樂園的成績可以記到科任老師的班級，並換成課堂分數。
--
-- 個資：孩子姓名只有「負責的科任老師」和「班導（只限 11 班）」登入後看得到。
--       沒登入的人、教室模式、孩子的 iPad 都看不到。
-- ============================================================


-- ============================================================
-- 1. 科任老師
-- ============================================================
create table if not exists public.rc_teachers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '老師' check (char_length(name) between 1 and 20),
  subject text not null default '智慧閱讀' check (char_length(subject) between 1 and 20),
  -- 熊熊遊樂園的成績換成課堂分數的規則
  game_join int not null default 1 check (game_join between 0 and 10),   -- 有參加、有答題：每人 +幾分
  game_top  int not null default 1 check (game_top  between 0 and 10),   -- 個人賽前三名：再 +幾分
  game_win  int not null default 1 check (game_win  between 0 and 10),   -- 團隊賽獲勝隊伍：每人再 +幾分
  created_at timestamptz not null default now()
);
alter table public.rc_teachers enable row level security;

-- 我是不是科任老師
create or replace function public.rc_is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rc_teachers where user_id = auth.uid())
$$;

drop policy if exists "rc_teachers 看自己" on public.rc_teachers;
create policy "rc_teachers 看自己" on public.rc_teachers
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "rc_teachers 改自己的設定" on public.rc_teachers;
create policy "rc_teachers 改自己的設定" on public.rc_teachers
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.rc_teachers from anon, authenticated;
grant select, update (name, subject, game_join, game_top, game_win) on public.rc_teachers to authenticated;


-- ============================================================
-- 2. 班級（一位科任老師可以帶好幾個班）
--    is_home = true 的是「11 班」：可以把個人分換成 11 班的扭蛋集點，班導也看得到
-- ============================================================
create table if not exists public.rc_courses (
  id bigint generated always as identity primary key,
  owner uuid not null references public.rc_teachers(user_id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 12),
  is_home boolean not null default false,
  seat_count int not null default 24 check (seat_count between 1 and 40),
  point_rate int not null default 5 check (point_rate between 1 and 100),   -- 幾分換 1 個集點（只有 11 班用得到）
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists rc_courses_owner on public.rc_courses (owner);
alter table public.rc_courses enable row level security;

-- 這個班我能不能看／能不能管
--   科任老師：自己的班都能看、能管
--   班導（teacher）：只有 11 班（is_home）能看；名單和兌換也能管
create or replace function public.rc_can_view(p_course bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rc_courses c
     where c.id = p_course
       and (c.owner = auth.uid() or (c.is_home and public.my_role() = 'teacher'))
  )
$$;
create or replace function public.rc_is_owner(p_course bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rc_courses c where c.id = p_course and c.owner = auth.uid())
$$;

drop policy if exists "rc_courses 看" on public.rc_courses;
create policy "rc_courses 看" on public.rc_courses
  for select to authenticated using (public.rc_can_view(id));
drop policy if exists "rc_courses 新增" on public.rc_courses;
create policy "rc_courses 新增" on public.rc_courses
  for insert to authenticated with check (owner = auth.uid() and public.rc_is_teacher() and not is_home);
drop policy if exists "rc_courses 修改" on public.rc_courses;
create policy "rc_courses 修改" on public.rc_courses
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "rc_courses 刪除" on public.rc_courses;
create policy "rc_courses 刪除" on public.rc_courses
  for delete to authenticated using (owner = auth.uid() and not is_home);
revoke all on public.rc_courses from anon, authenticated;
grant select, insert, delete on public.rc_courses to authenticated;
grant update (name, seat_count, point_rate, sort) on public.rc_courses to authenticated;


-- ============================================================
-- 3. 分組
-- ============================================================
create table if not exists public.rc_groups (
  id bigint generated always as identity primary key,
  course_id bigint not null references public.rc_courses(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 12),
  color int not null default 0 check (color between 0 and 11),
  sort int not null default 0
);
create index if not exists rc_groups_course on public.rc_groups (course_id);
alter table public.rc_groups enable row level security;

drop policy if exists "rc_groups 看" on public.rc_groups;
create policy "rc_groups 看" on public.rc_groups
  for select to authenticated using (public.rc_can_view(course_id));
drop policy if exists "rc_groups 管理" on public.rc_groups;
create policy "rc_groups 管理" on public.rc_groups
  for all to authenticated using (public.rc_can_view(course_id)) with check (public.rc_can_view(course_id));
revoke all on public.rc_groups from anon;
grant select, insert, update, delete on public.rc_groups to authenticated;


-- ============================================================
-- 4. 名單（座號＋姓名＋小角色＋組別）
-- ============================================================
create table if not exists public.rc_students (
  id bigint generated always as identity primary key,
  course_id bigint not null references public.rc_courses(id) on delete cascade,
  seat int not null check (seat between 1 and 40),
  name text not null default '' check (char_length(name) <= 12),
  avatar int not null default -1 check (avatar between -1 and 47),   -- -1 = 依座號自動
  group_id bigint references public.rc_groups(id) on delete set null,
  unique (course_id, seat)
);
alter table public.rc_students enable row level security;

drop policy if exists "rc_students 看" on public.rc_students;
create policy "rc_students 看" on public.rc_students
  for select to authenticated using (public.rc_can_view(course_id));
drop policy if exists "rc_students 管理" on public.rc_students;
create policy "rc_students 管理" on public.rc_students
  for all to authenticated using (public.rc_can_view(course_id)) with check (public.rc_can_view(course_id));
revoke all on public.rc_students from anon;
grant select, insert, update, delete on public.rc_students to authenticated;


-- ============================================================
-- 5. 加扣分項目（每位科任老師一套，兩個班共用）
-- ============================================================
create table if not exists public.rc_behaviors (
  id bigint generated always as identity primary key,
  owner uuid not null default auth.uid() references public.rc_teachers(user_id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 16),
  emoji text not null default '⭐' check (char_length(emoji) <= 8),
  points int not null check (points between -10 and 10 and points <> 0),
  sort int not null default 0,
  active boolean not null default true
);
alter table public.rc_behaviors enable row level security;

drop policy if exists "rc_behaviors 自己的" on public.rc_behaviors;
create policy "rc_behaviors 自己的" on public.rc_behaviors
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid() and public.rc_is_teacher());
revoke all on public.rc_behaviors from anon;
grant select, insert, update, delete on public.rc_behaviors to authenticated;


-- ============================================================
-- 6. 加扣分紀錄
--    個人分和小組分分開：student_id 有值 = 個人分；group_id 有值 = 小組分
--    source：manual（老師按的）、game（熊熊遊樂園換來的）
-- ============================================================
create table if not exists public.rc_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  course_id bigint not null references public.rc_courses(id) on delete cascade,
  student_id bigint references public.rc_students(id) on delete cascade,
  group_id bigint references public.rc_groups(id) on delete cascade,
  label text not null default '' check (char_length(label) <= 40),
  points int not null check (points between -50 and 50),
  source text not null default 'manual' check (source in ('manual', 'game')),
  game_id bigint,                      -- source = game 時：哪一場熊熊遊樂園
  batch text,                          -- 同一次按下去的（全班加分、多選）一起復原用
  undone_at timestamptz,
  check ((student_id is null) <> (group_id is null))
);
create index if not exists rc_events_course on public.rc_events (course_id, created_at desc);
create index if not exists rc_events_student on public.rc_events (student_id);
alter table public.rc_events enable row level security;

drop policy if exists "rc_events 看" on public.rc_events;
create policy "rc_events 看" on public.rc_events
  for select to authenticated using (public.rc_can_view(course_id));
drop policy if exists "rc_events 科任老師新增" on public.rc_events;
create policy "rc_events 科任老師新增" on public.rc_events
  for insert to authenticated with check (public.rc_is_owner(course_id) and source = 'manual' and undone_at is null);
drop policy if exists "rc_events 科任老師撤銷" on public.rc_events;
create policy "rc_events 科任老師撤銷" on public.rc_events
  for update to authenticated using (public.rc_is_owner(course_id)) with check (public.rc_is_owner(course_id));
revoke all on public.rc_events from anon, authenticated;
grant select, insert on public.rc_events to authenticated;
grant update (undone_at) on public.rc_events to authenticated;


-- ============================================================
-- 7. 11 班扭蛋集點兌換紀錄
--    個人分每 point_rate 分可以換 1 個集點；班導或科任老師在實體集點卡蓋好後按確認
-- ============================================================
create table if not exists public.rc_exchanges (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  course_id bigint not null references public.rc_courses(id) on delete cascade,
  student_id bigint not null references public.rc_students(id) on delete cascade,
  stamps int not null check (stamps between 1 and 50),     -- 蓋了幾個集點
  points int not null check (points between 1 and 5000),   -- 用掉幾分
  actor text not null default '',
  undone_at timestamptz
);
create index if not exists rc_exchanges_course on public.rc_exchanges (course_id);
alter table public.rc_exchanges enable row level security;

drop policy if exists "rc_exchanges 看" on public.rc_exchanges;
create policy "rc_exchanges 看" on public.rc_exchanges
  for select to authenticated using (public.rc_can_view(course_id));
revoke all on public.rc_exchanges from anon, authenticated;
grant select on public.rc_exchanges to authenticated;
-- 兌換只能透過下面的 rc_exchange（會檢查分數夠不夠）

create or replace function public.rc_balance(p_student bigint) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(points) from public.rc_events where student_id = p_student and undone_at is null), 0)
       - coalesce((select sum(points) from public.rc_exchanges where student_id = p_student and undone_at is null), 0)
$$;

create or replace function public.rc_exchange(p_student bigint, p_stamps int) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_course public.rc_courses%rowtype;
  v_bal int;
  v_id bigint;
begin
  select c.* into v_course from public.rc_courses c join public.rc_students s on s.course_id = c.id
   where s.id = p_student for update of c;
  if not found then raise exception '找不到這位同學'; end if;
  if not v_course.is_home then raise exception '這個班沒有扭蛋集點'; end if;
  if not public.rc_can_view(v_course.id) then raise exception '沒有權限'; end if;
  if p_stamps is null or p_stamps < 1 then raise exception '至少換 1 點'; end if;
  v_bal := public.rc_balance(p_student);
  if v_bal < p_stamps * v_course.point_rate then raise exception '分數不夠換這麼多點'; end if;
  insert into public.rc_exchanges (course_id, student_id, stamps, points, actor)
  values (v_course.id, p_student, p_stamps, p_stamps * v_course.point_rate,
          case when v_course.owner = auth.uid() then '科任老師' else '班導' end)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.rc_undo_exchange(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.rc_exchanges set undone_at = now()
   where id = p_id and undone_at is null and public.rc_can_view(course_id);
  if not found then raise exception '找不到這筆兌換，或已經撤銷過了'; end if;
end $$;

revoke execute on function public.rc_exchange(bigint, int) from public, anon;
revoke execute on function public.rc_undo_exchange(bigint) from public, anon;
revoke execute on function public.rc_balance(bigint) from public, anon, authenticated;   -- 只給 rc_exchange 內部用
grant execute on function public.rc_exchange(bigint, int) to authenticated;
grant execute on function public.rc_undo_exchange(bigint) to authenticated;


-- ============================================================
-- 8. 題庫分開：每位老師只能改自己的題組
--    owner 空白 = 以前建的（班導的）
--    kind：'class11'（班導）或 'rc'（科任老師），白板依身分只列出自己的
-- ============================================================
alter table public.quiz_sets add column if not exists owner uuid default auth.uid();
alter table public.quiz_sets add column if not exists kind text not null default 'class11';

create or replace function public.stamp_quiz_kind() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.owner := coalesce(old.owner, auth.uid(), new.owner);
  new.kind := case when public.rc_is_teacher() then 'rc' else coalesce(old.kind, 'class11') end;
  return new;
end $$;
drop trigger if exists trg_quiz_kind on public.quiz_sets;
create trigger trg_quiz_kind before insert or update on public.quiz_sets
  for each row execute function public.stamp_quiz_kind();

drop policy if exists "老師管理題組" on public.quiz_sets;
create policy "老師管理題組" on public.quiz_sets
  for all to authenticated
  using (public.my_role() = 'teacher' and kind = 'class11')
  with check (public.my_role() = 'teacher');

drop policy if exists "科任老師管理自己的題組" on public.quiz_sets;
create policy "科任老師管理自己的題組" on public.quiz_sets
  for all to authenticated
  using (public.rc_is_teacher() and owner = auth.uid())
  with check (public.rc_is_teacher() and owner = auth.uid());

drop policy if exists "科任老師上傳題目圖片" on storage.objects;
create policy "科任老師上傳題目圖片" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'quiz-images' and public.rc_is_teacher());
drop policy if exists "科任老師刪除自己的題目圖片" on storage.objects;
create policy "科任老師刪除自己的題目圖片" on storage.objects
  for delete to authenticated
  using (bucket_id = 'quiz-images' and public.rc_is_teacher() and owner = auth.uid());


-- ============================================================
-- 9. 熊熊遊樂園成績：記到哪個班
-- ============================================================
alter table public.game_results add column if not exists course_id bigint references public.rc_courses(id) on delete set null;
alter table public.game_results add column if not exists awarded_at timestamptz;

drop policy if exists "game_results 白板或老師可新增" on public.game_results;
create policy "game_results 白板或老師可新增" on public.game_results
  for insert to authenticated
  with check ((course_id is null and public.my_role() is not null) or (course_id is not null and public.rc_is_owner(course_id)));

drop policy if exists "game_results 老師可查看" on public.game_results;
create policy "game_results 老師可查看" on public.game_results
  for select to authenticated
  using ((course_id is null and public.my_role() = 'teacher') or (course_id is not null and public.rc_can_view(course_id)));

drop policy if exists "game_results 老師可刪除" on public.game_results;
create policy "game_results 老師可刪除" on public.game_results
  for delete to authenticated
  using ((course_id is null and public.my_role() = 'teacher') or (course_id is not null and public.rc_is_owner(course_id)));

-- 把一場熊熊遊樂園換成課堂分數（每場只能換一次；可以在後台撤銷）
--   有參加、有答題：+game_join
--   個人賽（搶答、糖果球）前三名：再 +game_top
--   團隊賽（拔河、玻璃球）獲勝隊伍：每人再 +game_win
create or replace function public.rc_award_game(p_game bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  g public.game_results%rowtype;
  t public.rc_teachers%rowtype;
  p jsonb;
  v_stu bigint;
  v_pts int;
  v_n int := 0;
  v_team boolean;
  v_winner int;
  v_batch text := 'game-' || p_game;
begin
  select * into g from public.game_results where id = p_game for update;
  if not found then raise exception '找不到這一場'; end if;
  if g.course_id is null or not public.rc_is_owner(g.course_id) then raise exception '沒有權限'; end if;
  if g.awarded_at is not null then raise exception '這一場已經換過分數了'; end if;
  select * into t from public.rc_teachers where user_id = auth.uid();

  v_team := g.mode in ('tug', 'marble');
  v_winner := case when (g.summary->>'winner') ~ '^-?[0-9]+$' then (g.summary->>'winner')::int else -1 end;

  for p in select * from jsonb_array_elements(g.players) loop
    continue when (p->>'seat') is null or (p->>'seat') !~ '^[0-9]+$';
    select id into v_stu from public.rc_students where course_id = g.course_id and seat = (p->>'seat')::int;
    continue when v_stu is null;
    continue when coalesce((p->>'correct')::int, 0) + coalesce((p->>'wrong')::int, 0) = 0;   -- 沒答題不算
    v_pts := t.game_join;
    if v_team and v_winner >= 0 and (p->>'team') ~ '^[0-9]+$' and (p->>'team')::int = v_winner then
      v_pts := v_pts + t.game_win;
    elsif not v_team and (p->>'rank') ~ '^[0-9]+$' and (p->>'rank')::int <= 3 then
      v_pts := v_pts + t.game_top;
    end if;
    continue when v_pts = 0;
    insert into public.rc_events (course_id, student_id, label, points, source, game_id, batch)
    values (g.course_id, v_stu, '🎡 熊熊遊樂園', v_pts, 'game', g.id, v_batch);
    v_n := v_n + 1;
  end loop;

  update public.game_results set awarded_at = now() where id = p_game;
  return v_n;
end $$;
revoke execute on function public.rc_award_game(bigint) from public, anon;
grant execute on function public.rc_award_game(bigint) to authenticated;


-- ============================================================
-- 10. 建立科任老師帳號用的小工具
--     先到「Authentication → Users」建立帳號，再執行：
--       select public.rc_setup('reading@shiny11.local', '智慧閱讀老師', '智慧閱讀', array['509']);
--     會自動建立「11班」和後面列出的班級，以及一組預設的加扣分項目。
-- ============================================================
create or replace function public.rc_setup(p_email text, p_name text, p_subject text, p_classes text[])
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_c text;
  i int := 1;
begin
  select id into v_uid from auth.users where lower(email) = lower(p_email);
  if v_uid is null then return '找不到帳號 ' || p_email || '：請先到 Authentication → Users 建立'; end if;
  if exists (select 1 from public.app_roles where user_id = v_uid) then
    return '這個帳號是班導或教室帳號，不能當科任老師';
  end if;

  insert into public.rc_teachers (user_id, name, subject) values (v_uid, p_name, p_subject)
  on conflict (user_id) do update set name = excluded.name, subject = excluded.subject;

  if not exists (select 1 from public.rc_courses where owner = v_uid and is_home) then
    insert into public.rc_courses (owner, name, is_home, sort) values (v_uid, '11班', true, 0);
  end if;
  foreach v_c in array coalesce(p_classes, '{}') loop
    if not exists (select 1 from public.rc_courses where owner = v_uid and name = v_c) then
      insert into public.rc_courses (owner, name, sort) values (v_uid, v_c, i);
    end if;
    i := i + 1;
  end loop;

  if not exists (select 1 from public.rc_behaviors where owner = v_uid) then
    insert into public.rc_behaviors (owner, label, emoji, points, sort) values
      (v_uid, '專心聆聽', '👂', 1, 1),
      (v_uid, '發表分享', '🙋', 2, 2),
      (v_uid, '認真閱讀', '📖', 1, 3),
      (v_uid, '幫助同學', '🤝', 1, 4),
      (v_uid, '完成任務', '✅', 1, 5),
      (v_uid, '上課聊天', '💬', -1, 6),
      (v_uid, '未帶課本', '🎒', -1, 7);
  end if;
  return '完成 ✓ ' || p_name || '（' || p_email || '）';
end $$;
revoke execute on function public.rc_setup(text, text, text, text[]) from public, anon, authenticated;


-- 執行完，下面應該看到 7 個資料表名稱
select table_name as 資料表 from information_schema.tables
 where table_schema = 'public' and table_name like 'rc\_%' order by 1;
