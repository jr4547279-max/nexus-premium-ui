'use client'

import { useEffect, useRef } from 'react'

export default function MapboxCdnTestPage() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false

    // Inject MapLibre CSS from CDN
    if (!document.getElementById('maplibre-cdn-css')) {
      const link    = document.createElement('link')
      link.id       = 'maplibre-cdn-css'
      link.rel      = 'stylesheet'
      link.href     = 'https://unpkg.com/maplibre-gl@5.9.0/dist/maplibre-gl.css'
      document.head.appendChild(link)
    }

    // Inject MapLibre JS from CDN, then construct the map
    const loadScript = (): Promise<void> =>
      new Promise((resolve, reject) => {
        if (document.getElementById('maplibre-cdn-js')) { resolve(); return }
        const script    = document.createElement('script')
        script.id       = 'maplibre-cdn-js'
        script.src      = 'https://unpkg.com/maplibre-gl@5.9.0/dist/maplibre-gl.js'
        script.onload   = () => resolve()
        script.onerror  = () => reject(new Error('CDN script failed to load'))
        document.head.appendChild(script)
      })

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current) return

        console.log('[TEST] script loaded')

        // maplibregl is exposed as a browser global by the CDN bundle
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mgl = (window as Record<string, any>)['maplibregl']

        const map = new mgl.Map({
          container: containerRef.current,
          style:     'https://tiles.openfreemap.org/styles/liberty',
          center:    [0.2767, 50.7700], // Eastbourne
          zoom:      12,
          attributionControl: false,
        }) as { on: (event: string, cb: (e?: unknown) => void) => void }

        console.log('[TEST] map constructed')

        map.on('style.load', () => console.log('[TEST] style.load'))
        map.on('load',       () => console.log('[TEST] load'))
        map.on('error',      (e) => console.log('[TEST] error', e))
      })
      .catch((err: Error) => {
        console.log('[TEST] error', err.message)
      })

    return () => { cancelled = true }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', inset: 0 }}
    />
  )
}
