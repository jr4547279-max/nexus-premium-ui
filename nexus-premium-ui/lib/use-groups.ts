'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './auth-context'
import { listMyGroups, type GroupSummary } from './group-service'

/**
 * Loads the signed-in user's groups from Supabase. Returns `null` while the
 * initial load is in-flight so callers can decide whether to fall back to
 * mock data ONLY when the real list is empty (not while loading).
 */
export function useGroups() {
  const { session } = useAuth()
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!session) {
      setGroups([])
      setLoading(false)
      return
    }
    setLoading(true)
    const rows = await listMyGroups()
    setGroups(rows)
    setLoading(false)
  }, [session])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { groups, loading, refresh }
}
