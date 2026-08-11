-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 007: delete_group — permanent group deletion by the group owner
-- ─────────────────────────────────────────────────────────────────────────────
-- Run once in Supabase SQL Editor → New query → Run.
--
-- What this migration adds:
--   • public.delete_group(p_group_id uuid) — SECURITY DEFINER RPC
--
-- Data deleted (all via existing ON DELETE CASCADE foreign keys):
--   • groups row (the root)
--     ↳ group_members        (groups.id FK, CASCADE)
--     ↳ availability         (groups.id FK, CASCADE)
--     ↳ live_events          (groups.id FK, CASCADE)
--         ↳ live_locations       (live_events.id FK, CASCADE)
--         ↳ member_presence      (live_events.id FK, CASCADE)
--         ↳ event_notifications  (live_events.id FK, CASCADE)
--   • Inline columns (gone with the row):
--       golden_window_data, golden_window_computed_at, golden_window_stale,
--       invite_code, activity_id,
--       planning_location_lat/lng/name/address/source,
--       planning_radius_metres, planning_area_type,
--       planning_neighborhood, planning_city
--
-- What is NOT deleted:
--   • profiles — independent table (profiles.id → auth.users, not → groups)
--   • auth.users — never touched
--   • Any other user's data in other groups
--
-- Security:
--   • Uses SECURITY DEFINER so PostgREST RLS evaluation cannot race.
--   • Explicitly calls is_group_owner() before deleting — non-owners receive
--     a SQLSTATE exception the client can surface as an error message.
--   • The existing RLS policy "groups_delete_owner" (migration 002) provides
--     a second layer of defence for any direct-table access.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  -- 1. Caller must be authenticated.
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated'
      using hint = 'Sign in before deleting a group';
  end if;

  -- 2. Caller must be the group owner.
  --    is_group_owner() is SECURITY DEFINER (migration 002) and checks
  --    group_members where user_id = auth.uid() and role = 'owner'.
  if not public.is_group_owner(p_group_id) then
    raise exception 'not_owner'
      using hint = 'Only the group owner can delete this group';
  end if;

  -- 3. Delete the group.
  --    All dependent rows are removed automatically via the CASCADE FKs
  --    defined in migrations 002, 005, and 006.
  delete from public.groups where id = p_group_id;

  -- 4. Guard: raise if the row did not exist (already deleted, wrong id, etc.)
  if not found then
    raise exception 'not_found'
      using hint = 'No group found with that ID';
  end if;
end;
$$;

-- Grant execute to the authenticated role so the Supabase JS client can call
-- this via supabase.rpc('delete_group', { p_group_id: '...' }).
-- The anon role is intentionally NOT granted — only signed-in users can delete.
grant execute on function public.delete_group(uuid) to authenticated;
