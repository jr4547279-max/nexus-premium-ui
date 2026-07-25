'use client'

/**
 * useLiveEvent — Phase 6
 *
 * React hook that keeps the live event state for a group up to date via:
 *   1. Initial fetch on mount (with an activation sweep first).
 *   2. Supabase Realtime subscription on live_events + live_event_rsvps.
 *   3. Client-side polling every 30 s that calls activate/deactivate and
 *      refetches only when something actually changed (belt-and-suspenders
 *      when pg_cron is not enabled, or during transient realtime outages).
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import {
  getActiveEventForGroup,
  listGroupLiveEvents,
  activateDueEvents,
  deactivateExpiredEvents,
  cancelLiveEvent,
  rsvpToEvent,
} from '@/lib/live-event-service'
import type { LiveEventWithRsvps, RsvpStatus } from '@/lib/live-event-types'

// How often the hook polls the server for activation state changes.
const POLL_INTERVAL_MS = 30_000

// ─────────────────────────────────────────────────────────────────────────────
// Public interface
// ─────────────────────────────────────────────────────────────────────────────

export interface UseLiveEventReturn {
  /** The currently active live event for this group, or null. */
  activeEvent: LiveEventWithRsvps | null
  /** All live events for this group (all statuses), newest first. */
  allEvents:   LiveEventWithRsvps[]
  /** True while the initial data load is in progress. */
  isLoading:   boolean
  /** Non-null when the last operation failed. */
  error:       string | null
  /** RSVP the current user to the active event. No-op if no active event. */
  rsvp:        (status: RsvpStatus) => Promise<void>
  /** Cancel a specific event by ID (creator/owner only). */
  cancelEvent: (eventId: string) => Promise<void>
  /** Manually trigger a full refresh. */
  refresh:     () => Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useLiveEvent(groupId: string | null | undefined): UseLiveEventReturn {
  const [activeEvent, setActiveEvent] = useState<LiveEventWithRsvps | null>(null)
  const [allEvents,   setAllEvents]   = useState<LiveEventWithRsvps[]>([])
  const [isLoading,   setIsLoading]   = useState(true)
  const [error,       setError]       = useState<string | null>(null)

  const mountedRef   = useRef(true)
  const channelRef   = useRef<RealtimeChannel | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Core fetch (always runs activation sweep first) ──────────────────────

  const fetchData = useCallback(async () => {
    if (!groupId) {
      setActiveEvent(null)
      setAllEvents([])
      setIsLoading(false)
      return
    }

    try {
      // Sweep for activation/deactivation changes before reading.
      await Promise.all([activateDueEvents(), deactivateExpiredEvents()])

      const [active, all] = await Promise.all([
        getActiveEventForGroup(groupId),
        listGroupLiveEvents(groupId),
      ])

      if (!mountedRef.current) return
      setActiveEvent(active)
      setAllEvents(all)
      setError(null)
    } catch (err) {
      if (!mountedRef.current) return
      const msg = err instanceof Error ? err.message : 'Failed to load live events'
      console.error('[useLiveEvent] fetchData error', err)
      setError(msg)
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [groupId])

  // ── Realtime subscription ────────────────────────────────────────────────

  const subscribe = useCallback(() => {
    if (!groupId || !isSupabaseConfigured) return

    // Remove any existing channel first.
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current).catch(() => {})
      channelRef.current = null
    }

    const channel = supabase
      .channel(`live-event:${groupId}`)
      // Watch for any change to live_events rows belonging to this group.
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'live_events',
          filter: `group_id=eq.${groupId}`,
        },
        () => { fetchData() },
      )
      // Watch for RSVP changes. The rsvps table has no group_id column so we
      // listen broadly and rely on the re-fetch to filter correctly.
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'live_event_rsvps',
        },
        () => { fetchData() },
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[useLiveEvent] realtime subscribed for group ${groupId}`)
        }
        if (status === 'CHANNEL_ERROR') {
          console.warn('[useLiveEvent] realtime channel error', err, '— polling will cover it')
        }
      })

    channelRef.current = channel
  }, [groupId, fetchData])

  // ── Polling for automatic activation / deactivation ──────────────────────

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)

    pollTimerRef.current = setInterval(async () => {
      if (!mountedRef.current) return

      const [activated, deactivated] = await Promise.all([
        activateDueEvents(),
        deactivateExpiredEvents(),
      ])

      // Only re-fetch when the sweep actually changed something to avoid
      // unnecessary renders during quiet periods.
      if ((activated > 0 || deactivated > 0) && mountedRef.current) {
        fetchData()
      }
    }, POLL_INTERVAL_MS)
  }, [fetchData])

  // ── Mount / unmount lifecycle ─────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true
    setIsLoading(true)

    fetchData()
    subscribe()
    startPolling()

    return () => {
      mountedRef.current = false

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(() => {})
        channelRef.current = null
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [fetchData, subscribe, startPolling])

  // ── Actions ───────────────────────────────────────────────────────────────

  const rsvp = useCallback(async (status: RsvpStatus): Promise<void> => {
    if (!activeEvent) return

    const { errorMessage } = await rsvpToEvent(activeEvent.id, status)
    if (errorMessage) {
      console.error('[useLiveEvent] rsvp failed', errorMessage)
      setError(errorMessage)
      return
    }
    await fetchData()
  }, [activeEvent, fetchData])

  const cancelEvent = useCallback(async (eventId: string): Promise<void> => {
    const { errorMessage } = await cancelLiveEvent(eventId)
    if (errorMessage) {
      console.error('[useLiveEvent] cancelEvent failed', errorMessage)
      setError(errorMessage)
      return
    }
    await fetchData()
  }, [fetchData])

  return {
    activeEvent,
    allEvents,
    isLoading,
    error,
    rsvp,
    cancelEvent,
    refresh: fetchData,
  }
}
