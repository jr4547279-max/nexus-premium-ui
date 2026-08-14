'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  DEVELOPMENT ONLY — diagnostic page for isolating MapLibre init failures.
// Navigate to /dev-world-test on the target device to run the map test.
// ─────────────────────────────────────────────────────────────────────────────

import dynamic from 'next/dynamic'

const WorldMapTest = dynamic(
  () => import('@/components/nexus/world-map-test'),
  { ssr: false },
)

export default function DevWorldTestPage() {
  return (
    <main style={{ width: '100vw', height: '100dvh', overflow: 'hidden' }}>
      <WorldMapTest />
    </main>
  )
}
