-- ============================================================
-- 最閃亮的11班：資料庫設定（熊熊遊樂園・班導自己的班級分）
-- 使用方式：整份複製，貼到 Supabase 的 SQL Editor（New query），按 Run。
-- 要先執行過 10_熊熊遊樂園_科任老師.sql。執行一次就好；重複執行也不會壞掉。
--
-- 這一份做了什麼：
--   班導（teacher@shiny11.local）在熊熊遊樂園後台也有一個自己的「11班」，
--   可以像科任老師一樣幫孩子加扣分、分組、玩熊熊遊樂園換分。
--   ・班導的分數和閱讀課的分數分開算、分開換扭蛋集點
--   ・名單從閱讀課的 11 班複製過來（座號、姓名、小角色），分組可以不一樣
--   ・班導自己一套加扣分項目
--   ・科任老師看不到班導的 11 班
-- ============================================================

-- 1. 題庫：班導也是「計分老師」之後，題組的種類依然算班導的（class11）
create or replace function public.stamp_quiz_kind() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.owner := coalesce(old.owner, auth.uid(), new.owner);
  new.kind := case when public.rc_is_teacher() and public.my_role() is null then 'rc'
                   else coalesce(old.kind, 'class11') end;
  return new;
end $$;

-- 以前建的班導題組補上「是誰的」（從熊熊遊樂園開遊戲時才列得出來）
update public.quiz_sets set owner = (select id from auth.users where email = 'teacher@shiny11.local')
 where kind = 'class11' and owner is null;

-- 2. 兌換紀錄：誰按的就寫誰（班導／科任老師）
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
          case when public.my_role() = 'teacher' then '班導' else '科任老師' end)
  returning id into v_id;
  return v_id;
end $$;

-- 3. 選班時顯示「這是哪位老師的班」（只有看得到這個班的人才查得到）
create or replace function public.rc_course_teacher(p_course bigint) returns text
language sql stable security definer set search_path = public as $$
  select t.subject from public.rc_courses c join public.rc_teachers t on t.user_id = c.owner
   where c.id = p_course and public.rc_can_view(c.id)
$$;
revoke execute on function public.rc_course_teacher(bigint) from public, anon;
grant execute on function public.rc_course_teacher(bigint) to authenticated;

-- 4. 開通班導自己的 11 班
create or replace function public.rc_setup_home(p_email text, p_subject text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_course bigint;
  v_from bigint;
begin
  select u.id into v_uid from auth.users u join public.app_roles r on r.user_id = u.id
   where lower(u.email) = lower(p_email) and r.role = 'teacher';
  if v_uid is null then return '找不到班導帳號 ' || p_email; end if;

  insert into public.rc_teachers (user_id, name, subject) values (v_uid, '班導', p_subject)
  on conflict (user_id) do nothing;

  select id into v_course from public.rc_courses where owner = v_uid and is_home;
  if v_course is null then
    insert into public.rc_courses (owner, name, is_home, sort) values (v_uid, '11班', true, 0)
    returning id into v_course;
  end if;

  -- 名單從科任老師的 11 班複製（還沒有名單時）
  if not exists (select 1 from public.rc_students where course_id = v_course) then
    select id into v_from from public.rc_courses where is_home and owner <> v_uid order by id limit 1;
    if v_from is not null then
      insert into public.rc_students (course_id, seat, name, avatar)
      select v_course, seat, name, avatar from public.rc_students where course_id = v_from;
    end if;
  end if;

  if not exists (select 1 from public.rc_behaviors where owner = v_uid) then
    insert into public.rc_behaviors (owner, label, emoji, points, sort) values
      (v_uid, '作業準時交', '📝', 1, 1),
      (v_uid, '訂正完成', '✏️', 1, 2),
      (v_uid, '熱心服務', '🧹', 1, 3),
      (v_uid, '幫助同學', '🤝', 1, 4),
      (v_uid, '上課專心', '👂', 1, 5),
      (v_uid, '表現優異', '🌟', 2, 6),
      (v_uid, '秩序不佳', '🔇', -1, 7),
      (v_uid, '忘記帶東西', '🎒', -1, 8);
  end if;
  return '完成 ✓ 班導的 11 班（' || (select count(*) from public.rc_students where course_id = v_course) || ' 人）';
end $$;
revoke execute on function public.rc_setup_home(text, text) from public, anon, authenticated;

select public.rc_setup_home('teacher@shiny11.local', '班級經營') as 結果;
