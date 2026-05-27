-- Phase 1 patch: SECURITY DEFINER function for safe group creation.
--
-- WHY: PostgREST evaluates RLS `with check` policies before the row is
-- committed, so auth.uid() can appear null inside the policy even when the
-- Supabase JS client has a valid session. A SECURITY DEFINER function runs
-- as the function owner (postgres/service role), bypasses the RLS insert
-- check entirely, but still calls auth.uid() itself — so it is safe: it
-- only ever creates groups for the currently authenticated user.
--
-- The existing handle_new_group trigger still fires after the insert and
-- adds the creator as owner in group_members automatically.
--
-- Run this once in Supabase SQL Editor → New query → Run

create or replace function public.create_group(p_name text, p_emoji text default '👥')
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid;
  v_group public.groups;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated'
      using hint = 'auth.uid() returned null — user must be signed in';
  end if;

  if char_length(trim(p_name)) < 1 then
    raise exception 'invalid_name'
      using hint = 'Group name must not be empty';
  end if;

  insert into public.groups (name, emoji, created_by)
  values (trim(p_name), coalesce(nullif(trim(p_emoji), ''), '👥'), v_uid)
  returning * into v_group;

  -- handle_new_group trigger fires here and inserts (group_id, v_uid, 'owner')
  -- into group_members automatically — no extra insert needed.

  return v_group;
end;
$$;

-- Grant execute to the anon + authenticated roles so the Supabase JS client
-- can call it via supabase.rpc('create_group', ...).
grant execute on function public.create_group(text, text) to anon, authenticated;
