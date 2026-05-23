@AGENTS.md

# Wizard Chess — Web Companion Interface

**Team 02** · Branch: `claude/wizarding-chess-web-interface-1xKGN`
**Stack:** Next.js 16.2.4 App Router · React 19 · Tailwind CSS v4 · chess.js v1.4.0 · TypeScript

> Next.js 16 has breaking changes. Read `node_modules/next/dist/docs/` before touching routing/layout.

---

## Files

```
app/lib/chess.ts          # types + chess.js helpers
app/components/
  ChessPiece.tsx          # <img> SVG pieces, CSS filter for w/b coloring
  ChessBoard.tsx          # 8×8 grid, square highlights, aria labels
  RightPanel.tsx          # turn indicator, last move, captured pieces, controls
  StatusHeader.tsx        # header-knight.svg + "Wizard Chess" (Cinzel Bold) + status dot
app/page.tsx              # intro page (page.tsx) + game page (app/game/page.tsx)
app/layout.tsx            # title: "Wizard Chess", favicon: /pieces/header-knight.svg
app/globals.css           # Tailwind v4, .team-da-spacing responsive letter-spacing
public/pieces/            # Bishop/King/Knight_1/Knight_2/Pawn/Queen/Rook.svg, header-knight.svg
public/intro/             # wizard.svg, chess.svg, piece-knight.webm, piece-queen.webm, assets
```

---

## Intro Page (app/page.tsx)

- Background: `#071426` + radial dim overlay
- Knight video: `w-[350vw] md:w-[260vw] xl:w-[180vw] 2xl:w-[150vw]`, width-based scaling, `top` per breakpoint — **do not touch, user manages video positioning**
- Title: `<img src="/intro/wizard.svg">` / `<img src="/intro/chess.svg">` with negative margins to tighten gap
- Team DA divider: Inter weight 100, `.team-da-spacing` class (15.82px / 26.46px / 30.24px)
- Connect button: white bg + `#00357d` text, hover `#cde2ff` (md+ only), navigates to `/game`

---

## Architecture

- All chess.js calls go through `useChessGame` in game page. Never split the Chess instance.
- `ChessBoard` is pure props — no internal state.
- Move flow: click piece → `selectSquare()` → highlights → click dest → Confirm → `confirmMove()` → `chess.move()` → `syncFromChess()`
- **Backend hook:** call `receiveMoveFromBoard(from, to)` when ESP32-S3 WebSocket ready.

---

## Square Highlight Priority

King in check > selected (amber) > destination (orange) > legal capture (red) > legal empty (blue) > last move (dotted) > base (cream/brown)

---

## Key Types

```ts
BoardPiece       { type: PieceSymbol, color: Color, square: Square }
LastMove         { from, to, san, piece, captured? }
GameStatus       'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw'
ConnectionStatus 'connected' | 'disconnected' | 'syncing'
```

---

## Deferred / Open

| Item | Status |
|------|--------|
| ESP32-S3 WebSocket sync | Hook into `receiveMoveFromBoard()` |
| Move animations | Planned |
| Pawn promotion UI | Auto-promotes to queen |
| Accessibility settings | Post-demo |

---

## Dev Commands

```bash
npm run dev       # localhost:3000
npx tsc --noEmit  # type-check
npm run build     # run before every commit
```
