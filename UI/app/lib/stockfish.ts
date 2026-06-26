'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Square } from 'chess.js'

// Single-threaded Stockfish 18 lite. Copied to public/stockfish/ by the
// `postinstall` script so it can be loaded as a Worker without needing
// COOP/COEP headers (which the multi-threaded build requires).
const ENGINE_URL = '/stockfish/stockfish-18-lite-single.js'
const ENGINE_RESTART_DELAY_MS = 250

export interface EngineMove {
  from: Square
  to: Square
  promotion?: 'q' | 'r' | 'b' | 'n'
}

export interface ChessEngine {
  ready: boolean
  getBestMove: (fen: string, movetimeMs: number) => Promise<EngineMove | null>
}

function formatWorkerError(err: ErrorEvent) {
  return {
    message: err.message,
    filename: err.filename,
    lineno: err.lineno,
    colno: err.colno,
    error: err.error,
  }
}

export function useStockfish(): ChessEngine {
  const workerRef = useRef<Worker | null>(null)
  const pendingResolve = useRef<((m: EngineMove | null) => void) | null>(null)
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let disposed = false
    let restartTimer: ReturnType<typeof setTimeout> | null = null

    const clearPending = () => {
      const resolve = pendingResolve.current
      pendingResolve.current = null
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current)
        pendingTimer.current = null
      }
      resolve?.(null)
    }

    const startWorker = () => {
      if (disposed) return
      setReady(false)

      let worker: Worker
      try {
        worker = new Worker(ENGINE_URL)
      } catch (err) {
        console.warn('[stockfish] failed to spawn worker', err)
        restartTimer = setTimeout(startWorker, ENGINE_RESTART_DELAY_MS)
        return
      }
      workerRef.current = worker

      let uciOk = false
      worker.onmessage = (ev: MessageEvent<string>) => {
        if (disposed || workerRef.current !== worker) return

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
          if (pendingTimer.current) {
            clearTimeout(pendingTimer.current)
            pendingTimer.current = null
          }
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
        if (disposed || workerRef.current !== worker) return

        console.warn('[stockfish] worker error; restarting', formatWorkerError(err))
        clearPending()
        setReady(false)
        workerRef.current = null
        try { worker.terminate() } catch { /* ignore */ }
        restartTimer = setTimeout(startWorker, ENGINE_RESTART_DELAY_MS)
      }

      worker.postMessage('uci')
    }

    startWorker()

    return () => {
      disposed = true
      if (restartTimer) clearTimeout(restartTimer)
      const worker = workerRef.current
      if (worker) {
        try { worker.terminate() } catch { /* ignore */ }
      }
      workerRef.current = null
      pendingResolve.current = null
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current)
        pendingTimer.current = null
      }
      setReady(false)
    }
  }, [])

  const getBestMove = useCallback((fen: string, movetimeMs: number) => {
    return new Promise<EngineMove | null>((resolve) => {
      const worker = workerRef.current
      if (!worker) { resolve(null); return }
      // If a previous search is still running, drop its result.
      if (pendingResolve.current) pendingResolve.current(null)
      if (pendingTimer.current) clearTimeout(pendingTimer.current)
      pendingResolve.current = resolve
      pendingTimer.current = setTimeout(() => {
        const pending = pendingResolve.current
        pendingResolve.current = null
        pendingTimer.current = null
        try { worker.postMessage('stop') } catch { /* ignore */ }
        pending?.(null)
      }, movetimeMs + 2000)
      worker.postMessage('ucinewgame')
      worker.postMessage(`position fen ${fen}`)
      worker.postMessage(`go movetime ${movetimeMs}`)
    })
  }, [])

  return { ready, getBestMove }
}
