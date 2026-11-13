'use client'

import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { GoldenRing } from '@/components/nexus/golden-ring'

export default function AuthCallbackPage(){
  const router=useRouter()
  return <main className="min-h-screen bg-background text-foreground grid place-items-center px-6"><section className="max-w-sm text-center"><AlertTriangle className="mx-auto mb-4 h-8 w-8 text-primary"/><h1 className="text-lg tracking-[0.25em] font-light">NEXUS</h1><p className="mt-3 text-sm text-foreground/80">Google sign-in is not connected yet. Use your email sign-in link to access Nexus.</p><button onClick={()=>router.replace('/')} className="mt-6 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground">Return to Nexus</button><GoldenRing className="mx-auto mt-6" size="sm" intensity="subtle" animated={false}/></section></main>
}
