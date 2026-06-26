'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ConnectionStatus, Square } from './chess'

// Connect to the broker running inside server.mjs on the same host.
// Using window.location.host means any device on the LAN can open the UI
// and automatically reach the right broker without hardcoding an IP.
function defaultWsUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:3001/ws'
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // hostname (no port) + explicit broker port 3001
  return `${proto}//${window.location.hostname}:3001/ws`
}
export const STARTING_BOARD = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR'

export type ServerEvent =
  | { kind: 'done'; from: Square; to: Square }
  | { kind: 'state'; board64: string; turn: 'w' | 'b' }
  | { kind: 'turn'; turn: 'w' | 'b' }
  | { kind: 'illegal'; reason: string }

export interface PendingMove {
  from: Square
  to: Square
  phase: 'sending' | 'acked'
}

export interface ChessSocket {
  status: ConnectionStatus
  pending: PendingMove | null
  illegalReason: string | null
  sendMove: (from: Square, to: Square) => boolean
  sendReset: () => void
  requestState: () => void
  clearIllegal: () => void
}

const PENDING_MOVE_TIMEOUT_MS = 12000

// Build a FEN string chess.js can `.load()` from the 64-char board + turn the
// S3 sends. Castling rights default to KQkq (we don't track moves of king/rook
// here — if the server disagrees it will reject illegal moves and the next
// `state` snapshot will resync us).
export function buildFen(board64: string, turn: 'w' | 'b'): string {
  const ranks: string[] = []
  for (let r = 0; r < 8; r++) {
    const slice = board64.slice(r * 8, r * 8 + 8)
    let s = ''
    let empty = 0
    for (const ch of slice) {
      if (ch === '.') {
        empty++
      } else {
        if (empty) { s += empty; empty = 0 }
        s += ch
      }
    }
    if (empty) s += empty
    ranks.push(s)
  }
  return `${ranks.join('/')} ${turn} KQkq - 0 1`
}

export function useChessSocket(onEvent: (e: ServerEvent) => void): ChessSocket {
  const url = process.env.NEXT_PUBLIC_WS_URL || defaultWsUrl()

  const [status, setStatus] = useState<ConnectionStatus>('syncing')
  const [pending, setPending] = useState<PendingMove | null>(null)
  const [illegalReason, setIllegalReason] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttempt = useRef(0)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmounted = useRef(false)
  const pendingRef = useRef<PendingMove | null>(null)

  // Keep the latest onEvent in a ref so we don't have to tear down the socket
  // when the parent re-renders.
  const onEventRef = useRef(onEvent)

  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  const handleMessage = useCallback((raw: string) => {
    let msg: unknown
    try { msg = JSON.parse(raw) } catch { return }
    if (!msg || typeof msg !== 'object') return
    const m = msg as Record<string, unknown>

    switch (m.type) {
      case 'ack': {
        const p = pendingRef.current
        if (p && typeof m.from === 'string' && typeof m.to === 'string'
            && p.from === m.from.toLowerCase() && p.to === m.to.toLowerCase()) {
          setPending({ ...p, phase: 'acked' })
        }
        return
      }
      case 'done': {
        if (typeof m.from !== 'string' || typeof m.to !== 'string') return
        const from = m.from.toLowerCase() as Square
        const to = m.to.toLowerCase() as Square
        if (pendingTimer.current) {
          clearTimeout(pendingTimer.current)
          pendingTimer.current = null
        }
        setPending(null)
        setIllegalReason(null)
        onEventRef.current({ kind: 'done', from, to })
        return
      }
      case 'illegal': {
        const reason = typeof m.reason === 'string' ? m.reason : 'Illegal move'
        if (pendingTimer.current) {
          clearTimeout(pendingTimer.current)
          pendingTimer.current = null
        }
        setPending(null)
        setIllegalReason(reason)
        onEventRef.current({ kind: 'illegal', reason })
        return
      }
      case 'turn': {
        if (m.color !== 'WHITE' && m.color !== 'BLACK') return
        onEventRef.current({ kind: 'turn', turn: m.color === 'WHITE' ? 'w' : 'b' })
        return
      }
      case 'state': {
        if (typeof m.board !== 'string' || m.board.length !== 64) return
        if (m.turn !== 'WHITE' && m.turn !== 'BLACK') return
        if (pendingTimer.current) {
          clearTimeout(pendingTimer.current)
          pendingTimer.current = null
        }
        setPending(null)
        setIllegalReason(null)
        onEventRef.current({
          kind: 'state',
          board64: m.board,
          turn: m.turn === 'WHITE' ? 'w' : 'b',
        })
        return
      }
      case 'log':
        if (typeof m.text === 'string') console.log('[robot]', m.text)
        return
    }
  }, [])

  useEffect(() => {
    unmounted.current = false

    const scheduleReconnect = () => {
      if (unmounted.current) return
      const attempt = reconnectAttempt.current++
      const delay = Math.min(10_000, 500 * 2 ** attempt) + Math.random() * 250
      reconnectTimer.current = setTimeout(connect, delay)
    }

    const connect = () => {
      if (unmounted.current) return
      setStatus((s) => (s === 'connected' ? s : 'syncing'))
      let ws: WebSocket
      try {
        ws = new WebSocket(url)
      } catch {
        scheduleReconnect()
        return
      }
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttempt.current = 0
        setStatus('connected')
        console.log('[socket] open', url)
      }
      ws.onmessage = (ev) => {
        const data = typeof ev.data === 'string' ? ev.data : ''
        console.log('[socket] ←', data)
        handleMessage(data)
      }
      ws.onerror = (ev) => {
        console.warn('[socket] error', ev)
        try { ws.close() } catch { /* ignore */ }
      }
      ws.onclose = (ev) => {
        console.warn('[socket] close', { code: ev.code, reason: ev.reason, wasClean: ev.wasClean })
        wsRef.current = null
        if (!unmounted.current) setStatus('disconnected')
        scheduleReconnect()
      }
    }

    connect()
    return () => {
      unmounted.current = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (pendingTimer.current) clearTimeout(pendingTimer.current)
      if (wsRef.current) {
        try { wsRef.current.close() } catch { /* ignore */ }
      }
    }
  }, [url, handleMessage])

  const sendMove = useCallback((from: Square, to: Square) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    if (pendingTimer.current) clearTimeout(pendingTimer.current)
    setPending({ from, to, phase: 'sending' })
    setIllegalReason(null)
    ws.send(JSON.stringify({ type: 'move', from: from.toUpperCase(), to: to.toUpperCase() }))
    pendingTimer.current = setTimeout(() => {
      pendingTimer.current = null
      setPending(null)
      setIllegalReason('Move timed out; board state was refreshed.')
      const current = wsRef.current
      if (current?.readyState === WebSocket.OPEN) {
        current.send(JSON.stringify({ type: 'hello' }))
      }
    }, PENDING_MOVE_TIMEOUT_MS)
    return true
  }, [])

  const sendReset = useCallback(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (pendingTimer.current) {
      clearTimeout(pendingTimer.current)
      pendingTimer.current = null
    }
    setPending(null)
    setIllegalReason(null)
    ws.send(JSON.stringify({ type: 'reset' }))
  }, [])

  const requestState = useCallback(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'hello' }))
  }, [])

  const clearIllegal = useCallback(() => setIllegalReason(null), [])

  return { status, pending, illegalReason, sendMove, sendReset, requestState, clearIllegal }
}
