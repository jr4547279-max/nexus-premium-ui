-- Phase 2: group invites + real membership listing.
-- Run this once in Supabase SQL Editor → New query → Run.
--
-- Adds:
--   • groups.invite_code (auto-generated 8-char code, unique)
--   • public.get_group_by_invite(code)   — preview a group by code (any user)
--   • public.join_group_by_invite(code)  — join as member (signed-in users)
--   • public.list_group_members(gid)     — return members + display_name

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. invite_code column + generator
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.groups
  add column if not exists invite_code text unique;

create or replace function public.gen_invite_code()
returns text
language sql
volatile
as $$
  select upper(substr(
    translate(encode(gen_random_bytes(8), 'base64'), '+/=', 'xyz'),
    1, 8
  ));
$$;

-- Backfill any existing rows that were created before this migration.
update public.groups
   set invite_code = public.gen_invite_code()
 where invite_code is null;

-- Auto-set invite_code for new inserts.
create or replace function public.set_group_invite_code()
returns trigger
language plpgsql
as $$
begin
  if new.invite_code is null then
    new.invite_code := public.gen_invite_code();
  end if;
  return new;
end;
$$;

drop trigger if exists set_invite_code_before_insert on public.groups;
create trigger set_invite_code_before_insert
  before insert on public.groups
  for each row execute procedure public.set_group_invite_code();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_group_by_invite — minimal preview, callable by anyone (even anon).
--    Returns only name + emoji + member count, NOT the full row. This lets
--    /invite/[code] show "Join 👥 Friday Drinks (3 members)" before sign-in.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_group_by_invite(p_code text)
returns table (
  id           uuid,
  name         text,
  emoji        text,
  member_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select g.id,
         g.name,
         coalesce(g.emoji, '👥') as emoji,
         (select count(*) from public.group_members where group_id = g.id) as member_count
    from public.groups g
   where g.invite_code = upper(trim(p_code))
   limit 1;
$$;

grant execute on function public.get_group_by_invite(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. join_group_by_invite — adds caller as 'member'. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.join_group_by_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_gid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated'
      using hint = 'Sign in before joining a group';
  end if;

  select id into v_gid
    from public.groups
   where invite_code = upper(trim(p_code))
   limit 1;

  if v_gid is null then
    raise exception 'invalid_invite'
      using hint = 'No group found for that invite code';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_gid, v_uid, 'member')
  on conflict (group_id, user_id) do nothing;

  return v_gid;
end;
$$;

grant execute on function public.join_group_by_invite(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. list_group_members — joins group_members with profiles so the UI can
--    render real names/emails. Caller must be a member of the group.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.list_group_members(p_group_id uuid)
returns table (
  user_id      uuid,
  role         text,
  joined_at    timestamptz,
  display_name text,
  email        text
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
    select gm.user_id,
           gm.role,
           gm.joined_at,
           p.display_name,
           p.email
      from public.group_members gm
      left join public.profiles p on p.id = gm.user_id
     where gm.group_id = p_group_id
     order by gm.joined_at asc;
end;
$$;

grant execute on function public.list_group_members(uuid) to authenticated;
