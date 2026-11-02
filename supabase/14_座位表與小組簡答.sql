-- ============================================================
-- 最閃亮的11班：資料庫設定（熊熊遊樂園：座位表、簡答題組、小組簡答）
-- 使用方式：整份複製，貼到 Supabase 的 SQL Editor（New query），按 Run。
-- 要先執行過 10～13。執行一次就好；重複執行也不會壞掉。
-- ============================================================

-- 1. 座位表
--    班級的排法：layout = 每一直排有幾個位子，例如 [5,5,5,5,4]
--    每個孩子坐哪裡：seat_col（第幾排，從 0 開始）、seat_row（第幾個，從講台往後，從 0 開始）
alter table public.rc_courses add column if not exists layout jsonb;
alter table public.rc_courses drop constraint if exists rc_courses_layout_check;
alter table public.rc_courses add constraint rc_courses_layout_check
  check (layout is null or (jsonb_typeof(layout) = 'array' and jsonb_array_length(layout) between 1 and 12));
grant update (layout) on public.rc_courses to authenticated;

alter table public.rc_students add column if not exists seat_col int check (seat_col between 0 and 11);
alter table public.rc_students add column if not exists seat_row int check (seat_row between 0 and 11);

-- 2. 題組種類：choice（選擇題，原本的）、short（簡答題：題目、圖片、參考答案）
alter table public.quiz_sets add column if not exists qtype text not null default 'choice';
alter table public.quiz_sets drop constraint if exists quiz_sets_qtype_check;
alter table public.quiz_sets add constraint quiz_sets_qtype_check check (qtype in ('choice', 'short'));

-- 3. 小組簡答：幾顆星換幾分（每位老師自己設）
alter table public.rc_teachers add column if not exists short_stars jsonb not null default '[1,2,3]'::jsonb;
alter table public.rc_teachers drop constraint if exists rc_teachers_short_stars_check;
alter table public.rc_teachers add constraint rc_teachers_short_stars_check
  check (jsonb_typeof(short_stars) = 'array' and jsonb_array_length(short_stars) = 3);
grant update (short_stars) on public.rc_teachers to authenticated;

-- 4. 小組簡答的作答紀錄（課後可以回頭看每組寫了什麼）
create table if not exists public.rc_short_answers (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  course_id bigint not null references public.rc_courses(id) on delete cascade,
  session text not null check (char_length(session) <= 40),          -- 同一堂課（同一次開房間）
  set_title text not null default '' check (char_length(set_title) <= 80),
  q_index int not null default 0,
  question text not null default '' check (char_length(question) <= 400),
  group_id bigint references public.rc_groups(id) on delete set null,
  group_name text not null default '' check (char_length(group_name) <= 20),
  answer text not null default '' check (char_length(answer) <= 400),
  stars int check (stars between 0 and 3),
  points int not null default 0 check (points between -50 and 50)
);
create index if not exists rc_short_answers_course on public.rc_short_answers (course_id, created_at desc);
alter table public.rc_short_answers enable row level security;

drop policy if exists "rc_short_answers 看" on public.rc_short_answers;
create policy "rc_short_answers 看" on public.rc_short_answers
  for select to authenticated using (public.rc_can_view(course_id));
drop policy if exists "rc_short_answers 科任老師新增" on public.rc_short_answers;
create policy "rc_short_answers 科任老師新增" on public.rc_short_answers
  for insert to authenticated with check (public.rc_is_owner(course_id));
drop policy if exists "rc_short_answers 科任老師刪除" on public.rc_short_answers;
create policy "rc_short_answers 科任老師刪除" on public.rc_short_answers
  for delete to authenticated using (public.rc_is_owner(course_id));
revoke all on public.rc_short_answers from anon;
grant select, insert, delete on public.rc_short_answers to authenticated;

-- 5. 511 的座位排法先設成 5、5、5、5、4（從講台看過去 5 條直排）
update public.rc_courses set layout = '[5,5,5,5,4]'::jsonb where name = '511' and layout is null;

-- 執行完，下面會列出每個班的座位排法
select name as 班級, coalesce(layout::text, '（還沒設定）') as 座位排法 from public.rc_courses order by id;
