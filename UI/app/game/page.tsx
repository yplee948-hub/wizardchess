'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Chess, Square, PieceSymbol, Color } from 'chess.js'
import {
  BoardPiece,
  LastMove,
  GameStatus,
  LegalMoveSquare,
  chessBoardToDisplay,
  getLegalMoves,
  getGameStatus,
  moveDescription,
} from '@/app/lib/chess'
import { useChessSocket, ServerEvent, buildFen, STARTING_BOARD } from '@/app/lib/socket'
import { useStockfish } from '@/app/lib/stockfish'
import ChessBoard from '@/app/components/ChessBoard'
import RightPanel from '@/app/components/RightPanel'
import GameModeRow from '@/app/components/GameModeRow'
import StatusHeader from '@/app/components/StatusHeader'
import AttackAnimation from '@/app/components/AttackAnimation'

export type PlayerKind = 'human' | 'ai'
export interface PlayerConfig { w: PlayerKind; b: PlayerKind }
const AI_MOVETIME_MS = 1000
const AI_WATCHDOG_MS = 6000

interface MoveSelection {
  from: Square | null
  to: Square | null
  piece: BoardPiece | null
}

interface AttackAnimState {
  id: number
  piece: PieceSymbol
  color: Color
  to: Square
}

const EMPTY_SELECTION: MoveSelection = { from: null, to: null, piece: null }
const normalizePromotion = (promotion?: PieceSymbol): 'q' | 'r' | 'b' | 'n' =>
  promotion === 'r' || promotion === 'b' || promotion === 'n' ? promotion : 'q'
const ATTACK_ANIMATION_FALLBACK_MS = 4500

function useChessGame() {
  const [initialChess] = useState(() => new Chess())
  const chessRef = useRef(initialChess)

  const [board, setBoard] = useState(() => chessBoardToDisplay(initialChess))
  const [currentTurn, setCurrentTurn] = useState<'w' | 'b'>('w')
  const [lastMove, setLastMove] = useState<LastMove | null>(null)
  const [capturedByWhite, setCapturedByWhite] = useState<BoardPiece[]>([])
  const [capturedByBlack, setCapturedByBlack] = useState<BoardPiece[]>([])
  const [gameStatus, setGameStatus] = useState<GameStatus>('playing')
  const [selection, setSelection] = useState<MoveSelection>(EMPTY_SELECTION)
  const [legalMoves, setLegalMoves] = useState<LegalMoveSquare[]>([])
  const [announcement, setAnnouncement] = useState('')
  const [players, setPlayers] = useState<PlayerConfig>({ w: 'human', b: 'human' })
  const [localMode, setLocalMode] = useState(false)
  const [attackAnim, setAttackAnim] = useState<AttackAnimState | null>(null)
  const nextAttackAnimIdRef = useRef(0)

  const playAttackAnimation = useCallback((piece: PieceSymbol, color: Color, to: Square) => {
    nextAttackAnimIdRef.current += 1
    setAttackAnim({ id: nextAttackAnimIdRef.current, piece, color, to })
  }, [])

  const handleServerEvent = useCallback((e: ServerEvent) => {
    const chess = chessRef.current

    if (e.kind === 'state') {
      const wasStart = e.board64 === STARTING_BOARD
      try {
        chess.load(buildFen(e.board64, e.turn))
      } catch {
        chessRef.current = new Chess()
      }
      setBoard(chessBoardToDisplay(chessRef.current))
      setCurrentTurn(chessRef.current.turn())
      setGameStatus(getGameStatus(chessRef.current))
      setSelection(EMPTY_SELECTION)
      setLegalMoves([])
      if (wasStart) {
        setLastMove(null)
        setCapturedByWhite([])
        setCapturedByBlack([])
        setAnnouncement('Board reset to starting position.')
      }
      return
    }

    if (e.kind === 'done') {
      let result
      try {
        result = chess.move({ from: e.from, to: e.to, promotion: 'q' })
      } catch {
        result = null
      }
      if (!result) return

      const moved: BoardPiece = { type: result.piece, color: result.color, square: result.to as Square }
      const captured = result.captured
        ? { type: result.captured, color: result.color === 'w' ? 'b' : 'w', square: result.to as Square } as BoardPiece
        : undefined

      const lm: LastMove = {
        from: result.from as Square,
        to: result.to as Square,
        san: result.san,
        piece: moved,
        captured,
      }
      setLastMove(lm)
      if (captured) {
        if (result.color === 'w') setCapturedByWhite((p) => [...p, captured])
        else setCapturedByBlack((p) => [...p, captured])
      }
      setAnnouncement(moveDescription(lm))
      setSelection(EMPTY_SELECTION)
      setLegalMoves([])
      setBoard(chessBoardToDisplay(chess))
      setCurrentTurn(chess.turn())
      setGameStatus(getGameStatus(chess))
      return
    }

    if (e.kind === 'turn') {
      setCurrentTurn(e.turn)
      return
    }

    if (e.kind === 'illegal') {
      setSelection(EMPTY_SELECTION)
      setLegalMoves([])
      setAnnouncement(`Illegal move: ${e.reason}`)
      return
    }
  }, [])

  const socket = useChessSocket(handleServerEvent)
  const { status: connectionStatus, pending, illegalReason, sendMove, sendReset, clearIllegal } = socket

  const engine = useStockfish()
  const engineReady = engine.ready
  const getBestMove = engine.getBestMove

  const pendingLocalMoveRef = useRef<{ from: Square; to: Square; promotion: 'q' | 'r' | 'b' | 'n' } | null>(null)
  const pendingLocalMoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (pendingLocalMoveTimerRef.current) clearTimeout(pendingLocalMoveTimerRef.current)
    }
  }, [])

  const applyLocalMove = useCallback((from: Square, to: Square, promotion: 'q' | 'r' | 'b' | 'n' = 'q'): boolean => {
    const chess = chessRef.current
    let result
    try { result = chess.move({ from, to, promotion }) }
    catch { result = null }
    if (!result) return false

    const moved: BoardPiece = { type: result.piece, color: result.color, square: result.to as Square }
    const captured = result.captured
      ? { type: result.captured, color: result.color === 'w' ? 'b' : 'w', square: result.to as Square } as BoardPiece
      : undefined

    const lm: LastMove = { from: result.from as Square, to: result.to as Square, san: result.san, piece: moved, captured }
    setLastMove(lm)
    if (captured) {
      if (result.color === 'w') setCapturedByWhite((p) => [...p, captured])
      else setCapturedByBlack((p) => [...p, captured])
    }
    setAnnouncement(moveDescription(lm))
    setSelection(EMPTY_SELECTION)
    setLegalMoves([])
    setBoard(chessBoardToDisplay(chess))
    setCurrentTurn(chess.turn())
    setGameStatus(getGameStatus(chess))
    return true
  }, [])

  const localMove = useCallback((from: Square, to: Square, skipAnim = false, promotion: 'q' | 'r' | 'b' | 'n' = 'q'): boolean => {
    const chess = chessRef.current
    if (!skipAnim) {
      const matchingMove = chess.moves({ square: from, verbose: true }).find((m) => m.to === to)
      const movingPiece = chess.get(from)

      if (matchingMove?.captured && movingPiece) {
        pendingLocalMoveRef.current = { from, to, promotion }
        if (pendingLocalMoveTimerRef.current) clearTimeout(pendingLocalMoveTimerRef.current)
        pendingLocalMoveTimerRef.current = setTimeout(() => {
          const pending = pendingLocalMoveRef.current
          if (!pending) return
          pendingLocalMoveRef.current = null
          pendingLocalMoveTimerRef.current = null
          applyLocalMove(pending.from, pending.to, pending.promotion)
        }, ATTACK_ANIMATION_FALLBACK_MS)
        playAttackAnimation(movingPiece.type, movingPiece.color, to)
        setSelection(EMPTY_SELECTION)
        setLegalMoves([])
        return true
      }
    }

    return applyLocalMove(from, to, promotion)
  }, [applyLocalMove, playAttackAnimation])

  const aiThinkingRef = useRef(false)
  const aiRequestIdRef = useRef(0)
  useEffect(() => {
    if (aiThinkingRef.current) return
    if (players[currentTurn] !== 'ai') return
    if (attackAnim || pendingLocalMoveRef.current) return
    if (gameStatus !== 'playing' && gameStatus !== 'check') return
    if (!localMode && connectionStatus !== 'connected') return
    if (!localMode && pending) return
    aiThinkingRef.current = true
    const requestId = ++aiRequestIdRef.current
    const fen = chessRef.current.fen()
    const turnAtRequest = currentTurn
    const playFallbackMove = () => {
      const fallbackMove = chessRef.current.moves({ verbose: true })[0]
      if (!fallbackMove) {
        setAnnouncement('AI did not find a legal move.')
        return
      }

      if (localMode) {
        localMove(fallbackMove.from as Square, fallbackMove.to as Square, false, normalizePromotion(fallbackMove.promotion))
      } else if (sendMove(fallbackMove.from as Square, fallbackMove.to as Square)) {
        setAnnouncement(`AI fallback move: ${fallbackMove.from} → ${fallbackMove.to}.`)
      } else {
        setAnnouncement('AI fallback move could not be sent.')
        return
      }

      setAnnouncement(`AI fallback move: ${fallbackMove.from} → ${fallbackMove.to}.`)
    }
    const watchdog = setTimeout(() => {
      if (aiRequestIdRef.current !== requestId) return
      if (chessRef.current.turn() !== turnAtRequest) return

      aiRequestIdRef.current += 1
      aiThinkingRef.current = false
      playFallbackMove()
    }, AI_WATCHDOG_MS)

    getBestMove(fen, AI_MOVETIME_MS).then((mv) => {
      clearTimeout(watchdog)
      if (aiRequestIdRef.current !== requestId) return
      aiThinkingRef.current = false
      if (chessRef.current.turn() !== turnAtRequest) return
      if (!mv) {
        playFallbackMove()
        return
      }
      if (localMode) {
        const ok = localMove(mv.from as Square, mv.to as Square, false, mv.promotion ?? 'q')
        if (!ok) {
          const fallbackMove = chessRef.current.moves({ verbose: true })[0]
          if (fallbackMove) {
            localMove(fallbackMove.from as Square, fallbackMove.to as Square, false, normalizePromotion(fallbackMove.promotion))
            setAnnouncement(`AI fallback move: ${fallbackMove.from} → ${fallbackMove.to}.`)
          } else {
            setAnnouncement(`AI move failed: ${mv.from} → ${mv.to}.`)
          }
        }
      } else {
        const ok = sendMove(mv.from, mv.to)
        if (ok) setAnnouncement(`AI move: ${mv.from} → ${mv.to}.`)
        else {
          const fallbackMove = chessRef.current.moves({ verbose: true })[0]
          if (fallbackMove && sendMove(fallbackMove.from as Square, fallbackMove.to as Square)) {
            setAnnouncement(`AI fallback move: ${fallbackMove.from} → ${fallbackMove.to}.`)
          } else {
            setAnnouncement(`AI move failed: ${mv.from} → ${mv.to}.`)
          }
        }
      }
    }).catch(() => {
      clearTimeout(watchdog)
      if (aiRequestIdRef.current !== requestId) return
      aiThinkingRef.current = false
      if (chessRef.current.turn() === turnAtRequest) playFallbackMove()
    })
    return () => {
      clearTimeout(watchdog)
      if (aiRequestIdRef.current === requestId) {
        aiRequestIdRef.current += 1
        aiThinkingRef.current = false
      }
    }
  }, [players, currentTurn, gameStatus, connectionStatus, pending, attackAnim, getBestMove, sendMove, localMode, localMove])

  const selectSquare = useCallback((square: Square, piece: BoardPiece | null) => {
    const chess = chessRef.current
    if (gameStatus === 'checkmate' || gameStatus === 'stalemate' || gameStatus === 'draw') return
    if (!localMode && connectionStatus === 'disconnected') return
    if (!localMode && pending) return
    if (players[chess.turn()] === 'ai') return

    if (illegalReason) clearIllegal()

    setSelection((prev) => {
      if (!prev.from) {
        if (!piece || piece.color !== chess.turn()) return prev
        setLegalMoves(getLegalMoves(chess, square))
        return { from: square, to: null, piece }
      }
      if (prev.from === square) {
        setLegalMoves([])
        return EMPTY_SELECTION
      }
      if (piece && piece.color === chess.turn()) {
        setLegalMoves(getLegalMoves(chess, square))
        return { from: square, to: null, piece }
      }
      return { ...prev, to: square }
    })
  }, [gameStatus, connectionStatus, pending, illegalReason, clearIllegal, players, localMode])

  const flushPendingLocalMove = useCallback(() => {
    const pending = pendingLocalMoveRef.current
    if (!pending) return
    if (pendingLocalMoveTimerRef.current) {
      clearTimeout(pendingLocalMoveTimerRef.current)
      pendingLocalMoveTimerRef.current = null
    }
    pendingLocalMoveRef.current = null
    applyLocalMove(pending.from, pending.to, pending.promotion)
  }, [applyLocalMove])

  const confirmMove = useCallback(() => {
    if (!selection.from || !selection.to || !selection.piece) return
    if (localMode) {
      const chess = chessRef.current
      const legalMoves = chess.moves({ square: selection.from, verbose: true })
      const matchingMove = legalMoves.find(m => m.to === selection.to)
      const isCapture = !!matchingMove?.captured

      if (isCapture) {
        pendingLocalMoveRef.current = { from: selection.from, to: selection.to, promotion: normalizePromotion(matchingMove.promotion) }
        if (pendingLocalMoveTimerRef.current) clearTimeout(pendingLocalMoveTimerRef.current)
        pendingLocalMoveTimerRef.current = setTimeout(flushPendingLocalMove, ATTACK_ANIMATION_FALLBACK_MS)
        playAttackAnimation(selection.piece.type, selection.piece.color, selection.to)
        setSelection(EMPTY_SELECTION)
        setLegalMoves([])
      } else {
        localMove(selection.from, selection.to)
      }
      return
    }
    const ok = sendMove(selection.from, selection.to)
    if (!ok) {
      setAnnouncement('Not connected. Move not sent.')
      return
    }
    setAnnouncement(`Move sent: ${selection.from} → ${selection.to}.`)
  }, [selection, sendMove, localMode, localMove, playAttackAnimation, flushPendingLocalMove])

  const cancelSelection = useCallback(() => {
    setSelection(EMPTY_SELECTION)
    setLegalMoves([])
    if (illegalReason) clearIllegal()
  }, [illegalReason, clearIllegal])

  const resetBoard = useCallback(() => {
    if (localMode) {
      chessRef.current = new Chess()
      setBoard(chessBoardToDisplay(chessRef.current))
      setCurrentTurn('w')
      setLastMove(null)
      setCapturedByWhite([])
      setCapturedByBlack([])
      setGameStatus('playing')
      setSelection(EMPTY_SELECTION)
      setLegalMoves([])
      setAttackAnim(null)
      pendingLocalMoveRef.current = null
      if (pendingLocalMoveTimerRef.current) {
        clearTimeout(pendingLocalMoveTimerRef.current)
        pendingLocalMoveTimerRef.current = null
      }
      setAnnouncement('Board reset.')
      return
    }
    setAnnouncement('Reset requested.')
    sendReset()
  }, [sendReset, localMode])

  return {
    board, currentTurn, lastMove, capturedByWhite, capturedByBlack,
    gameStatus, selection, legalMoves, announcement, connectionStatus,
    pending, illegalReason,
    players, setPlayers, engineReady,
    localMode, setLocalMode, attackAnim, setAttackAnim, flushPendingLocalMove,
    selectSquare, confirmMove, cancelSelection, resetBoard,
  }
}

function GameOverOverlay({
  status,
  lastMove,
  onReset,
}: {
  status: GameStatus
  lastMove: LastMove | null
  onReset: () => void
}) {
  if (status !== 'checkmate' && status !== 'stalemate' && status !== 'draw') return null

  const titles: Partial<Record<GameStatus, string>> = {
    checkmate: 'Checkmate',
    stalemate: 'Stalemate',
    draw: 'Draw',
  }
  const subtitles: Partial<Record<GameStatus, string>> = {
    checkmate: lastMove
      ? `${lastMove.piece.color === 'w' ? 'White' : 'Black'} wins`
      : 'Game over',
    stalemate: 'No legal moves — the game is a draw',
    draw: 'The game ended in a draw',
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-30"
      style={{ background: 'rgba(237, 239, 243, 0.76)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Game over"
    >
      <div className="bg-white border border-[#d8dde7] rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-5 min-w-[260px]">
        <div className="text-4xl font-bold text-[#1c1917] tracking-tight">
          {titles[status]}
        </div>
        <div className="text-stone-500 text-sm text-center">
          {subtitles[status]}
        </div>
        <button
          onClick={onReset}
          className="mt-2 px-8 py-3 rounded-xl bg-[#1d4ed8] text-white font-semibold text-sm hover:bg-[#1e40af] active:bg-[#1e3a8a] transition-colors shadow-sm"
          autoFocus
        >
          Reset Board
        </button>
      </div>
    </div>
  )
}

export default function Home() {
  const {
    board, currentTurn, lastMove, capturedByWhite, capturedByBlack,
    gameStatus, selection, legalMoves, announcement, connectionStatus,
    pending, illegalReason,
    players, setPlayers, engineReady,
    localMode, setLocalMode, attackAnim, setAttackAnim, flushPendingLocalMove,
    selectSquare, confirmMove, cancelSelection, resetBoard,
  } = useChessGame()

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-[#edeff3]">
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <StatusHeader status={connectionStatus} />

      <main className="flex flex-col md:flex-row md:flex-1 md:overflow-hidden">
        {/* Board area */}
        <div className="relative flex items-center justify-center p-3 sm:p-6 md:flex-1 md:p-4 lg:p-6 xl:p-8 overflow-hidden">
          <ChessBoard
            board={board}
            selectedSquare={selection.from}
            destinationSquare={selection.to}
            impactSquare={attackAnim?.to ?? null}
            legalMoves={legalMoves}
            lastMove={lastMove}
            inCheck={gameStatus === 'check' || gameStatus === 'checkmate'}
            currentTurn={currentTurn}
            onSquareClick={selectSquare}
          />
          {pending && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-white/95 border border-stone-200 shadow rounded-full px-4 py-1.5 text-xs font-medium text-stone-700">
              {pending.phase === 'sending'
                ? `Sending ${pending.from.toUpperCase()} → ${pending.to.toUpperCase()}…`
                : `Robot moving ${pending.from.toUpperCase()} → ${pending.to.toUpperCase()}…`}
            </div>
          )}
          <GameOverOverlay
            status={gameStatus}
            lastMove={lastMove}
            onReset={resetBoard}
          />
          {attackAnim && (
            <AttackAnimation
              key={attackAnim.id}
              piece={attackAnim.piece}
              color={attackAnim.color}
              onComplete={() => {
                setAttackAnim(null)
                flushPendingLocalMove()
              }}
            />
          )}
        </div>

        <div className="h-px md:hidden bg-stone-200 shrink-0" />

        {/* Right panel */}
        <div className="w-full md:w-80 shrink-0 bg-white flex flex-col md:rounded-[32px] md:border md:border-[#e0e4ec] md:my-[22px] md:mr-[22px] md:overflow-hidden">
          <RightPanel
            currentTurn={currentTurn}
            lastMove={lastMove}
            capturedByWhite={capturedByWhite}
            capturedByBlack={capturedByBlack}
            gameStatus={gameStatus}
            connectionStatus={connectionStatus}
            selection={selection}
            onConfirm={confirmMove}
            onCancel={cancelSelection}
            pending={!!pending}
            illegalReason={illegalReason}
            players={players}
            onPlayersChange={setPlayers}
            engineReady={engineReady}
            localMode={localMode}
            onLocalModeChange={setLocalMode}
            onResetBoard={resetBoard}
          />

          {/* Game Mode + Reset — desktop/tablet only; mobile renders this
              inside RightPanel's scrollable column instead (see RightPanel). */}
          <div className="hidden md:flex px-4 pt-3 pb-3 items-center justify-between border-t border-[#e0e4ec]">
            <GameModeRow
              localMode={localMode}
              onLocalModeChange={setLocalMode}
              onResetBoard={resetBoard}
              isDisabled={connectionStatus === 'disconnected'}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
