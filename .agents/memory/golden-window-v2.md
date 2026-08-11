---
name: Golden Window v2 architecture
description: Persistence + progressive scoring model; key decisions for future changes. Includes single-member (Personal Golden Window) support and the availability RPC fix.
---

## Core algorithm (`lib/golden-window.ts`)
- Sweep-line over each day-of-week availability grid.
- `minMembers`: for 1-member groups → 1; for 2+ member groups → 2 (not hardcoded to 2 any more).
- `match_quality` tiers: perfect | strong | partial | compromise.
- Compromise windows require 2+ member availability — single-member groups never get them.
- Never returns empty when meaningful data exists.

## Single-member (Personal Golden Window) support
- `computeGoldenWindows`: `minMembers = options.minMembers ?? (total === 1 ? 1 : 2)`.
- `checkGoldenWindowRequirements`: single-member branch needs only that member to have ≥1 slot.
  - `canCompute: true` as soon as 1 slot exists. Empty state: "Add your availability to find your Golden Window."
- Scoring for 1-of-1: coverage=1.0 → confidence = 70 + durFactor*30 (same formula). fairness = 100. match_quality = 'perfect'.
- No artificial penalty for being solo.

**Why:** Product principle — a Golden Window should not require multiple people.

## UI language adaptation (`group-detail.tsx`)
- GW card header: "Your Golden Window ✨" when `total_member_count === 1`.
- Free indicator: "You're free" when 1-of-1; "X of Y free" for groups.
- CTA description / button label: solo variants ("Find My Golden Window", "your best available time").
- Planner descriptions: "for you" / "near you" vs "for your group" / "near your group".
- **Do NOT** create a separate GW UI — the single component handles both cases via conditionals.

## Critical: getGroupAvailability must use direct table query, NOT the RPC

**The `list_group_availability` SECURITY DEFINER RPC fails for authenticated clients** in some Supabase configurations: `auth.uid()` inside SECURITY DEFINER returns null → `is_group_member` returns false → `not_a_member` exception → silently returns `[]`.

**Fix (in `availability-service.ts`):**
- Primary: query `availability` table directly with `.from('availability').select(...).eq('group_id', groupId)`
- Enrich display names via `profiles` table (best-effort; each user can only read their own profile row)
- Fallback: RPC if direct query fails

**Why this works:** The `availability_select_group_member` RLS policy (`using (is_group_member(group_id))`) evaluates `is_group_member` correctly for authenticated client sessions. Same mechanism used by `getMyAvailability` and `saveAvailability`.

**Impact of profiles RLS:** Only the current user's display_name resolves. Other members show as null → "Member" in the editor summary. The GW engine never uses display_name, so this doesn't affect calculations.

## Persistence
- `loadSavedGoldenWindow(groupId)` / `saveGoldenWindow(groupId, window)` — Supabase `groups.golden_window_data` column.
- `markGoldenWindowStale(groupId)` — called after availability save; triggers stale banner.
- DB save fires in the background while the 3-second cinematic overlay plays.

## Reveal state machine
- States: idle → searching → closing → revealed.
- Modes: cinematic (first discovery) | instant (DB-loaded or reduced-motion).
- `sessionStorage` key `nexus:revealed:{groupId}` prevents cinematic replay within a session.

## Compromise window algorithm
- Requires 2+ member availability on the day.
- Median centre-of-availability across members (even-n uses arithmetic mean of two middle elements — avoids bias toward later member).
- Single-member groups skip this path entirely.
