'use client'

import { BoardPiece, LastMove, GameStatus, pieceLabel, moveDescription } from '@/app/lib/chess'
import { Square } from 'chess.js'
import ChessPiece from './ChessPiece'
import { PlayerConfig } from '@/app/game/page'

interface MoveSelection {
  from: Square | null
  to: Square | null
  piece: BoardPiece | null
}

interface RightPanelProps {
  currentTurn: 'w' | 'b'
  lastMove: LastMove | null
  capturedByWhite: BoardPiece[]
  capturedByBlack: BoardPiece[]
  gameStatus: GameStatus
  connectionStatus: 'connected' | 'disconnected' | 'syncing'
  selection: MoveSelection
  whiteTime: number
  blackTime: number
  onConfirm: () => void
  onCancel: () => void
  pending: boolean
  illegalReason: string | null
  players: PlayerConfig
  onPlayersChange: (p: PlayerConfig) => void
  engineReady: boolean
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function PlayerCard({
  color,
  isActive,
  isGameOver,
  time,
  playerKind,
  engineReady,
  onToggleAI,
}: {
  color: 'w' | 'b'
  isActive: boolean
  isGameOver: boolean
  time: number
  playerKind: 'human' | 'ai'
  engineReady: boolean
  onToggleAI: () => void
}) {
  const label = color === 'w'
    ? (isActive && !isGameOver ? "White's turn" : 'White')
    : (isActive && !isGameOver ? "Black's turn" : 'Black')

  return (
    <div className={`flex-1 flex flex-col items-center gap-2 md:gap-4 pt-1 px-2 pb-2 md:pt-2 md:px-4 md:pb-4 rounded-lg border ${
      isActive
        ? 'bg-[#f5f9ff] border-[#4091ff]'
        : 'border-[#c4c7ce]'
    }`} style={{ borderWidth: '0.5px' }}>
      <div className="flex flex-col items-center gap-0 w-full">
        <div className={`w-[52px] h-[52px] ${!isActive ? 'opacity-40' : ''}`}>
          <ChessPiece type="p" color={color} size={52} onDarkSquare={false} />
        </div>
        <span className={`text-base font-medium whitespace-nowrap ${
          isActive ? 'text-[#1c1917]' : 'text-[#979da9]'
        }`}>
          {label}
        </span>
        {isActive && !isGameOver && (
          <span className="text-xs font-mono text-stone-500 mt-0.5">{formatTime(time)}</span>
        )}
        <button
          onClick={onToggleAI}
          disabled={!engineReady}
          className={`mt-1.5 text-[10px] px-2 py-0.5 rounded-full border transition-colors disabled:opacity-40 ${
            playerKind === 'ai'
              ? 'bg-blue-100 border-blue-300 text-blue-700'
              : 'border-stone-300 text-stone-500 hover:bg-stone-50'
          }`}
        >
          {playerKind === 'ai' ? 'AI' : 'Human'}
        </button>
      </div>
    </div>
  )
}

function CapturedRow({ pieces, label }: { pieces: BoardPiece[]; label: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-stone-400 mb-1">{label}</div>
      <div className="flex flex-wrap gap-0.5 min-h-[28px] items-center">
        {pieces.length === 0 ? (
          <span className="text-stone-400 text-sm">—</span>
        ) : (
          pieces.map((p, i) => (
            <ChessPiece key={i} type={p.type} color={p.color} size={22} />
          ))
        )}
      </div>
    </div>
  )
}

const statusBadge: Record<GameStatus, { label: string; className: string } | null> = {
  playing: null,
  check: { label: 'Check!', className: 'bg-orange-100 text-orange-700 border border-orange-300' },
  checkmate: { label: 'Checkmate', className: 'bg-red-100 text-red-700 border border-red-300' },
  stalemate: { label: 'Stalemate — Draw', className: 'bg-stone-100 text-stone-600 border border-stone-300' },
  draw: { label: 'Draw', className: 'bg-stone-100 text-stone-600 border border-stone-300' },
}

function MoveControlContent({
  isDisabled,
  isGameOver,
  selectionText,
  canConfirm,
  hasFrom,
  selection,
  onConfirm,
  onCancel,
  pending,
  illegalReason,
}: {
  isDisabled: boolean
  isGameOver: boolean
  selectionText: string | null
  canConfirm: boolean
  hasFrom: boolean
  selection: MoveSelection
  onConfirm: () => void
  onCancel: () => void
  pending: boolean
  illegalReason: string | null
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs uppercase tracking-widest text-stone-400">Move Control</div>

      {isDisabled && (
        <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          Board not connected. Reconnect to send moves.
        </div>
      )}

      {illegalReason && (
        <div className="text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
          Illegal move: {illegalReason}
        </div>
      )}

      <div className="bg-[#f6f8fa] rounded-lg px-4 h-[44px] text-sm text-stone-700 flex items-center">
        {selectionText ? (
          <span>
            <span className="font-medium">Selected:</span>{' '}
            <span className="font-mono">{selectionText}</span>
          </span>
        ) : isGameOver ? (
          <span className="text-stone-400">Game has ended.</span>
        ) : (
          <span className="text-[#a8a29e]">Click a piece to select it</span>
        )}
      </div>

      {!isGameOver && (
        <p className="text-xs text-stone-400">
          {!selection.from
            ? 'Select one of your pieces on the board.'
            : !selection.to
            ? 'Now click a destination square.'
            : 'Press Confirm Move to execute.'}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={!canConfirm || pending}
          className="flex-1 h-[40px] rounded-lg font-medium text-[11px] transition-colors
            bg-[#292524] text-white hover:bg-stone-700
            disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {pending ? 'Sending…' : 'Confirm Move'}
        </button>
        <button
          onClick={onCancel}
          disabled={!hasFrom || pending}
          className="flex-1 h-[40px] rounded-lg font-medium text-[11px] border border-[#c4c7ce]
            text-[#504944] transition-colors hover:bg-stone-50
            disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function RightPanel({
  currentTurn,
  lastMove,
  capturedByWhite,
  capturedByBlack,
  gameStatus,
  connectionStatus,
  selection,
  whiteTime,
  blackTime,
  onConfirm,
  onCancel,
  pending,
  illegalReason,
  players,
  onPlayersChange,
  engineReady,
}: RightPanelProps) {
  const isDisabled = connectionStatus === 'disconnected'
  const isGameOver = gameStatus === 'checkmate' || gameStatus === 'stalemate' || gameStatus === 'draw'
  const badge = statusBadge[gameStatus]

  const selectionText = selection.piece && selection.from
    ? `${pieceLabel(selection.piece)} ${selection.from}${selection.to ? ` → ${selection.to}` : ''}`
    : null

  const canConfirm = !!(selection.from && selection.to && selection.piece) && !isDisabled && !isGameOver

  const moveControlProps = {
    isDisabled, isGameOver, selectionText, canConfirm,
    hasFrom: !!selection.from, selection, onConfirm, onCancel,
    pending, illegalReason,
  }

  return (
    <>
      {/* Scrollable content */}
      <div className="flex flex-col gap-5 p-4 sm:p-6 md:h-full md:overflow-y-auto pb-36 md:pb-6">

        {/* Status badge */}
        {badge && (
          <div className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-center ${badge.className}`}>
            {badge.label}
          </div>
        )}

        {/* Current Turn — two player cards */}
        <section>
          <div className="text-xs uppercase tracking-widest text-stone-400 mb-2">Current Turn</div>
          <div className="flex gap-2">
            <PlayerCard
              color="w" isActive={currentTurn === 'w'} isGameOver={isGameOver}
              time={whiteTime} playerKind={players.w} engineReady={engineReady}
              onToggleAI={() => onPlayersChange({ ...players, w: players.w === 'ai' ? 'human' : 'ai' })}
            />
            <PlayerCard
              color="b" isActive={currentTurn === 'b'} isGameOver={isGameOver}
              time={blackTime} playerKind={players.b} engineReady={engineReady}
              onToggleAI={() => onPlayersChange({ ...players, b: players.b === 'ai' ? 'human' : 'ai' })}
            />
          </div>
        </section>

        <div className="border-t border-stone-100" />

        {/* Last Move */}
        <section>
          <div className="text-xs uppercase tracking-widest text-stone-400 mb-2">Last Move</div>
          {lastMove ? (
            <div>
              <div className="text-xl font-bold text-stone-800 tracking-tight font-mono">
                {lastMove.from} → {lastMove.to}
                <span className="ml-2 text-sm font-normal text-stone-500">({lastMove.san})</span>
              </div>
              <div className="text-sm text-stone-500 mt-1">{moveDescription(lastMove)}</div>
            </div>
          ) : (
            <span className="text-stone-400 text-sm">No moves yet</span>
          )}
        </section>

        <div className="border-t border-stone-100" />

        {/* Captured */}
        <section className="flex flex-col gap-3">
          <div className="text-xs uppercase tracking-widest text-stone-400">Captured Pieces</div>
          <CapturedRow pieces={capturedByWhite} label="Captured by White" />
          <CapturedRow pieces={capturedByBlack} label="Captured by Black" />
        </section>

        <div className="border-t border-stone-100" />

        {/* Move Control — desktop only (mobile uses fixed footer below) */}
        <section className="hidden md:block">
          <MoveControlContent {...moveControlProps} />
        </section>
      </div>

      {/* Move Control — mobile fixed bottom (hidden on md+) */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-stone-200 px-4 pt-3 pb-4 z-40 md:hidden">
        <MoveControlContent {...moveControlProps} />
      </div>
    </>
  )
}
