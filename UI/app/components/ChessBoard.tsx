'use client'

import { BoardPiece, LegalMoveSquare, LastMove, squareToColRow, colRowToSquare } from '@/app/lib/chess'
import { Square } from 'chess.js'
import ChessPiece from './ChessPiece'

interface ChessBoardProps {
  board: (BoardPiece | null)[][]
  selectedSquare: Square | null
  destinationSquare: Square | null
  impactSquare?: Square | null
  legalMoves: LegalMoveSquare[]
  lastMove: LastMove | null
  inCheck: boolean
  currentTurn: 'w' | 'b'
  onSquareClick: (square: Square, piece: BoardPiece | null) => void
}

export default function ChessBoard({
  board,
  selectedSquare,
  destinationSquare,
  impactSquare,
  legalMoves,
  lastMove,
  inCheck,
  currentTurn,
  onSquareClick,
}: ChessBoardProps) {
  const legalSquareMap = new Map(legalMoves.map((m) => [m.square, m.isCapture]))

  const isLastMove = (sq: Square) =>
    sq === lastMove?.from || sq === lastMove?.to

  const kingSquare: Square | null = (() => {
    if (!inCheck) return null
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c]
        if (p && p.type === 'k' && p.color === currentTurn) return p.square
      }
    }
    return null
  })()

  const isLight = (r: number, c: number) => (r + c) % 2 !== 0

  return (
    // White card wrapper
    <div className="bg-white rounded-3xl lg:rounded-[40px] pt-1.5 pl-1.5 sm:pt-2.5 sm:pl-2.5 md:pt-2 md:pl-2 lg:pt-3 lg:pl-3 xl:pt-4 xl:pl-4 pb-5 pr-5 sm:pb-6 sm:pr-6 md:pb-5 md:pr-5 lg:pb-8 lg:pr-8 xl:pb-10 xl:pr-10 shadow-lg select-none">

      {/* File labels — top (a–h) */}
      <div className="flex pl-5 sm:pl-6 mb-1" aria-hidden="true">
        {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((file) => (
          <div
            key={file}
            className="w-10 sm:w-14 md:w-12 lg:w-16 xl:w-20 2xl:w-24 text-center text-xs sm:text-sm font-mono text-[#78716c]"
          >
            {file}
          </div>
        ))}
      </div>

      {/* Board: rank labels column (outside clip) + squares grid (overflow-hidden) */}
      <div className="flex">
        {/* Rank labels — separate column, not inside the clipped grid */}
        <div className="flex flex-col-reverse shrink-0 w-5 sm:w-6" aria-hidden="true">
          {board.map((_, rowIdx) => (
            <div
              key={rowIdx}
              className="h-10 sm:h-14 md:h-12 lg:h-16 xl:h-20 2xl:h-24 flex items-center justify-center text-xs sm:text-sm font-mono text-[#78716c]"
            >
              {rowIdx + 1}
            </div>
          ))}
        </div>

        {/* Squares grid — overflow-hidden so all 4 corners are rounded */}
        <div className="overflow-hidden rounded-2xl" role="grid" aria-label="Chess board">
          <div className="flex flex-col-reverse">
            {board.map((rowPieces, rowIdx) => (
              <div key={rowIdx} className="flex" role="row">
                {rowPieces.map((piece, colIdx) => {
                  const sq = colRowToSquare(colIdx, rowIdx)
                  const light = isLight(rowIdx, colIdx)
                  const isFrom = sq === selectedSquare
                  const isTo = sq === destinationSquare
                  const isImpact = sq === impactSquare
                  const legalCapture = legalSquareMap.get(sq)
                  const isLegal = legalSquareMap.has(sq)
                  const isLastMoveSquare = isLastMove(sq)
                  const isKingInCheck = sq === kingSquare

                  let bg = light ? 'bg-[#e4e7ec]' : 'bg-[#013c8c]'

                  if (isLegal && legalCapture === false)
                    bg = light ? 'bg-[#bfdbfe]' : 'bg-[#1d4ed8]'

                  if (isLegal && legalCapture === true)
                    bg = light ? 'bg-[#fca5a5]' : 'bg-[#ef4444]'

                  if (isTo) bg = light ? 'bg-[#fb923c]' : 'bg-[#ea580c]'
                  if (isFrom) bg = light ? 'bg-[#fbbf24]' : 'bg-[#d97706]'
                  if (isKingInCheck) bg = light ? 'bg-[#f87171]' : 'bg-[#dc2626]'

                  const pieceAriaLabel = piece
                    ? `${piece.color === 'w' ? 'White' : 'Black'} ${
                        { k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn' }[piece.type]
                      }`
                    : ''
                  const squareAriaLabel = `${sq}${pieceAriaLabel ? `, ${pieceAriaLabel}` : ''}${isFrom ? ', selected' : ''}${isTo ? ', destination' : ''}${isLegal ? ', legal move' : ''}`

                  return (
                    <button
                      key={colIdx}
                      role="gridcell"
                      className={`relative w-10 h-10 sm:w-14 sm:h-14 md:w-12 md:h-12 lg:w-16 lg:h-16 xl:w-20 xl:h-20 2xl:w-24 2xl:h-24 flex items-center justify-center transition-colors ${bg}
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400
                        ${isFrom ? 'ring-2 ring-inset ring-yellow-400' : ''}
                        ${isTo ? 'ring-2 ring-inset ring-orange-400' : ''}
                      `}
                      onClick={() => onSquareClick(sq, piece)}
                      aria-label={squareAriaLabel}
                      aria-selected={isFrom || isTo}
                      aria-pressed={isFrom || isTo}
                    >
                      {isLastMoveSquare && (
                        <div
                          className="absolute inset-0 pointer-events-none z-20"
                          style={{ border: '2px dashed rgba(0,0,0,0.25)' }}
                          aria-hidden="true"
                        />
                      )}
                      {piece && (
                        <div className="absolute inset-[8%] pointer-events-none z-10">
                          <ChessPiece type={piece.type} color={piece.color} onDarkSquare={!light} />
                        </div>
                      )}
                      {isImpact && (
                        <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden" aria-hidden="true">
                          <div className="board-impact-flash absolute inset-0" />
                          <div className="board-impact-ring absolute inset-[12%] rounded-full" />
                          <div className="board-impact-slash board-impact-slash-a absolute left-[12%] top-1/2 h-[10%] w-[76%] rounded-full bg-white" />
                          <div className="board-impact-slash board-impact-slash-b absolute left-[20%] top-1/2 h-[8%] w-[62%] rounded-full bg-[#fef3c7]" />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
