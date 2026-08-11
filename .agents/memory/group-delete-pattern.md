---
name: Group delete pattern
description: How group deletion is implemented — RPC pattern, cascade chain, UI wiring, and the groupsVersion remount mechanism.
---

## Ownership representation
- `group_members.role = 'owner'` — set by the `handle_new_group` trigger when group is created.
- `public.is_group_owner(gid uuid)` SECURITY DEFINER function (migration 002) checks this.
- `groups.created_by` also records the creator UUID, but ownership checks use `group_members.role`.

## Deletion RPC
- `public.delete_group(p_group_id uuid)` — added in migration 007.
- SECURITY DEFINER, calls `auth.uid()` + `is_group_owner()` before deleting.
- Non-owners get a `not_owner` exception; unauthenticated callers get `not_authenticated`.
- The existing RLS policy `groups_delete_owner` (migration 002) is a second layer.
- Client calls: `supabase.rpc('delete_group', { p_group_id: groupId })`.

## Cascade chain (all ON DELETE CASCADE, no manual cleanup needed)
- `groups` → `group_members`, `availability`, `live_events`
- `live_events` → `live_locations`, `member_presence`, `event_notifications`
- Golden window data + planning location + invite_code are inline in the `groups` row.
- `profiles` is NOT affected (FK goes `profiles.id → auth.users`, independent of groups).

**Why:** All dependent tables were already defined with `ON DELETE CASCADE` in migrations 002, 005, 006. The RPC just deletes the `groups` row; the DB handles the rest atomically.

## UI wiring
- Delete/Leave buttons live in the Preferences tab ("Group Actions" section at the bottom).
- Shown only in `realMode && !loading` and only to eligible users (isOwner → Delete, canLeave → Leave).
- Confirmation uses Radix AlertDialog (already in `components/ui/alert-dialog.tsx`).
- Success toast via Sonner, then `onGroupDeleted()` callback.

## groupsVersion remount mechanism
- `nexus-app.tsx` already had `groupsVersion` state used to remount `GroupsScreen`/`Dashboard` via `key={groups-${groupsVersion}}`.
- `onGroupDeleted` prop on GroupDetail bumps `groupsVersion` + navigates back to `prevGroupScreen`.
- This forces a fresh `useGroups()` fetch so the deleted group disappears from the list immediately.

**Why:** Without the version bump, the groups screen would show stale React state (the deleted group) until the user manually refreshed.

## Migration to apply
- `supabase/migrations/007_delete_group.sql` — must be run in Supabase SQL Editor once.
