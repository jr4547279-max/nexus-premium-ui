-- Phase 1: Real Groups / Circles persistence.
-- Run this once in your Supabase SQL editor:
-- Dashboard → SQL Editor → New query → paste → Run
--
-- This migration is purely additive. It does NOT touch profiles, auth, or any
-- existing tables. Safe to apply on the live database.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.groups (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (char_length(name) between 1 and 80),
  emoji       text                 default '👥',
  created_by  uuid        not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id   uuid        not null references public.groups(id)   on delete cascade,
  user_id    uuid        not null references auth.users(id)      on delete cascade,
  role       text        not null default 'member' check (role in ('owner', 'member')),
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_idx on public.group_members(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Membership helper functions (SECURITY DEFINER avoids RLS recursion)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_owner(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger: creator automatically becomes the group owner
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (group_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_group_created on public.groups;
create trigger on_group_created
  after insert on public.groups
  for each row execute procedure public.handle_new_group();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Row-Level Security
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.groups        enable row level security;
alter table public.group_members enable row level security;

-- groups: visible / editable only by members; owners can update or delete.
drop policy if exists "groups_select_member"  on public.groups;
drop policy if exists "groups_insert_self"    on public.groups;
drop policy if exists "groups_update_owner"   on public.groups;
drop policy if exists "groups_delete_owner"   on public.groups;

create policy "groups_select_member"
  on public.groups for select
  using (public.is_group_member(id));

create policy "groups_insert_self"
  on public.groups for insert
  with check (auth.uid() = created_by);

create policy "groups_update_owner"
  on public.groups for update
  using (public.is_group_owner(id));

create policy "groups_delete_owner"
  on public.groups for delete
  using (public.is_group_owner(id));

-- group_members: members can see the membership of groups they belong to.
-- A user can add themselves (Phase 2 invites will rely on this). A user can
-- always leave a group; owners can remove any member.
drop policy if exists "members_select_same_group" on public.group_members;
drop policy if exists "members_insert_self"       on public.group_members;
drop policy if exists "members_delete_self_or_owner" on public.group_members;

create policy "members_select_same_group"
  on public.group_members for select
  using (public.is_group_member(group_id));

create policy "members_insert_self"
  on public.group_members for insert
  with check (auth.uid() = user_id);

create policy "members_delete_self_or_owner"
  on public.group_members for delete
  using (auth.uid() = user_id or public.is_group_owner(group_id));
