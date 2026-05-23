import { Chess, Square, PieceSymbol, Color } from 'chess.js'

export type { Square, PieceSymbol, Color }

export interface BoardPiece {
  type: PieceSymbol
  color: Color
  square: Square
}

export type GameStatus = 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw'

export interface LastMove {
  from: Square
  to: Square
  san: string
  piece: BoardPiece
  captured?: BoardPiece
}

export interface LegalMoveSquare {
  square: Square
  isCapture: boolean
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'syncing'

// chess.js board() returns an 8x8 array indexed [rank8..rank1][fileA..fileH]
// We need to convert to our display format: row 0 = rank 1 (bottom)
export function chessBoardToDisplay(chess: Chess): (BoardPiece | null)[][] {
  const raw = chess.board() // row 0 = rank 8
  // Reverse so display row 0 = rank 1 (white side, bottom)
  return [...raw].reverse().map((row, rankIdx) =>
    row.map((cell) =>
      cell
        ? { type: cell.type, color: cell.color, square: cell.square }
        : null
    )
  )
}

export function getLegalMoves(chess: Chess, square: Square): LegalMoveSquare[] {
  const moves = chess.moves({ square, verbose: true })
  return moves.map((m) => ({
    square: m.to as Square,
    isCapture: m.flags.includes('c') || m.flags.includes('e'),
  }))
}

export function getGameStatus(chess: Chess): GameStatus {
  if (chess.isCheckmate()) return 'checkmate'
  if (chess.isStalemate()) return 'stalemate'
  if (chess.isDraw()) return 'draw'
  if (chess.isCheck()) return 'check'
  return 'playing'
}

export function squareToColRow(sq: Square): { col: number; row: number } {
  const col = sq.charCodeAt(0) - 97 // a=0, h=7
  const row = parseInt(sq[1]) - 1   // 1=0, 8=7
  return { col, row }
}

export function colRowToSquare(col: number, row: number): Square {
  return `${'abcdefgh'[col]}${row + 1}` as Square
}

export function pieceLabel(piece: BoardPiece): string {
  const names: Record<PieceSymbol, string> = {
    k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn',
  }
  return `${piece.color === 'w' ? 'White' : 'Black'} ${names[piece.type]}`
}

export function moveDescription(move: LastMove): string {
  const piece = pieceLabel(move.piece)
  if (move.captured) {
    return `${piece} captured ${pieceLabel(move.captured)} on ${move.to}`
  }
  return `${piece} moved from ${move.from} to ${move.to}`
}
