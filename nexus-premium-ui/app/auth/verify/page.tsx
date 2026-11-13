'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { nexusApi } from '@/lib/nexus-api'

function VerifyLink() {
  const search = useSearchParams()
  const router = useRouter()
  const [message, setMessage] = useState('Checking your secure sign-in link…')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const token = search.get('token')
    if (!token) { setFailed(true); setMessage('This sign-in link is incomplete. Request a fresh link from Nexus.'); return }
    void nexusApi('/v1/auth/verify', { method: 'POST', body: JSON.stringify({ token }) })
      .then(() => {
        window.dispatchEvent(new Event('nexus:auth-changed'))
        setMessage('You’re signed in. Opening Nexus…')
        window.setTimeout(() => router.replace('/'), 450)
      })
      .catch((error: unknown) => {
        setFailed(true)
        setMessage(error instanceof Error ? error.message : 'This link has expired. Request a fresh one from Nexus.')
      })
  }, [router, search])

  return <main className="min-h-screen bg-[#050407] text-white grid place-items-center px-6"><section className="max-w-sm text-center"><div className={`mx-auto mb-6 h-16 w-16 rounded-full border ${failed ? 'border-red-500/40' : 'border-orange-500/40'} grid place-items-center text-2xl ${failed ? 'text-red-300' : 'text-orange-300'}`}>{failed ? '!' : '✦'}</div><h1 className="text-xl tracking-[0.3em] font-light mb-3">NEXUS</h1><p className="text-sm text-white/65">{message}</p>{failed && <button onClick={() => router.replace('/')} className="mt-6 rounded-xl border border-white/15 px-5 py-3 text-sm text-white/80">Return to Nexus</button>}</section></main>
}

export default function VerifyPage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#050407] text-white grid place-items-center">Checking your sign-in link…</main>}><VerifyLink /></Suspense>
}
