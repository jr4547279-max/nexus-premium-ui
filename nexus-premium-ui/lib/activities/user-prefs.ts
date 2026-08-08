'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ActivityId, UserActivityPrefs } from './types'

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'nexus.activityPrefs'
const MAX_RECENTS = 5

function readPrefs(): UserActivityPrefs {
  if (typeof window === 'undefined') return { recents: [], favourites: [] }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { recents: [], favourites: [] }
    const parsed = JSON.parse(raw) as Partial<UserActivityPrefs>
    return {
      recents: Array.isArray(parsed.recents) ? parsed.recents : [],
      favourites: Array.isArray(parsed.favourites) ? parsed.favourites : [],
    }
  } catch {
    return { recents: [], favourites: [] }
  }
}

function writePrefs(prefs: UserActivityPrefs): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // localStorage unavailable — silently continue
  }
}

// ─── Imperative helpers ───────────────────────────────────────────────────────

/** Returns current prefs without triggering any React state. */
export function getUserActivityPrefs(): UserActivityPrefs {
  return readPrefs()
}

/**
 * Records an activity as the most recent pick.
 * Deduplicates and caps the list at MAX_RECENTS.
 */
export function addRecentActivity(id: ActivityId): void {
  const prefs = readPrefs()
  const filtered = prefs.recents.filter((r) => r !== id)
  writePrefs({ ...prefs, recents: [id, ...filtered].slice(0, MAX_RECENTS) })
}

/** Toggles a favourite. Returns the new isFavourite value. */
export function toggleFavourite(id: ActivityId): boolean {
  const prefs = readPrefs()
  const isFav = prefs.favourites.includes(id)
  const next = isFav
    ? prefs.favourites.filter((f) => f !== id)
    : [...prefs.favourites, id]
  writePrefs({ ...prefs, favourites: next })
  return !isFav
}

/** Returns true when the given activity is a favourite. */
export function isFavourite(id: ActivityId): boolean {
  return readPrefs().favourites.includes(id)
}

// ─── React hook ───────────────────────────────────────────────────────────────

export interface UseActivityPrefsReturn {
  recents: ActivityId[]
  favourites: ActivityId[]
  addRecent: (id: ActivityId) => void
  toggleFav: (id: ActivityId) => void
  isFav: (id: ActivityId) => boolean
}

export function useActivityPrefs(): UseActivityPrefsReturn {
  const [prefs, setPrefs] = useState<UserActivityPrefs>(() => readPrefs())

  // Keep in sync when another tab or component modifies localStorage.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPrefs(readPrefs())
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const addRecent = useCallback((id: ActivityId) => {
    addRecentActivity(id)
    setPrefs(readPrefs())
  }, [])

  const toggleFav = useCallback((id: ActivityId) => {
    toggleFavourite(id)
    setPrefs(readPrefs())
  }, [])

  const isFav = useCallback(
    (id: ActivityId) => prefs.favourites.includes(id),
    [prefs.favourites]
  )

  return { recents: prefs.recents, favourites: prefs.favourites, addRecent, toggleFav, isFav }
}
