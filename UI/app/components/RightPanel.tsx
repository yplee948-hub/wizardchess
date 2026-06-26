'use client'

import { BoardPiece, LastMove, GameStatus, pieceLabel, moveDescription } from '@/app/lib/chess'
import { Square } from 'chess.js'
import ChessPiece from './ChessPiece'
import GameModeRow from './GameModeRow'
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
  onConfirm: () => void
  onCancel: () => void
  pending: boolean
  illegalReason: string | null
  players: PlayerConfig
  onPlayersChange: (p: PlayerConfig) => void
  engineReady: boolean
  localMode: boolean
  onLocalModeChange: (v: boolean) => void
  onResetBoard: () => void
}

function PlayerCard({
  color,
  isActive,
  isGameOver,
  playerKind,
  engineReady,
  onPlayersChange,
}: {
  color: 'w' | 'b'
  isActive: boolean
  isGameOver: boolean
  playerKind: 'human' | 'ai'
  engineReady: boolean
  onPlayersChange: (kind: 'human' | 'ai') => void
}) {
  const label = color === 'w'
    ? (isActive && !isGameOver ? "White's turn" : 'White')
    : (isActive && !isGameOver ? "Black's turn" : 'Black')

  return (
    <div className={`flex-1 flex flex-col items-center gap-1.5 pt-2 px-2 pb-2.5 rounded-lg border ${
      isActive
        ? 'bg-[#f5f9ff] border-[#4091ff]'
        : 'border-[#c4c7ce]'
    }`} style={{ borderWidth: '0.5px' }}>
      <div className={`w-[52px] h-[52px] ${!isActive ? 'opacity-40' : ''}`}>
        <ChessPiece type="p" color={color} size={52} onDarkSquare={false} />
      </div>
      <span className={`text-base font-medium whitespace-nowrap ${
        isActive ? 'text-[#1c1917]' : 'text-[#979da9]'
      }`}>
        {label}
      </span>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className={`text-xs font-medium transition-colors ${
          playerKind === 'ai' ? 'text-[#1d4ed8]' : 'text-stone-400'
        }`}>AI</span>
        <button
          onClick={() => onPlayersChange(playerKind === 'ai' ? 'human' : 'ai')}
          disabled={!engineReady && playerKind === 'human'}
          role="switch"
          aria-checked={playerKind === 'ai'}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4091ff] disabled:opacity-40 ${
            playerKind === 'ai' ? 'bg-[#1d4ed8]' : 'bg-stone-300'
          }`}
        >
          <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            playerKind === 'ai' ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`} />
        </button>
      </div>
    </div>
  )
}

function CapturedCard({
  capturedByWhite,
  capturedByBlack,
}: {
  capturedByWhite: BoardPiece[]
  capturedByBlack: BoardPiece[]
}) {
  return (
    <div className="flex rounded-lg border border-stone-200 overflow-hidden">
      <div className="flex-1 px-3 py-2.5 border-r border-stone-200">
        <div className="text-xs text-stone-400 mb-2 text-center">White</div>
        <div className="flex flex-wrap gap-1.5 min-h-[44px] items-center justify-center">
          {capturedByWhite.map((p, i) => (
            <ChessPiece key={i} type={p.type} color={p.color} size={40} />
          ))}
        </div>
      </div>
      <div className="flex-1 px-3 py-2.5">
        <div className="text-xs text-stone-400 mb-2 text-center">Black</div>
        <div className="flex flex-wrap gap-1.5 min-h-[44px] items-center justify-center">
          {capturedByBlack.map((p, i) => (
            <ChessPiece key={i} type={p.type} color={p.color} size={40} />
          ))}
        </div>
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
  onConfirm: () => void
  onCancel: () => void
  pending: boolean
  illegalReason: string | null
}) {
  return (
    <div className="flex flex-col gap-3">
      {isDisabled && (
        <div className="text-base text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          Board not connected. Reconnect to send moves.
        </div>
      )}

      {illegalReason && (
        <div className="text-base text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
          Illegal move: {illegalReason}
        </div>
      )}

      <div className="bg-[#f6f8fa] rounded-lg px-4 h-[44px] text-base text-stone-700 flex items-center">
        {selectionText ? (
          <span className="font-mono">{selectionText}</span>
        ) : isGameOver ? (
          <span className="text-stone-400">Game has ended.</span>
        ) : (
          <span className="text-[#a8a29e]">Click a piece to select it</span>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={!canConfirm || pending}
          className="flex-1 h-[44px] rounded-lg font-medium text-sm transition-colors
            bg-[#292524] text-white hover:bg-stone-700
            disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {pending ? 'Sending…' : 'Confirm Move'}
        </button>
        <button
          onClick={onCancel}
          disabled={!hasFrom || pending}
          className="flex-1 h-[44px] rounded-lg font-medium text-sm border border-[#c4c7ce]
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
  onConfirm,
  onCancel,
  pending,
  illegalReason,
  players,
  onPlayersChange,
  engineReady,
  localMode,
  onLocalModeChange,
  onResetBoard,
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
    hasFrom: !!selection.from, onConfirm, onCancel,
    pending, illegalReason,
  }

  return (
    <>
      {/* Scrollable content */}
      <div className="flex flex-col gap-10 p-4 pt-6 sm:p-6 sm:pt-6 md:pt-8 md:h-full md:overflow-y-auto pb-36 md:pb-6">

        {/* Status badge */}
        {badge && (
          <div className={`rounded-lg px-4 py-2.5 text-base font-semibold text-center ${badge.className}`}>
            {badge.label}
          </div>
        )}

        {/* Players */}
        <section>
          <div className="text-xs uppercase tracking-widest text-stone-400 mb-2">Players</div>
          <div className="flex gap-2">
            <PlayerCard
              color="w" isActive={currentTurn === 'w'} isGameOver={isGameOver}
              playerKind={players.w} engineReady={engineReady}
              onPlayersChange={(kind) => onPlayersChange({ ...players, w: kind })}
            />
            <PlayerCard
              color="b" isActive={currentTurn === 'b'} isGameOver={isGameOver}
              playerKind={players.b} engineReady={engineReady}
              onPlayersChange={(kind) => onPlayersChange({ ...players, b: kind })}
            />
          </div>
        </section>

        {/* Move Control — desktop only */}
        <section className="hidden md:block">
          <div className="text-xs uppercase tracking-widest text-stone-400 mb-2">Move Control</div>
          <MoveControlContent {...moveControlProps} />
        </section>

        {/* Last Move */}
        <section>
          <div className="text-xs uppercase tracking-widest text-stone-400 mb-2">Last Move</div>
          {lastMove ? (
            <div>
              <div className="text-xl md:text-2xl font-bold text-stone-800 tracking-tight font-mono">
                {lastMove.from} → {lastMove.to}
                <span className="ml-2 text-base font-normal text-stone-500">({lastMove.san})</span>
              </div>
              <div className="text-base text-stone-500 mt-1">{moveDescription(lastMove)}</div>
            </div>
          ) : (
            <span className="text-stone-400 text-base">No moves yet</span>
          )}
        </section>

        {/* Captured */}
        <section>
          <div className="text-xs uppercase tracking-widest text-stone-400 mb-2">Captured Pieces</div>
          <CapturedCard
            capturedByWhite={capturedByWhite}
            capturedByBlack={capturedByBlack}
          />
        </section>

        {/* Game Mode + Reset — mobile only. Lives in the scrollable column
            (not fixed) right after Captured Pieces, so the mobile Move
            Control bar pinned to the screen bottom never covers it. Desktop/
            tablet keep the row in its original spot below the panel. */}
        <section className="flex items-center justify-between md:hidden">
          <GameModeRow
            localMode={localMode}
            onLocalModeChange={onLocalModeChange}
            onResetBoard={onResetBoard}
            isDisabled={isDisabled}
          />
        </section>

      </div>

      {/* Move Control — mobile fixed bottom (hidden on md+) */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-stone-200 px-4 pt-3 pb-4 z-40 md:hidden">
        <MoveControlContent {...moveControlProps} />
      </div>
    </>
  )
}
