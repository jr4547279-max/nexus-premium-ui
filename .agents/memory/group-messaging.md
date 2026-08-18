---
name: Nexus Group Messaging
description: Real-time group chat architecture — table, service, component, system messages.
---

# Group Messaging System

## What was built
- `supabase/group_messages_migration.sql` — table + RLS + realtime publication
- `lib/message-service.ts` — fetch, send, sendSystemMessage, subscribeToMessages
- `components/nexus/group-chat.tsx` — full chat UI with bubbles, system messages, date dividers
- `group-detail.tsx` — added Chat tab (4th, real groups only); activeSection type extended
- `group-service.ts` — sendSystemMessage fired after createGroup and joinGroupByInvite

## Key decisions

**System messages use `user_id = auth.uid()`** — RLS requires every INSERT to have user_id = auth.uid(). System messages are attributed to the triggering user with `message_type = 'system'` to distinguish rendering. NULL user_id is not allowed by the INSERT policy.

**Why**: Supabase RLS cannot grant INSERT with NULL user_id without a SECURITY DEFINER function. Attributing to the triggering user is correct semantically anyway (they performed the action).

**Real-time hydration pattern**: On CDC INSERT event, do a second single-row fetch with profile join (`fetchMessageById`). The raw CDC payload has no joined columns.

**Why**: Supabase postgres_changes payload only returns the raw table row; no joins. The follow-up fetch is fast (single row, indexed by PK).

**Message grouping**: Consecutive messages from same user within 5 minutes suppress avatar/name repeat. System messages always break a group.

**Future-ready fields**: `message_type` CHECK constraint covers text, system, route, location, poll, image. `metadata JSONB` carries structured payloads (reactions, route_id, poll data, event key).

## Setup required (one-time)
Run `supabase/group_messages_migration.sql` in the Supabase SQL Editor. Without this:
- group_messages table doesn't exist → chat tab crashes on load
- Real-time publication not set → subscriptions silently return nothing

## Chat tab placement
Chat tab is the 4th tab, only shown for real groups (UUID group IDs). The tab bar is now `overflow-x-auto` to handle 4 tabs on narrow screens.
