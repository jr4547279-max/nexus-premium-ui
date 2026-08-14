---
name: Nexus World map experience
description: Key decisions for the immersive MapLibre world (Eastbourne/South Downs) — tile/terrain sources, LOD, lifecycle guards.
---

# Nexus World

- Renderer: MapLibre GL v6 (namespace import — `import('maplibre-gl').then((maplibregl) => ...)`; **no default export** in v6). Three.js was deliberately skipped: MapLibre's own WebGL handles terrain/extrusion/fog with far better mobile perf.
- Free data sources that need no keys: OpenFreeMap vector tiles (`tiles.openfreemap.org/planet`, OpenMapTiles schema), AWS Terrarium DEM (`s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, `encoding: 'terrarium'`) for real 3D terrain + hillshade.
- OSRM foot routing base is `routing.openstreetmap.de/routed-foot` (router.project-osrm.org ignores profiles).
- LOD is done GPU-side with layer `minzoom` (5 levels: world/city/neighbourhood/street/destination); venues fetched on debounced `moveend` only at z≥13 via existing `/nx/places` proxy.
- **Why lifecycle guards matter:** code review found late-resolving OSRM fetches could restart an infinite rAF loop after unmount. Pattern used: monotonic seq refs (`routeSeqRef`, `fetchSeqRef`) + `disposedRef`, all invalidated in effect cleanup; debounce timer in a ref. Any new async→animation flow in the world must follow this.
- Global CSS has `canvas { pointer-events: none !important }`; the world scopes an override `.nexus-world canvas { pointer-events: auto !important }` — without it MapLibre is dead to input.
- Headless screenshot browser has **no WebGL2** — the map can't be visually verified via the Screenshot tool; a WebGL2 probe fallback UI exists (release probe context via `WEBGL_lose_context`). Verify visually in the real preview or a real-browser test.
- `/dev-login?screen=world` (and other screens) supported via query param for direct dev navigation.
