-- ============================================================
-- 最閃亮的11班：考試英聽音檔
-- 使用方式：整份複製，貼到 Supabase 的 SQL Editor（New query），按 Run。
-- 執行一次就好；重複執行也不會壞掉。
-- 音檔放在 exam-audio 空間：知道網址才能播，檔名是隨機的，也沒有開放列出檔案。
-- 只有老師能上傳／刪除。每個檔案最大 50MB。
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exam-audio', 'exam-audio', true, 52428800,
        array['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/m4a','audio/wav','audio/x-wav'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "老師看考試音檔" on storage.objects;
create policy "老師看考試音檔" on storage.objects
  for select to authenticated
  using (bucket_id = 'exam-audio' and public.my_role() = 'teacher');

drop policy if exists "老師上傳考試音檔" on storage.objects;
create policy "老師上傳考試音檔" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'exam-audio' and public.my_role() = 'teacher');

drop policy if exists "老師刪除考試音檔" on storage.objects;
create policy "老師刪除考試音檔" on storage.objects
  for delete to authenticated
  using (bucket_id = 'exam-audio' and public.my_role() = 'teacher');

-- 執行完，下面應該看到一列 exam-audio
select id, public, file_size_limit from storage.buckets where id = 'exam-audio';
