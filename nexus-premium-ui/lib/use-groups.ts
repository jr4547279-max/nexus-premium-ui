'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './auth-context'
import { listMyGroups, type GroupSummary } from './group-service'

export function useGroups() {
  const { session } = useAuth()
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!session) {
      setGroups([])
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const rows = await listMyGroups()
      setGroups(rows)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to load your groups.'
      console.error('[useGroups] refresh failed', caught)
      setError(message)
      setGroups((current) => current ?? [])
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { groups, loading, error, refresh }
}
