'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Chess, Square } from 'chess.js'
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
import StatusHeader from '@/app/components/StatusHeader'

export type PlayerKind = 'human' | 'ai'
export interface PlayerConfig { w: PlayerKind; b: PlayerKind }
const AI_MOVETIME_MS = 1000

interface MoveSelection {
  from: Square | null
  to: Square | null
  piece: BoardPiece | null
}

const EMPTY_SELECTION: MoveSelection = { from: null, to: null, piece: null }

function useChessGame() {
  const chessRef = useRef(new Chess())

  const [board, setBoard] = useState(() => chessBoardToDisplay(chessRef.current))
  const [currentTurn, setCurrentTurn] = useState<'w' | 'b'>('w')
  const [lastMove, setLastMove] = useState<LastMove | null>(null)
  const [capturedByWhite, setCapturedByWhite] = useState<BoardPiece[]>([])
  const [capturedByBlack, setCapturedByBlack] = useState<BoardPiece[]>([])
  const [gameStatus, setGameStatus] = useState<GameStatus>('playing')
  const [selection, setSelection] = useState<MoveSelection>(EMPTY_SELECTION)
  const [legalMoves, setLegalMoves] = useState<LegalMoveSquare[]>([])
  const [announcement, setAnnouncement] = useState('')
  const [whiteTime, setWhiteTime] = useState(300)
  const [blackTime, setBlackTime] = useState(300)
  const [players, setPlayers] = useState<PlayerConfig>({ w: 'human', b: 'human' })

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

  const aiThinkingRef = useRef(false)
  useEffect(() => {
    if (aiThinkingRef.current) return
    if (players[currentTurn] !== 'ai') return
    if (gameStatus !== 'playing' && gameStatus !== 'check') return
    if (connectionStatus !== 'connected') return
    if (pending) return
    if (!engine.ready) return

    aiThinkingRef.current = true
    const fen = chessRef.current.fen()
    const turnAtRequest = currentTurn
    engine.getBestMove(fen, AI_MOVETIME_MS).then((mv) => {
      aiThinkingRef.current = false
      if (!mv) return
      if (chessRef.current.turn() !== turnAtRequest) return
      const ok = sendMove(mv.from, mv.to)
      if (ok) setAnnouncement(`AI move: ${mv.from} → ${mv.to}.`)
    }).catch(() => {
      aiThinkingRef.current = false
    })
  }, [players, currentTurn, gameStatus, connectionStatus, pending, engine, sendMove])

  useEffect(() => {
    if (currentTurn === 'w') setWhiteTime(300)
    else setBlackTime(300)
  }, [currentTurn])

  useEffect(() => {
    const active = gameStatus === 'playing' || gameStatus === 'check'
    if (!active || connectionStatus !== 'connected') return
    const id = setInterval(() => {
      if (currentTurn === 'w') setWhiteTime((t) => Math.max(0, t - 1))
      else setBlackTime((t) => Math.max(0, t - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [gameStatus, currentTurn, connectionStatus])

  const selectSquare = useCallback((square: Square, piece: BoardPiece | null) => {
    const chess = chessRef.current
    if (gameStatus === 'checkmate' || gameStatus === 'stalemate' || gameStatus === 'draw') return
    if (connectionStatus === 'disconnected') return
    if (pending) return
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
  }, [gameStatus, connectionStatus, pending, illegalReason, clearIllegal, players])

  const confirmMove = useCallback(() => {
    if (!selection.from || !selection.to || !selection.piece) return
    const ok = sendMove(selection.from, selection.to)
    if (!ok) {
      setAnnouncement('Not connected. Move not sent.')
      return
    }
    setAnnouncement(`Move sent: ${selection.from} → ${selection.to}.`)
  }, [selection, sendMove])

  const cancelSelection = useCallback(() => {
    setSelection(EMPTY_SELECTION)
    setLegalMoves([])
    if (illegalReason) clearIllegal()
  }, [illegalReason, clearIllegal])

  const resetBoard = useCallback(() => {
    setAnnouncement('Reset requested.')
    sendReset()
  }, [sendReset])

  return {
    board, currentTurn, lastMove, capturedByWhite, capturedByBlack,
    gameStatus, selection, legalMoves, announcement, connectionStatus,
    whiteTime, blackTime, pending, illegalReason,
    players, setPlayers, engineReady: engine.ready,
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
      className="absolute inset-0 flex items-center justify-center z-30"
      style={{ background: 'rgba(30, 24, 16, 0.62)', backdropFilter: 'blur(2px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Game over"
    >
      <div className="bg-[#faf7f2] rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-5 min-w-[260px]">
        <div className="text-4xl font-bold text-stone-800 tracking-tight">
          {titles[status]}
        </div>
        <div className="text-stone-500 text-sm text-center">
          {subtitles[status]}
        </div>
        <button
          onClick={onReset}
          className="mt-2 px-8 py-3 rounded-xl bg-stone-800 text-white font-semibold text-sm hover:bg-stone-700 active:bg-stone-900 transition-colors"
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
    whiteTime, blackTime, pending, illegalReason,
    players, setPlayers, engineReady,
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
        <div className="relative flex items-center justify-center p-3 sm:p-6 md:flex-1 md:p-4 lg:p-6 xl:p-8">
          <ChessBoard
            board={board}
            selectedSquare={selection.from}
            destinationSquare={selection.to}
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
            whiteTime={whiteTime}
            blackTime={blackTime}
            onConfirm={confirmMove}
            onCancel={cancelSelection}
            pending={!!pending}
            illegalReason={illegalReason}
            players={players}
            onPlayersChange={setPlayers}
            engineReady={engineReady}
          />

          <div className="border-t border-stone-200 px-4 py-3 bg-stone-50 flex items-center justify-between">
            <span className="text-xs text-stone-400">Robot</span>
            <button
              onClick={resetBoard}
              disabled={connectionStatus === 'disconnected'}
              className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-100 transition-colors disabled:opacity-40"
            >
              Reset Board
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
