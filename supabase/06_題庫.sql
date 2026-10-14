-- ============================================================
-- 最閃亮的11班：資料庫設定（全班對戰的題庫）
-- 使用方式：整份複製，貼到 Supabase 的 SQL Editor（New query），按 Run。
-- 執行一次就好；重複執行也不會壞掉。
-- ============================================================

-- 題組：一個題組一列，題目放在 questions 裡
--   questions 的格式：[{ "text":"題目", "img":"圖片網址或空白", "options":["A","B","C","D"], "answer":0 }, ...]
create table if not exists public.quiz_sets (
  id bigint generated always as identity primary key,
  title text not null check (length(trim(title)) between 1 and 40),
  subject text not null default '其他',
  frac boolean not null default false,      -- 把 3/4 顯示成上下排版的分數
  shuffle boolean not null default true,    -- 選項順序打亂
  questions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.quiz_sets enable row level security;

-- 白板開房間時要讀題組（不用登入）；題目不是個資
drop policy if exists "大家都能看題組" on public.quiz_sets;
create policy "大家都能看題組" on public.quiz_sets
  for select to anon, authenticated using (true);

drop policy if exists "老師管理題組" on public.quiz_sets;
create policy "老師管理題組" on public.quiz_sets
  for all to authenticated
  using (public.my_role() = 'teacher') with check (public.my_role() = 'teacher');

-- ============================================================
-- 題目圖片：放在 quiz-images 空間（公開可看，只有老師能上傳／刪除）
-- 每張最大 2MB，只收圖片（後台上傳前會自動縮小）
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quiz-images', 'quiz-images', true, 2097152, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "老師上傳題目圖片" on storage.objects;
create policy "老師上傳題目圖片" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'quiz-images' and public.my_role() = 'teacher');

drop policy if exists "老師刪除題目圖片" on storage.objects;
create policy "老師刪除題目圖片" on storage.objects
  for delete to authenticated
  using (bucket_id = 'quiz-images' and public.my_role() = 'teacher');

-- 執行完，下面應該看到一列 quiz-images
select id, public, file_size_limit from storage.buckets where id = 'quiz-images';
