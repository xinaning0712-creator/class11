-- ============================================================
-- 最閃亮的11班：資料庫設定（全班完成自動封存＋清除舊封存）
-- 使用方式：整份複製，貼到 Supabase 的 SQL Editor（New query），按 Run。
-- 執行一次就好；重複執行也不會壞掉。
-- ============================================================

-- 1. 記錄「什麼時候封存的」（清除一學期前的封存要用）
alter table public.assignments add column if not exists archived_at timestamptz;

-- 封存／還原時自動填上或清掉時間（老師在後台按封存、或主畫面自動封存都會走這裡）
create or replace function public.stamp_archived_at() returns trigger
language plpgsql as $$
begin
  if new.archived and not coalesce(old.archived, false) then
    new.archived_at := now();
  elsif not new.archived then
    new.archived_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_stamp_archived_at on public.assignments;
create trigger trg_stamp_archived_at
  before update of archived on public.assignments
  for each row execute function public.stamp_archived_at();

-- 以前就封存的作業，用建立時間當作封存時間
update public.assignments set archived_at = created_at where archived and archived_at is null;

-- 2. 全班完成自動封存
-- 主畫面播完「彩色球滾出去」的動畫後呼叫。
-- 只有在 24 個人「全部綠燈」時才會封存，所以按錯的孩子按了「復原」就不會被收掉。
create or replace function public.archive_if_done(p_assignment bigint)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is null then raise exception '沒有權限'; end if;
  if exists (
    select 1 from public.lights where assignment_id = p_assignment and status <> 'green'
  ) then
    return false;
  end if;
  update public.assignments set archived = true where id = p_assignment and not archived;
  return found;
end $$;

revoke execute on function public.archive_if_done(bigint) from public, anon;
grant execute on function public.archive_if_done(bigint) to authenticated;

-- 3. 清除一學期（6 個月）前的封存作業（只有老師能用）
-- p_dry_run = true：只算有幾項，不刪除（給後台確認視窗用）
-- 燈號與修改紀錄會跟著作業一起刪掉
create or replace function public.purge_old_archived(p_dry_run boolean default true)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if public.my_role() is distinct from 'teacher' then raise exception '只有老師可以清除'; end if;
  if p_dry_run then
    select count(*) into v_count from public.assignments
     where archived and coalesce(archived_at, created_at) < now() - interval '6 months';
    return v_count;
  end if;
  delete from public.assignments
   where archived and coalesce(archived_at, created_at) < now() - interval '6 months';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.purge_old_archived(boolean) from public, anon;
grant execute on function public.purge_old_archived(boolean) to authenticated;

-- 執行完，下面應該看到兩個函式名稱
select proname from pg_proc where proname in ('archive_if_done', 'purge_old_archived');
