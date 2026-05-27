-- Phase 3: per-group availability infrastructure.
-- Run once in Supabase SQL Editor → New query → Run.
--
-- Adds:
--   • public.availability table (one row per user × group × time slot)
--   • RLS: users manage own rows; group members can read all rows in their groups
--   • public.save_availability(group_id, slots jsonb) — atomic replace
--   • public.list_group_availability(group_id)       — returns all members' slots
--
-- Phase 3 stops here. No Golden Window computation, no calendar sync.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.availability (
  id           uuid        primary key default gen_random_uuid(),
  group_id     uuid        not null references public.groups(id) on delete cascade,
  user_id      uuid        not null references auth.users(id)    on delete cascade,
  day_of_week  integer     not null check (day_of_week between 0 and 6),
  start_time   text        not null,
  end_time     text        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists availability_group_idx       on public.availability(group_id);
create index if not exists availability_group_user_idx  on public.availability(group_id, user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Row-Level Security
--    • Users manage ONLY their own rows.
--    • Members of a group can READ all availability rows in that group.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.availability enable row level security;

drop policy if exists "availability_select_group_member" on public.availability;
drop policy if exists "availability_insert_self"         on public.availability;
drop policy if exists "availability_update_self"         on public.availability;
drop policy if exists "availability_delete_self"         on public.availability;

create policy "availability_select_group_member"
  on public.availability for select
  using (public.is_group_member(group_id));

create policy "availability_insert_self"
  on public.availability for insert
  with check (auth.uid() = user_id and public.is_group_member(group_id));

create policy "availability_update_self"
  on public.availability for update
  using (auth.uid() = user_id);

create policy "availability_delete_self"
  on public.availability for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. save_availability(group_id, slots) — atomic replace of caller's slots.
--    p_slots is a jsonb array of:
--      { "day_of_week": 0..6, "start_time": "HH:MM", "end_time": "HH:MM" }
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.save_availability(
  p_group_id uuid,
  p_slots    jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_inserted integer := 0;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated'
      using hint = 'Sign in to save availability';
  end if;

  if not public.is_group_member(p_group_id) then
    raise exception 'not_a_member'
      using hint = 'You must be a member of this group';
  end if;

  -- Atomic replace of the caller's slots for this group.
  delete from public.availability
   where group_id = p_group_id
     and user_id  = v_uid;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    return 0;
  end if;

  insert into public.availability (group_id, user_id, day_of_week, start_time, end_time)
  select p_group_id,
         v_uid,
         (slot->>'day_of_week')::int,
         slot->>'start_time',
         slot->>'end_time'
    from jsonb_array_elements(p_slots) as slot
   where (slot->>'day_of_week') is not null
     and (slot->>'start_time')  is not null
     and (slot->>'end_time')    is not null
     and (slot->>'start_time') < (slot->>'end_time');

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

grant execute on function public.save_availability(uuid, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. list_group_availability(group_id) — every member's slots + display_name.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.list_group_availability(p_group_id uuid)
returns table (
  user_id       uuid,
  display_name  text,
  email         text,
  day_of_week   integer,
  start_time    text,
  end_time      text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'not_a_member'
      using hint = 'Only members can view this group';
  end if;

  return query
    select a.user_id,
           p.display_name,
           p.email,
           a.day_of_week,
           a.start_time,
           a.end_time
      from public.availability a
      left join public.profiles p on p.id = a.user_id
     where a.group_id = p_group_id
     order by a.user_id, a.day_of_week, a.start_time;
end;
$$;

grant execute on function public.list_group_availability(uuid) to authenticated;
