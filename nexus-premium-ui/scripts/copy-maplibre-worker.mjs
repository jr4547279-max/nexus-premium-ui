import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const packageRoot = path.dirname(require.resolve('maplibre-gl/package.json'))
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const destination = path.resolve(scriptDir, '../public/maplibre')

mkdirSync(destination, { recursive: true })

for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(path.join(packageRoot, 'dist', file), path.join(destination, file))
}

console.log(`[NEXUS] MapLibre worker assets ready: ${destination}`)
