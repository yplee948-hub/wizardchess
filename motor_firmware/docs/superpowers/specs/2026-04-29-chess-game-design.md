# Chess Game Class Design

**Date:** 2026-04-29
**Project:** TECHIN 515 Group Final — Physical Chess Robot (CoreXY + Electromagnet)

---

## Overview

Two new C++ classes — `ChessGame` and `MovePlanner` — manage chess game state and physical move execution respectively. They are decoupled from `CoreXY` and `Electromagnet`: they produce data (board state, step sequences) that `main.cpp` acts on. This separation allows the classes to be tested on a PC or microcontroller without any motor hardware attached.

---

## Shared Types (`ChessTypes.h`)

```cpp
enum PieceType  { NONE, PAWN, ROOK, KNIGHT, BISHOP, QUEEN, KING };
enum PieceColor { WHITE, BLACK, NO_COLOR };

struct Piece    { PieceType type; PieceColor color; };
struct Position { char col; int row; };  // col 'A'–'H', row 1–8

struct PhysicalConfig {
    float originX, originY;  // physical XY of A1 in cm
    float stepX,   stepY;    // cm per square
};

enum StepType { MOVE_TO, MAGNET_ON, MAGNET_OFF };
struct Step   { StepType type; Position target; float x; float y; };
// x and y are only meaningful for MOVE_TO steps; set to 0 for MAGNET_ON/MAGNET_OFF
```

---

## `ChessGame`

### Responsibility
Owns the board state and enforces chess rules. Does not touch hardware or compute physical paths.

### Data
- `Piece board[8][8]` — 2D array indexed by column (0–7) and row (0–7)
- `PieceColor turn` — whose turn it is
- `std::vector<Piece> captured` — pieces that have been taken off the board

### Constructor / Initialization
```cpp
ChessGame();                        // standard starting position
ChessGame(Piece board[8][8]);       // custom starting position
void reset();                       // restore standard starting position
```

### Key Methods
```cpp
bool      isLegalMove(Position from, Position to);  // validates piece rules, turn, capture legality
bool      applyMove(Position from, Position to);    // updates board after physical move completes
PieceColor getTurn();
Piece     getPieceAt(Position pos);
bool      isEmpty(Position pos);
std::vector<Piece> getCaptured();
```

### Rules Implemented (core moves)
- Each piece type moves according to standard chess movement patterns
- A piece may not move to a square occupied by a friendly piece
- Capturing: moving to a square occupied by an enemy piece is legal (per piece rules)
- Turn alternation: WHITE moves first, turns alternate after each `applyMove()`
- **Not implemented:** castling, en passant, pawn promotion, check/checkmate/stalemate detection

### Notes
- `applyMove()` is called internally by `MovePlanner` at the moment `isMoveDone()` becomes true, keeping the board in sync with physical reality. `main.cpp` does not call it directly.
- Knight movement is rectilinear at the rules level (L-shape) but the physical path is still handled as rectilinear waypoints by `MovePlanner`.

---

## `MovePlanner`

### Responsibility
Holds a reference to `ChessGame` to read board state, computes a rectilinear physical path for a validated move, manages displaced and captured pieces, and exposes a step-by-step execution interface for sensor integration.

### Data
- `ChessGame& game` — reference to the game state
- `PhysicalConfig config` — physical grid constants
- `std::queue<Step> steps` — planned step sequence for the current move
- `BorderSlots capturedSlots` — registry of occupied/free parking slots around the board edge for captured pieces

### Physical Coordinate Mapping
```
physicalX(pos) = config.originX + (pos.col - 'A') * config.stepX
physicalY(pos) = config.originY + (pos.row - 1)  * config.stepY
```
Default values from current `main.cpp`: `originX=3.8`, `originY=5.5`, `stepX=5.0`, `stepY=5.0`.

### Path Planning Rules
- Paths are strictly rectilinear (horizontal then vertical, or vertical then horizontal — no diagonal movement)
- Direction chosen to minimize the number of blocking pieces on the primary leg
- For each blocking piece along the path: park it on the nearest orthogonally adjacent empty square (up/down/left/right only, no diagonal), complete the main move, then restore it
- Captured pieces are parked in the next free border slot around the board and tracked permanently

### Step Sequence (per move)
Each move compiles to an ordered queue of `Step` entries:
1. Sub-sequences for each blocking piece (MAGNET_ON → MOVE_TO park square → MAGNET_OFF)
2. MAGNET_ON → MOVE_TO destination → MAGNET_OFF for the main piece
3. Sub-sequences to restore each displaced blocking piece
4. If a capture: the captured piece sub-sequence runs before step 2, parking it at the border

### Key Methods
```cpp
MovePlanner(ChessGame& game, PhysicalConfig config);

bool startMove(Position from, Position to);  // plan full path; returns false if illegal
bool nextStep();                             // execute one Step, return true if more remain
bool isMoveDone();                           // true when step queue is empty
Step peekNextStep();                         // inspect next Step without advancing (for sensor hook)
```

### Sensor Integration Hook (future)
```cpp
// In main.cpp loop:
Step s = planner.peekNextStep();
// read hall effect sensor here — confirm piece presence if s.type == MOVE_TO
planner.nextStep();
// then act: xy.moveToCm(s.x, s.y) or magnet.on()/off()
```

---

## Integration in `main.cpp`

```cpp
ChessGame game;
MovePlanner planner(game, {3.8f, 5.5f, 5.0f, 5.0f});

// To make a move:
if (planner.startMove({'E', 2}, {'E', 4})) {
    while (!planner.isMoveDone()) {
        Step s = planner.peekNextStep();
        planner.nextStep();
        if (s.type == MOVE_TO)      xy.moveToCm(s.x, s.y);
        else if (s.type == MAGNET_ON)  magnet.on();
        else if (s.type == MAGNET_OFF) magnet.off();
    }
}
```

---

## File Structure

```
src/
  ChessTypes.h      — shared enums and structs
  ChessGame.h
  ChessGame.cpp
  MovePlanner.h
  MovePlanner.cpp
```

---

## Out of Scope (this spec)

- Castling, en passant, pawn promotion
- Check, checkmate, stalemate detection
- AI / computer opponent
- Hall effect sensor driver (integration point is defined, not implemented)
