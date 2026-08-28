import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const packageRoot = path.dirname(require.resolve('maplibre-gl/package.json'))
const destination = path.resolve(process.cwd(), '.next/static/maplibre')

mkdirSync(destination, { recursive: true })
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(path.join(packageRoot, 'dist', file), path.join(destination, file))
}

console.log(`[NEXUS] MapLibre worker assets copied to ${destination}`)
