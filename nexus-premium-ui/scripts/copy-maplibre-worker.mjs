import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const packageRoot = path.dirname(require.resolve('maplibre-gl/package.json'))
const scriptDir = path.dirname(fileURLToPath(import.meta.url))

// Keep the assets in the app's public directory for local Next.js, and also
// in the repository-root public directory because Vercel is configured to
// build from the workspace root and serves that directory alongside .next.
const destinations = [
  path.resolve(scriptDir, '../public/maplibre'),
  path.resolve(scriptDir, '../../public/maplibre'),
]

for (const destination of destinations) {
  mkdirSync(destination, { recursive: true })
  for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
    copyFileSync(path.join(packageRoot, 'dist', file), path.join(destination, file))
  }
}

console.log(`[NEXUS] MapLibre worker assets ready: ${destinations.join(', ')}`)
