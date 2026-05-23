'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Square } from 'chess.js'

// Single-threaded Stockfish 18 lite. Copied to public/stockfish/ by the
// `postinstall` script so it can be loaded as a Worker without needing
// COOP/COEP headers (which the multi-threaded build requires).
const ENGINE_URL = '/stockfish/stockfish-18-lite-single.js'

export interface EngineMove {
  from: Square
  to: Square
  promotion?: 'q' | 'r' | 'b' | 'n'
}

export interface ChessEngine {
  ready: boolean
  getBestMove: (fen: string, movetimeMs: number) => Promise<EngineMove | null>
}

export function useStockfish(): ChessEngine {
  const workerRef = useRef<Worker | null>(null)
  const pendingResolve = useRef<((m: EngineMove | null) => void) | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let worker: Worker
    try {
      worker = new Worker(ENGINE_URL)
    } catch (err) {
      console.warn('[stockfish] failed to spawn worker', err)
      return
    }
    workerRef.current = worker

    let uciOk = false
    worker.onmessage = (ev: MessageEvent<string>) => {
      const line = typeof ev.data === 'string' ? ev.data : ''
      if (!line) return

      if (!uciOk && line === 'uciok') {
        uciOk = true
        worker.postMessage('isready')
        return
      }
      if (line === 'readyok') {
        setReady(true)
        return
      }
      if (line.startsWith('bestmove')) {
        const parts = line.split(/\s+/)
        const mv = parts[1]
        const resolve = pendingResolve.current
        pendingResolve.current = null
        if (!resolve) return
        if (!mv || mv === '(none)' || mv.length < 4) {
          resolve(null)
          return
        }
        const from = mv.slice(0, 2) as Square
        const to = mv.slice(2, 4) as Square
        const promo = mv.length >= 5 ? (mv[4] as 'q' | 'r' | 'b' | 'n') : undefined
        resolve({ from, to, promotion: promo })
      }
    }
    worker.onerror = (err) => {
      console.warn('[stockfish] worker error', err)
    }

    worker.postMessage('uci')

    return () => {
      try { worker.postMessage('quit') } catch { /* ignore */ }
      try { worker.terminate() } catch { /* ignore */ }
      workerRef.current = null
      pendingResolve.current = null
      setReady(false)
    }
  }, [])

  const getBestMove = useCallback((fen: string, movetimeMs: number) => {
    return new Promise<EngineMove | null>((resolve) => {
      const worker = workerRef.current
      if (!worker) { resolve(null); return }
      // If a previous search is still running, drop its result.
      if (pendingResolve.current) pendingResolve.current(null)
      pendingResolve.current = resolve
      worker.postMessage('ucinewgame')
      worker.postMessage(`position fen ${fen}`)
      worker.postMessage(`go movetime ${movetimeMs}`)
    })
  }, [])

  return { ready, getBestMove }
}
