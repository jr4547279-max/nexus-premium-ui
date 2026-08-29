'use client'

/**
 * World screen wrapper — mounts the Nexus World renderer client-side only
 * (MapLibre requires window/WebGL) and overlays the app's bottom navigation
 * so the world sits inside the normal tab flow.
 */

import dynamic from 'next/dynamic'
import { BottomNav } from './navigation'

const WorldMap = dynamic(
  () => import('./world-map').then((m) => m.WorldMap),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 bg-[#07101f] flex flex-col items-center justify-center gap-4">
        <div className="w-14 h-14 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
        <p className="text-[11px] tracking-[0.35em] text-muted-foreground">ENTERING NEXUS WORLD</p>
      </div>
    ),
  },
)

interface WorldScreenProps {
  onNavigate: (screen: string) => void
}

export function WorldScreen({ onNavigate }: WorldScreenProps) {
  return (
    <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden">
      <WorldMap onNavigate={onNavigate} />
      <BottomNav
        activeTab="world"
        onTabChange={(tab) => {
          if (tab !== 'world') onNavigate(tab)
        }}
        className="bg-transparent"
      />
    </div>
  )
}
