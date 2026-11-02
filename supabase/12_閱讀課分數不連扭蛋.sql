-- ============================================================
-- 最閃亮的11班：資料庫設定（科任老師的課堂分數不連到班導的扭蛋集點）
-- 使用方式：整份複製，貼到 Supabase 的 SQL Editor（New query），按 Run。
-- 要先執行過 10、11。執行一次就好；重複執行也不會壞掉。
--
-- 這一份做了什麼：
--   ・每個班多一個「stamps」設定：可不可以換 11 班的扭蛋集點
--   ・只有班導自己的 11 班可以換；科任老師（智慧閱讀）的 11 班不再連到扭蛋，
--     純粹是課堂分數（班導一樣看得到名單和學期統計，打成績用）
--   ・以前已經換過的集點紀錄不會刪掉，只是不能再換
-- ============================================================

alter table public.rc_courses add column if not exists stamps boolean not null default false;

update public.rc_courses c set stamps = (c.is_home and exists (
  select 1 from public.app_roles r where r.user_id = c.owner and r.role = 'teacher'
));

-- 換集點：只有 stamps = true 的班可以換
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
  if not v_course.stamps then raise exception '這個班的分數不換扭蛋集點'; end if;
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

-- 加扣分項目：分數可以自由設定 −10～+10（不能是 0）
alter table public.rc_behaviors drop constraint if exists rc_behaviors_points_check;
alter table public.rc_behaviors add constraint rc_behaviors_points_check check (points between -10 and 10 and points <> 0);

-- 執行完，下面會列出每個班可不可以換扭蛋集點
select c.name as 班級, coalesce(t.subject, '') as 科目, c.stamps as 可換扭蛋集點
  from public.rc_courses c left join public.rc_teachers t on t.user_id = c.owner order by c.id;
