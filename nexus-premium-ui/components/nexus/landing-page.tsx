'use client'

import { NexusLogoAnimated, NexusLogo } from './nexus-logo'
import { GlassCard } from './glass-card'
import { Button } from '@/components/ui/button'
import { OrbitalBackground } from './golden-ring'
import { CalendarDays, Users, Map, Sparkles, ArrowRight, Route, MessageCircle } from 'lucide-react'

interface LandingPageProps {
  onGetStarted: () => void
  onLogin: () => void
}

export function LandingPage({ onGetStarted, onLogin }: LandingPageProps) {
  return (
    <div className="min-h-screen overflow-hidden bg-background">
      <OrbitalBackground className="min-h-screen">
        <header className="relative z-10 px-5 py-4"><div className="mx-auto flex max-w-6xl items-center justify-between"><NexusLogo size="sm" /><Button variant="ghost" onClick={onLogin} className="text-muted-foreground hover:text-foreground">Sign in</Button></div></header>
        <main className="relative z-10 px-5 pb-16 pt-8 md:pt-14"><div className="mx-auto max-w-6xl"><div className="grid items-center gap-12 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <div className="mb-6 flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-primary/80"><Sparkles className="h-3.5 w-3.5" /> Social planning, without the organising</div>
            <div className="mb-6"><NexusLogoAnimated /></div>
            <h1 className="max-w-2xl text-5xl font-light leading-[0.95] tracking-[-0.05em] sm:text-7xl">Stop asking<br/><span className="text-primary">“when are you free?”</span></h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">Nexus turns a vague idea into a real plan. It brings your people, calendars, preferences and places together — then finds the moment that actually works.</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row"><Button onClick={onGetStarted} className="h-11 rounded-full bg-primary px-6 text-primary-foreground glow-gold">Make a plan <ArrowRight className="ml-2 h-4 w-4" /></Button><Button onClick={onLogin} variant="outline" className="h-11 rounded-full border-border/50">I already use Nexus</Button></div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-primary"/> Find the time</span><span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-primary"/> Align the group</span><span className="flex items-center gap-1.5"><Map className="h-3.5 w-3.5 text-primary"/> Find the place</span></div>
          </div>
          <div className="relative mx-auto w-full max-w-md"><GlassCard glow className="relative overflow-hidden p-5 sm:p-6">
            <div className="flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[0.2em] text-primary">Golden Window</p><h2 className="mt-1 text-xl font-semibold">The plan is ready.</h2></div><div className="rounded-full bg-primary/10 p-2 text-primary"><Sparkles className="h-4 w-4"/></div></div>
            <div className="my-7 flex items-center gap-4"><div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/[0.03] shadow-[0_0_45px_rgba(245,158,11,.12)]"><div className="absolute inset-2 rounded-full border border-primary/20"/><div className="text-center"><p className="text-[9px] uppercase tracking-wider text-muted-foreground">Saturday</p><p className="text-2xl font-semibold">7:30</p><p className="text-xs text-muted-foreground">PM</p></div></div><div className="min-w-0"><p className="font-medium">Friday Drinks</p><p className="mt-1 text-xs text-muted-foreground">Everyone is free · 18 min average travel</p><div className="mt-3 flex items-center gap-1.5 text-[10px] text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/> 5/5 aligned</div></div></div>
            <div className="rounded-xl border border-border/30 bg-muted/20 p-3"><div className="flex items-center gap-2"><div className="text-lg">🍻</div><div className="min-w-0 flex-1"><p className="text-xs font-medium">Recommended route</p><p className="text-[10px] text-muted-foreground">Brighton after dark · 6 stops</p></div><Route className="h-4 w-4 text-primary"/></div></div>
            <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground"><span className="flex items-center gap-1"><MessageCircle className="h-3 w-3"/> Group chat ready</span><span className="text-primary">Confirm plan →</span></div>
          </GlassCard></div>
        </div>
        <div className="mt-16 grid gap-3 sm:grid-cols-3">{[['01','Social first','See what your people are planning, share ideas and turn conversations into actual plans.'],['02','Effortless coordination','Nexus works through availability and preferences so the group does not have to.'],['03','Routes stay','Pub crawls, walks and other routes remain discoverable, saveable and shareable.']].map(([n,t,d]) => <GlassCard key={n} className="p-5"><span className="text-xs text-primary">{n}</span><h3 className="mt-7 text-sm font-medium">{t}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{d}</p></GlassCard>)}</div>
        </div></main>
      </OrbitalBackground>
    </div>
  )
}
