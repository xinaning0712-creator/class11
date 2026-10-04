-- ============================================================
-- 最閃亮的11班：資料庫設定（第一階段：作業燈號）
-- 使用方式：整份複製，貼到 Supabase 的 SQL Editor，按 Run。
-- ============================================================

-- ---------- 身分：誰是老師、誰是教室電腦 ----------
create table if not exists public.app_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('teacher', 'classroom'))
);
alter table public.app_roles enable row level security;
-- 不開任何讀寫權限：只有下面的函式能查。

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.app_roles where user_id = auth.uid()
$$;

-- ---------- 作業 ----------
create table if not exists public.assignments (
  id bigint generated always as identity primary key,
  title text not null check (length(trim(title)) > 0),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.assignments enable row level security;

drop policy if exists "大家都能看作業" on public.assignments;
create policy "大家都能看作業" on public.assignments
  for select to anon, authenticated using (true);

drop policy if exists "老師可以新增作業" on public.assignments;
create policy "老師可以新增作業" on public.assignments
  for insert to authenticated with check (public.my_role() = 'teacher');

drop policy if exists "老師可以修改作業" on public.assignments;
create policy "老師可以修改作業" on public.assignments
  for update to authenticated
  using (public.my_role() = 'teacher') with check (public.my_role() = 'teacher');

-- ---------- 燈號（每個作業 × 24 個座號） ----------
create table if not exists public.lights (
  assignment_id bigint not null references public.assignments(id) on delete cascade,
  seat int not null check (seat between 1 and 24),
  status text not null default 'green' check (status in ('green', 'yellow', 'red')),
  updated_at timestamptz not null default now(),
  primary key (assignment_id, seat)
);
alter table public.lights enable row level security;

drop policy if exists "大家都能看燈號" on public.lights;
create policy "大家都能看燈號" on public.lights
  for select to anon, authenticated using (true);
-- 燈號不開放直接修改，只能透過下面的 set_light / undo_light_change。

-- 新增作業時，自動建立 24 顆綠燈
create or replace function public.create_lights_for_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.lights (assignment_id, seat)
  select new.id, s from generate_series(1, 24) as s;
  return new;
end $$;

drop trigger if exists trg_assignment_lights on public.assignments;
create trigger trg_assignment_lights
  after insert on public.assignments
  for each row execute function public.create_lights_for_assignment();

-- ---------- 燈號修改紀錄 ----------
create table if not exists public.light_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  assignment_id bigint not null references public.assignments(id) on delete cascade,
  seat int not null,
  old_status text not null,
  new_status text not null,
  actor text not null,          -- 'teacher'（老師）或 'classroom'（孩子在白板上點）
  undone_at timestamptz         -- 有值代表這筆已被撤銷
);
alter table public.light_logs enable row level security;

drop policy if exists "老師可以看紀錄" on public.light_logs;
create policy "老師可以看紀錄" on public.light_logs
  for select to authenticated using (public.my_role() = 'teacher');

-- ---------- 改燈號 ----------
-- 老師：可改成任何顏色。教室電腦（孩子）：只能改成綠燈。
-- 回傳這次修改的紀錄編號（給「復原」按鈕用）；沒有變化時回傳 null。
create or replace function public.set_light(p_assignment bigint, p_seat int, p_status text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.my_role();
  v_old text;
  v_log bigint;
begin
  if v_role is null then raise exception '沒有權限'; end if;
  if p_status not in ('green', 'yellow', 'red') then raise exception '燈號不正確'; end if;
  if v_role <> 'teacher' and p_status <> 'green' then raise exception '只能改成綠燈'; end if;
  if v_role <> 'teacher' and exists (
    select 1 from public.assignments where id = p_assignment and archived
  ) then raise exception '這個作業已封存'; end if;

  select status into v_old from public.lights
   where assignment_id = p_assignment and seat = p_seat for update;
  if not found then raise exception '找不到這個座號'; end if;
  if v_old = p_status then return null; end if;

  update public.lights set status = p_status, updated_at = now()
   where assignment_id = p_assignment and seat = p_seat;
  insert into public.light_logs (assignment_id, seat, old_status, new_status, actor)
  values (p_assignment, p_seat, v_old, p_status, v_role)
  returning id into v_log;
  return v_log;
end $$;

-- ---------- 撤銷一筆燈號修改 ----------
-- 老師：任何一筆都能撤銷。教室電腦：只能撤銷自己 30 秒內的修改（白板上的「復原」）。
create or replace function public.undo_light_change(p_log bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.my_role();
  r public.light_logs%rowtype;
  v_cur text;
begin
  if v_role is null then raise exception '沒有權限'; end if;

  select * into r from public.light_logs where id = p_log for update;
  if not found then raise exception '找不到這筆紀錄'; end if;
  if r.undone_at is not null then raise exception '這筆已經撤銷過了'; end if;
  if v_role <> 'teacher' and (r.actor <> 'classroom' or r.created_at < now() - interval '30 seconds') then
    raise exception '超過可以復原的時間，請找老師';
  end if;

  select status into v_cur from public.lights
   where assignment_id = r.assignment_id and seat = r.seat for update;
  if v_cur <> r.new_status then raise exception '這顆燈之後又被改過，無法撤銷'; end if;

  update public.lights set status = r.old_status, updated_at = now()
   where assignment_id = r.assignment_id and seat = r.seat;
  update public.light_logs set undone_at = now() where id = p_log;
end $$;

-- 未登入的人不能呼叫修改用的函式
revoke execute on function public.set_light(bigint, int, text) from public, anon;
revoke execute on function public.undo_light_change(bigint) from public, anon;
grant execute on function public.set_light(bigint, int, text) to authenticated;
grant execute on function public.undo_light_change(bigint) to authenticated;

-- ---------- 即時同步：開啟這兩張表的即時通知 ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.assignments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.lights;
  exception when duplicate_object then null;
  end;
end $$;
