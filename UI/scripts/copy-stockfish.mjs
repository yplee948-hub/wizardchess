#!/usr/bin/env node
// Copy the single-threaded Stockfish build into public/ so the browser can
// load it as a Worker without needing COOP/COEP headers (which the
// multi-threaded build requires for SharedArrayBuffer).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const src = join(root, 'node_modules/stockfish/bin')
const dst = join(root, 'public/stockfish')

if (!existsSync(src)) {
  console.error('[copy-stockfish] node_modules/stockfish not found — run `npm install` first.')
  process.exit(0)
}

mkdirSync(dst, { recursive: true })

for (const f of ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm']) {
  copyFileSync(join(src, f), join(dst, f))
  console.log('[copy-stockfish] copied', f)
}
