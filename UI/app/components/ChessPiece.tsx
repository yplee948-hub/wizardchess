import { PieceSymbol, Color } from 'chess.js'

interface ChessPieceProps {
  type: PieceSymbol
  color: Color
  size?: number       // fixed px; omit to fill parent container
  onDarkSquare?: boolean
}

const pieceFile: Record<PieceSymbol, (color: Color) => string> = {
  k: () => '/pieces/King.svg',
  q: () => '/pieces/Queen.svg',
  r: () => '/pieces/Rook.svg',
  b: () => '/pieces/Bishop.svg',
  n: (color) => color === 'w' ? '/pieces/Knight_1.svg' : '/pieces/Knight_2.svg',
  p: () => '/pieces/Pawn.svg',
}

const filterW = 'brightness(1.65) contrast(0.9) saturate(0.2) sepia(0.55) drop-shadow(1px 2px 1px rgba(80,50,0,0.4))'
const filterBDark = 'brightness(0.82) contrast(1.6) drop-shadow(0px 2px 4px rgba(0,8,35,0.9))'
const filterBLight = 'brightness(0.82) contrast(1.6) drop-shadow(1px 1px 3px rgba(255,255,255,0.5))'

export default function ChessPiece({ type, color, size, onDarkSquare }: ChessPieceProps) {
  const f = color === 'w' ? filterW : onDarkSquare ? filterBDark : filterBLight

  return (
    <img
      src={pieceFile[type](color)}
      alt=""
      aria-hidden="true"
      style={{
        filter: f,
        display: 'block',
        width: size ?? '100%',
        height: size ?? '100%',
      }}
      draggable={false}
    />
  )
}
