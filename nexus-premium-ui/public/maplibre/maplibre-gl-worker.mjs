// Same-origin worker entry for Nexus. The actual MapLibre worker and its
// shared module are loaded from the pinned MapLibre distribution, so the
// worker remains a stable public asset even when Vercel does not preserve
// build-generated files from public/.
import 'https://unpkg.com/maplibre-gl@6.3.0/dist/maplibre-gl-worker.mjs'
