'use client'

/**
 * useLiveEvent (Phase 1A)
 *
 * Single React hook that wires together the Live Event Engine:
 *   - Fetches event, presence, locations, and notifications on mount
 *   - Supabase Realtime subscriptions (live_events, live_locations,
 *     member_presence, event_notifications) with automatic cleanup
 *   - 30-second polling for automatic pending→live→ended transitions
 *   - 1-second countdown timer (time to start / time to end)
 *   - Location tracking (startSharing / stopSharing)
 *   - Presence actions (markArrived, markRunningLate, leaveEvent)
 *   - Host actions (skipStop, delayStop, endEvent, sharePlan)
 *
 * All returned values are typed. No UI — pure state and actions.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

// Services
import {
  getLiveEvent,
  listGroupLiveEvents,
  getActiveEventForGroup,
  getPendingEventForGroup,
  activateDueEvents,
  deactivateExpiredEvents,
  cancelLiveEvent,
  skipStop,
  delayStop,
  endEvent,
  sharePlan,
} from '@/lib/live-event-service'
import {
  getLatestLocations,
  startLocationTracking,
  stopLocationTracking,
  requestLocationPermission,
} from '@/lib/location-service'
import {
  getGroupPresence,
  markArrived,
  markRunningLate,
  leaveEvent as leaveEventPresence,
  updatePresenceFromLocation,
} from '@/lib/presence-service'
import {
  getEventNotifications,
  notifyMemberArrived,
  notifyMemberLate,
  notifyMemberLeft,
} from '@/lib/notification-service'

// Types
import type {
  LiveEvent,
  LiveEventWithDetails,
  MemberPresence,
  LatestLocation,
  EventNotification,
  EventStop,
  CountdownData,
  LiveEventStatus,
  LocationPermissionStatus,
} from '@/lib/live-event-types'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS      = 30_000
const COUNTDOWN_INTERVAL_MS = 1_000

// ─────────────────────────────────────────────────────────────────────────────
// Public return type
// ─────────────────────────────────────────────────────────────────────────────

export interface UseLiveEventReturn {
  // ── Core state ─────────────────────────────────────────────────────────────
  /** Full event record (with presence, locations, notifications). */
  event:         LiveEventWithDetails | null
  /** Shorthand status ('pending' | 'live' | 'ended' | 'cancelled' | null). */
  status:        LiveEventStatus | null
  /** True while the event window is open. */
  isLive:        boolean
  /** The stop the group is currently at, or null. */
  currentStop:   EventStop | null
  /** Countdown to event start (pending) or event end (live). */
  countdown:     CountdownData | null
  /** All events for the group (newest first). */
  allEvents:     LiveEvent[]
  /** Loading state. */
  isLoading:     boolean
  /** Last error message, or null. */
  error:         string | null

  // ── Presence ───────────────────────────────────────────────────────────────
  /** All members' presence rows, with stale members shown as 'offline'. */
  members:       MemberPresence[]
  /** The current user's own presence row. */
  presence:      MemberPresence | null

  // ── Location ───────────────────────────────────────────────────────────────
  /** Latest GPS fix per member. */
  locations:     LatestLocation[]
  /** Whether location tracking is active for this session. */
  isSharing:     boolean
  locationPermission: LocationPermissionStatus

  // ── Notifications ──────────────────────────────────────────────────────────
  notifications: EventNotification[]

  // ── Member actions ─────────────────────────────────────────────────────────
  startSharing:    () => Promise<void>
  stopSharing:     () => void
  markArrived:     () => Promise<void>
  markRunningLate: () => Promise<void>
  leaveEvent:      () => Promise<void>

  // ── Host actions ───────────────────────────────────────────────────────────
  skipStop:    () => Promise<void>
  delayStop:   (minutes: number) => Promise<void>
  endEvent:    () => Promise<void>
  sharePlan:   () => Promise<void>
  cancelEvent: () => Promise<void>

  // ── Utilities ──────────────────────────────────────────────────────────────
  refresh:     () => Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Countdown helper (pure)
// ─────────────────────────────────────────────────────────────────────────────

function buildCountdown(event: LiveEvent, now: Date): CountdownData | null {
  const isLive   = event.status === 'live'
  const isPending = event.status === 'pending'
  if (!isLive && !isPending) return null

  const target     = new Date(isLive ? event.window_end : event.window_start)
  const totalSecs  = Math.floor((target.getTime() - now.getTime()) / 1_000)
  const absSecs    = Math.abs(totalSecs)
  const hours      = Math.floor(absSecs / 3_600)
  const minutes    = Math.floor((absSecs % 3_600) / 60)
  const seconds    = absSecs % 60

  return {
    totalSeconds: totalSecs,
    hours,
    minutes,
    seconds,
    label: isLive ? 'Ends in' : 'Starts in',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useLiveEvent(groupId: string | null | undefined): UseLiveEventReturn {
  const { user } = useAuth()

  // ── State ─────────────────────────────────────────────────────────────────
  const [event,               setEvent]               = useState<LiveEventWithDetails | null>(null)
  const [allEvents,           setAllEvents]           = useState<LiveEvent[]>([])
  const [members,             setMembers]             = useState<MemberPresence[]>([])
  const [locations,           setLocations]           = useState<LatestLocation[]>([])
  const [notifications,       setNotifications]       = useState<EventNotification[]>([])
  const [countdown,           setCountdown]           = useState<CountdownData | null>(null)
  const [isLoading,           setIsLoading]           = useState(true)
  const [error,               setError]               = useState<string | null>(null)
  const [isSharing,           setIsSharing]           = useState(false)
  const [locationPermission,  setLocationPermission]  = useState<LocationPermissionStatus>('unknown')

  // ── Refs ──────────────────────────────────────────────────────────────────
  const mountedRef        = useRef(true)
  const channelRef        = useRef<RealtimeChannel | null>(null)
  const pollTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Cache the current event for use inside callbacks without stale closures.
  const eventRef          = useRef<LiveEventWithDetails | null>(null)
  const presenceRef       = useRef<MemberPresence | null>(null)

  // ── Derived ───────────────────────────────────────────────────────────────
  const status      = event?.status ?? null
  const isLive      = status === 'live'
  const currentStop = useMemo<EventStop | null>(() => {
    if (!event) return null
    return event.stops[event.current_stop_index] ?? null
  }, [event])

  const presence = useMemo<MemberPresence | null>(
    () => members.find((m) => m.user_id === user?.id) ?? null,
    [members, user?.id],
  )

  // Keep refs current.
  useEffect(() => { eventRef.current    = event    }, [event])
  useEffect(() => { presenceRef.current = presence }, [presence])

  // ── fetchData ─────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!groupId) {
      setEvent(null)
      setAllEvents([])
      setMembers([])
      setLocations([])
      setNotifications([])
      setIsLoading(false)
      return
    }

    try {
      // Run state-machine sweep first so data is current.
      await Promise.all([activateDueEvents(), deactivateExpiredEvents()])

      // Find the most relevant event: live first, then next pending.
      const [liveEvent, allEvts] = await Promise.all([
        getActiveEventForGroup(groupId),
        listGroupLiveEvents(groupId),
      ])

      const targetEvent = liveEvent ?? (await getPendingEventForGroup(groupId))

      if (!mountedRef.current) return
      setAllEvents(allEvts)

      if (!targetEvent) {
        setEvent(null)
        setMembers([])
        setLocations([])
        setNotifications([])
        setIsLoading(false)
        return
      }

      // Fetch full detail in parallel.
      const [full, pres, locs, notifs] = await Promise.all([
        getLiveEvent(targetEvent.id),
        getGroupPresence(targetEvent.id),
        getLatestLocations(targetEvent.id),
        getEventNotifications(targetEvent.id),
      ])

      if (!mountedRef.current) return
      if (full) setEvent(full)
      setMembers(pres)
      setLocations(locs)
      setNotifications(notifs)
      setError(null)
    } catch (err) {
      if (!mountedRef.current) return
      const msg = err instanceof Error ? err.message : 'Failed to load live event'
      console.error('[useLiveEvent] fetchData error', err)
      setError(msg)
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [groupId])

  // ── Realtime subscription ─────────────────────────────────────────────────

  const subscribe = useCallback(() => {
    if (!groupId || !isSupabaseConfigured) return

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current).catch(() => {})
      channelRef.current = null
    }

    const channel = supabase
      .channel(`live-event-engine:${groupId}`)
      // live_events — filtered to this group
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_events', filter: `group_id=eq.${groupId}` },
        () => { fetchData() },
      )
      // member_presence — no group_id column; re-fetch handles filtering
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'member_presence' },
        (payload) => {
          const ev = eventRef.current
          if (!ev) return
          const row = (payload.new ?? payload.old) as { event_id?: string } | null
          if (row?.event_id !== ev.id) return
          getGroupPresence(ev.id).then((p) => {
            if (mountedRef.current) setMembers(p)
          })
        },
      )
      // live_locations
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_locations' },
        (payload) => {
          const ev = eventRef.current
          if (!ev) return
          const row = payload.new as { event_id?: string } | null
          if (row?.event_id !== ev.id) return
          getLatestLocations(ev.id).then((l) => {
            if (mountedRef.current) setLocations(l)
          })
        },
      )
      // event_notifications
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'event_notifications' },
        (payload) => {
          const ev = eventRef.current
          if (!ev) return
          const row = payload.new as EventNotification & { event_id?: string }
          if (row.event_id !== ev.id) return
          setNotifications((prev) => [row, ...prev].slice(0, 50))
        },
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[useLiveEvent] realtime subscribed for group ${groupId}`)
        }
        if (status === 'CHANNEL_ERROR') {
          console.warn('[useLiveEvent] realtime channel error', err)
        }
      })

    channelRef.current = channel
  }, [groupId, fetchData])

  // ── Countdown timer ───────────────────────────────────────────────────────

  const startCountdown = useCallback(() => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    countdownTimerRef.current = setInterval(() => {
      const ev = eventRef.current
      if (!ev) { setCountdown(null); return }
      setCountdown(buildCountdown(ev, new Date()))
    }, COUNTDOWN_INTERVAL_MS)
  }, [])

  // ── Polling for state transitions ─────────────────────────────────────────

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    pollTimerRef.current = setInterval(async () => {
      if (!mountedRef.current) return
      const [activated, deactivated] = await Promise.all([
        activateDueEvents(),
        deactivateExpiredEvents(),
      ])
      if ((activated > 0 || deactivated > 0) && mountedRef.current) {
        fetchData()
      }
    }, POLL_INTERVAL_MS)
  }, [fetchData])

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true
    setIsLoading(true)

    fetchData()
    subscribe()
    startCountdown()
    startPolling()

    return () => {
      mountedRef.current = false

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(() => {})
        channelRef.current = null
      }
      if (pollTimerRef.current)      { clearInterval(pollTimerRef.current);      pollTimerRef.current      = null }
      if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null }

      // Stop location tracking if it was active for this group's event.
      stopLocationTracking()
    }
  }, [fetchData, subscribe, startCountdown, startPolling])

  // Update countdown whenever the event changes.
  useEffect(() => {
    if (event) setCountdown(buildCountdown(event, new Date()))
    else       setCountdown(null)
  }, [event])

  // ── Member actions ────────────────────────────────────────────────────────

  const handleStartSharing = useCallback(async () => {
    const ev = eventRef.current
    if (!ev || ev.status !== 'live') return

    const perm = await requestLocationPermission()
    setLocationPermission(perm)
    if (perm !== 'granted') return

    setIsSharing(true)

    startLocationTracking(
      ev.id,
      { intervalMs: 7_000, minDistanceM: 10, highAccuracy: true },
      {
        onLocation: async (loc) => {
          const cur = eventRef.current
          if (!cur || !mountedRef.current) return

          const stop = cur.stops[cur.current_stop_index] ?? null
          const updatedPresence = await updatePresenceFromLocation(
            cur.id,
            presenceRef.current,
            loc.latitude,
            loc.longitude,
            stop,
            cur.arrival_radius_metres,
            cur.current_stop_index,
          )

          // Auto-notify on arrival.
          if (
            updatedPresence &&
            updatedPresence.status === 'arrived' &&
            presenceRef.current?.status !== 'arrived' &&
            user
          ) {
            await notifyMemberArrived(
              cur.id,
              user.id,
              user.email ?? 'Someone',
              cur.current_stop_index,
              stop?.name ?? 'the stop',
            )
          }

          setLocations((prev) => {
            const next = prev.filter((l) => l.user_id !== loc.user_id)
            return [loc, ...next]
          })
        },
        onError: (err) => {
          console.error('[useLiveEvent] location error', err)
          setIsSharing(false)
        },
      },
    )
  }, [user])

  const handleStopSharing = useCallback(() => {
    stopLocationTracking()
    setIsSharing(false)
  }, [])

  const handleMarkArrived = useCallback(async () => {
    const ev = eventRef.current
    if (!ev) return
    const stopIdx = ev.current_stop_index
    const stop    = ev.stops[stopIdx]
    const { errorMessage } = await markArrived(ev.id, stopIdx)
    if (errorMessage) { setError(errorMessage); return }
    if (user && stop) {
      await notifyMemberArrived(ev.id, user.id, user.email ?? 'Someone', stopIdx, stop.name)
    }
    await fetchData()
  }, [user, fetchData])

  const handleMarkRunningLate = useCallback(async () => {
    const ev = eventRef.current
    if (!ev) return
    const { errorMessage } = await markRunningLate(ev.id)
    if (errorMessage) { setError(errorMessage); return }
    if (user) {
      await notifyMemberLate(ev.id, user.id, user.email ?? 'Someone')
    }
    await fetchData()
  }, [user, fetchData])

  const handleLeaveEvent = useCallback(async () => {
    const ev = eventRef.current
    if (!ev) return
    handleStopSharing()
    const { errorMessage } = await leaveEventPresence(ev.id)
    if (errorMessage) { setError(errorMessage); return }
    if (user) {
      await notifyMemberLeft(ev.id, user.id, user.email ?? 'Someone')
    }
    await fetchData()
  }, [user, fetchData, handleStopSharing])

  // ── Host actions ──────────────────────────────────────────────────────────

  const handleSkipStop = useCallback(async () => {
    const ev = eventRef.current
    if (!ev) return
    const { errorMessage } = await skipStop(ev.id)
    if (errorMessage) { setError(errorMessage); return }
    await fetchData()
  }, [fetchData])

  const handleDelayStop = useCallback(async (minutes: number) => {
    const ev = eventRef.current
    if (!ev) return
    const { errorMessage } = await delayStop(ev.id, minutes)
    if (errorMessage) { setError(errorMessage); return }
    await fetchData()
  }, [fetchData])

  const handleEndEvent = useCallback(async () => {
    const ev = eventRef.current
    if (!ev) return
    handleStopSharing()
    const { errorMessage } = await endEvent(ev.id)
    if (errorMessage) { setError(errorMessage); return }
    await fetchData()
  }, [fetchData, handleStopSharing])

  const handleSharePlan = useCallback(async () => {
    const ev = eventRef.current
    if (!ev) return
    const { errorMessage } = await sharePlan(ev.id)
    if (errorMessage) { setError(errorMessage); return }
  }, [])

  const handleCancelEvent = useCallback(async () => {
    const ev = eventRef.current
    if (!ev) return
    handleStopSharing()
    const { errorMessage } = await cancelLiveEvent(ev.id)
    if (errorMessage) { setError(errorMessage); return }
    await fetchData()
  }, [fetchData, handleStopSharing])

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    event,
    status,
    isLive,
    currentStop,
    countdown,
    allEvents,
    isLoading,
    error,
    members,
    presence,
    locations,
    isSharing,
    locationPermission,
    notifications,

    startSharing:    handleStartSharing,
    stopSharing:     handleStopSharing,
    markArrived:     handleMarkArrived,
    markRunningLate: handleMarkRunningLate,
    leaveEvent:      handleLeaveEvent,

    skipStop:    handleSkipStop,
    delayStop:   handleDelayStop,
    endEvent:    handleEndEvent,
    sharePlan:   handleSharePlan,
    cancelEvent: handleCancelEvent,

    refresh: fetchData,
  }
}
