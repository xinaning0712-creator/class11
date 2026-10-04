-- ============================================================
-- 最閃亮的11班：資料庫設定（扭蛋機）
-- 使用方式：整份複製，貼到 Supabase 的 SQL Editor（New query），按 Run。
-- ============================================================

-- ---------- 獎品 ----------
create table if not exists public.prizes (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) > 0),
  stock int not null default 0 check (stock >= 0),
  weight numeric(10, 2) not null default 1 check (weight >= 0),   -- 比重，越大越容易抽中
  low_stock_alert int not null default 2 check (low_stock_alert >= 0),  -- 庫存 ≤ 這個數字就提醒
  active boolean not null default true,     -- false = 已從後台移除
  created_at timestamptz not null default now()
);
alter table public.prizes enable row level security;

-- ---------- 懲罰項目 ----------
create table if not exists public.punishments (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) > 0),
  weight numeric(10, 2) not null default 1 check (weight >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.punishments enable row level security;

-- ---------- 抽獎紀錄 ----------
create table if not exists public.draws (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('reward', 'punish')),
  seat int not null check (seat between 1 and 24),
  item_id bigint not null,          -- 獎品或懲罰項目的編號
  item_name text not null,          -- 抽中當下的名稱（之後改名也不影響紀錄）
  actor text not null,
  undone_at timestamptz,            -- 有值 = 已撤銷
  completed_at timestamptz          -- 懲罰：有值 = 已完成
);
alter table public.draws enable row level security;

-- ---------- 權限：只有老師能看、能改 ----------
drop policy if exists "老師管理獎品" on public.prizes;
create policy "老師管理獎品" on public.prizes for all to authenticated
  using (public.my_role() = 'teacher') with check (public.my_role() = 'teacher');

drop policy if exists "老師管理懲罰" on public.punishments;
create policy "老師管理懲罰" on public.punishments for all to authenticated
  using (public.my_role() = 'teacher') with check (public.my_role() = 'teacher');

drop policy if exists "老師看抽獎紀錄" on public.draws;
create policy "老師看抽獎紀錄" on public.draws for select to authenticated
  using (public.my_role() = 'teacher');

-- ---------- 扭蛋機現在能不能抽（給扭蛋頁顯示「補貨中」用） ----------
create or replace function public.gacha_status() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'reward', exists (select 1 from public.prizes where active and stock > 0 and weight > 0),
    'punish', exists (select 1 from public.punishments where active and weight > 0)
  )
$$;

-- ---------- 抽扭蛋 ----------
-- 依比重隨機抽；獎品抽中庫存 -1，沒庫存的自動不參加。
-- 獎品中途抽完時會停下來，只回傳已抽到的部分。
create or replace function public.draw_gacha(p_kind text, p_seat int, p_count int)
returns table (r_draw_id bigint, r_item text)
language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.my_role();
  v_total numeric;
  v_pick numeric;
  v_id bigint;
  v_name text;
  i int;
begin
  if v_role is null then raise exception '這台裝置不能抽扭蛋'; end if;
  if p_kind not in ('reward', 'punish') then raise exception '扭蛋機種類不正確'; end if;
  if p_seat is null or p_seat not between 1 and 24 then raise exception '請先選座號'; end if;
  if p_count is null or p_count not between 1 and 100 then raise exception '一次可以抽 1 到 100 次'; end if;

  if p_kind = 'reward' then
    perform 1 from public.prizes where active for update;   -- 鎖住，避免兩台同時抽到最後一個
  end if;

  for i in 1 .. p_count loop
    if p_kind = 'reward' then
      select sum(weight) into v_total from public.prizes where active and stock > 0 and weight > 0;
    else
      select sum(weight) into v_total from public.punishments where active and weight > 0;
    end if;
    exit when v_total is null or v_total <= 0;

    v_pick := random()::numeric * v_total;

    if p_kind = 'reward' then
      select t.id, t.name into v_id, v_name from (
        select p.id, p.name, sum(p.weight) over (order by p.id) as cum
          from public.prizes p where p.active and p.stock > 0 and p.weight > 0
      ) t where t.cum > v_pick order by t.cum limit 1;
      update public.prizes set stock = stock - 1 where id = v_id;
    else
      select t.id, t.name into v_id, v_name from (
        select p.id, p.name, sum(p.weight) over (order by p.id) as cum
          from public.punishments p where p.active and p.weight > 0
      ) t where t.cum > v_pick order by t.cum limit 1;
    end if;

    insert into public.draws (kind, seat, item_id, item_name, actor)
    values (p_kind, p_seat, v_id, v_name, v_role)
    returning id into r_draw_id;
    r_item := v_name;
    return next;
  end loop;
end $$;

-- ---------- 撤銷一筆抽獎（獎品會自動加回庫存） ----------
create or replace function public.undo_draw(p_draw bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r public.draws%rowtype;
begin
  if public.my_role() is distinct from 'teacher' then raise exception '只有老師可以撤銷'; end if;
  select * into r from public.draws where id = p_draw for update;
  if not found then raise exception '找不到這筆紀錄'; end if;
  if r.undone_at is not null then raise exception '這筆已經撤銷過了'; end if;
  update public.draws set undone_at = now() where id = p_draw;
  if r.kind = 'reward' then
    update public.prizes set stock = stock + 1 where id = r.item_id;
  end if;
end $$;

-- ---------- 懲罰：標記完成／取消完成 ----------
create or replace function public.set_punishment_done(p_draw bigint, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'teacher' then raise exception '只有老師可以修改'; end if;
  update public.draws
     set completed_at = case when p_done then now() else null end
   where id = p_draw and kind = 'punish';
end $$;

revoke execute on function public.draw_gacha(text, int, int) from public, anon;
revoke execute on function public.undo_draw(bigint) from public, anon;
revoke execute on function public.set_punishment_done(bigint, boolean) from public, anon;
grant execute on function public.draw_gacha(text, int, int) to authenticated;
grant execute on function public.undo_draw(bigint) to authenticated;
grant execute on function public.set_punishment_done(bigint, boolean) to authenticated;

-- ---------- 即時同步 ----------
do $$
declare t text;
begin
  foreach t in array array['prizes', 'punishments', 'draws'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
