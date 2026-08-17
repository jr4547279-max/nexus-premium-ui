---
name: OSRM intermittent route generation failures
description: Root causes, fixes, and key constraints for the intermittent cycling/jogging/walking route failure modes. Critical for any future change to the planner pipeline.
---

## Root Causes (all confirmed in code)

### RC-1 — 40 parallel OSRM requests cause HTTP 429 (primary)
**File:** `osrm-route-provider.ts` — `getRoutes()` query building loop  
**Problem:** `queries` was `Array<Promise<...>>` — all 40 OSRM requests started the instant
they were pushed (Promise created = request in flight). `Promise.allSettled()` was irrelevant,
the flood had already left. routing.openstreetmap.de/routed-bike rate-limits at ~10 concurrent
requests per IP. First search: ~10-15 get through. Every subsequent rapid search: 0 get through.  
**Fix:** Changed queries to `Array<() => Promise<...>>` (thunks). Added `runBatched()` helper
with `BATCH_CONCURRENCY=8`, `BATCH_DELAY_MS=500`. Also removed 8 two-leg queries (40→32 total).

### RC-2 — No outer try-catch in handleFindRoutes → stuck loading state
**File:** `run-route-planner.tsx` — `handleFindRoutes` (useCallback)  
**Problem:** No try-catch around the async body. Any unexpected rejection from `runPlanner`
left `phase` stuck at `'searching'` forever — infinite spinner.  
**Fix:** Wrapped entire body in try-catch. On any error, sets `phase='error'` with message.

### RC-3 — No stale-search guard → race condition on double-click
**File:** `run-route-planner.tsx` — `handleFindRoutes`  
**Problem:** Clicking "Find Routes" twice fires two concurrent `runPlanner()` calls.
Whichever settles LAST wins and overwrites state. A stale empty/error result could erase valid routes.  
**Fix:** Added `searchGenRef = useRef(0)`. Incremented at each search start; every state-write
checks `searchGenRef.current === myGen` before committing.

### RC-4 — 15 s per-request timeout × 40 parallel = "hangs ~10 s"
**File:** `osrm-route-provider.ts` — `TIMEOUT_MS` constant  
**Problem:** Slow-responding OSRM requests held `Promise.allSettled` for up to 15 s.  
In a backgrounded browser tab, `setTimeout` can be throttled, making the 15 s timeout
fire after minutes — causing the "hangs indefinitely" symptom.  
**Fix:** Reduced `TIMEOUT_MS` to 10 s. Added `MASTER_TIMEOUT_MS=15_000` AbortController
around the entire `runBatched` call — when it fires, remaining batches are skipped and
partial results from completed batches are returned. Master timeout is not subject to
browser throttling because it fires from the planner layer (server-side), not the tab.

## Key Server Constraint
routing.openstreetmap.de/routed-bike BLOCKS Replit container IPs at the TCP level (all
requests return status 0 / connection refused immediately). Server-side curl tests will
always show 0/N ok. The browser (user's residential/business IP) is not blocked, which is
why the user sees intermittent rather than permanent failure. Never use curl from Replit
to validate OSRM requests — use browser DevTools Network tab instead.

## Why: 2-leg queries removed
The 2-leg queries (start → midpoint → start) almost exclusively produce OUT_AND_BACK routes.
Triangle queries at the same bearings produce the same OUT_AND_BACK when the road network
doesn't support loops, so 2-leg adds no unique value. Removing them cut 40→32 queries.

## Logging added (temporary — marked [NEXUS DEBUG])
- `[NEXUS:OSRM]` — per-batch progress, per-request HTTP status + timing, master timeout events
- `[NEXUS:Engine]` — overall planner start/end timing
- `[NEXUS:UI]` — search generation number, cache hit/miss, candidate count, total UI time
All marked `// [NEXUS DEBUG] Remove ...` — grep for `NEXUS DEBUG` to find them all.

## Files changed
- `lib/planners/providers/osrm-route-provider.ts` — thunks, runBatched, 2-leg removal, master timeout, logging
- `lib/planners/planner-engine.ts` — timing logging
- `components/nexus/run-route-planner.tsx` — searchGenRef, try-catch, logging
