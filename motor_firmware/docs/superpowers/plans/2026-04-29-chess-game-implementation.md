# Chess Game Class Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `ChessGame` (board state + rules) and `MovePlanner` (rectilinear path planning + step-by-step execution) as pure C++ classes with no Arduino dependencies, testable via PlatformIO native environment.

**Architecture:** Two decoupled classes share types defined in `ChessTypes.h`. `ChessGame` enforces chess rules and owns board state. `MovePlanner` holds a reference to `ChessGame`, computes rectilinear physical paths, generates step-by-step `Step` queues for `main.cpp` to execute against `CoreXY` and `Electromagnet`.

**Tech Stack:** C++17, PlatformIO native environment, Unity test framework (bundled with PlatformIO)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/ChessTypes.h` | Create | Shared enums, structs (Piece, Position, Step, PhysicalConfig) |
| `src/ChessGame.h` | Create | ChessGame class declaration |
| `src/ChessGame.cpp` | Create | ChessGame implementation |
| `src/MovePlanner.h` | Create | MovePlanner class declaration |
| `src/MovePlanner.cpp` | Create | MovePlanner implementation |
| `platformio.ini` | Modify | Add `[env:native]` for host-side unit testing |
| `test/test_chess_game/test_chess_game.cpp` | Create | Unit tests for ChessGame |
| `test/test_move_planner/test_move_planner.cpp` | Create | Unit tests for MovePlanner |
| `src/main.cpp` | Modify | Add ChessGame + MovePlanner usage example |

---

## Task 1: Shared Types + Native Test Environment

**Files:**
- Create: `src/ChessTypes.h`
- Modify: `platformio.ini`

- [ ] **Step 1: Create `src/ChessTypes.h`**

```cpp
#pragma once
#include <cstdint>

enum PieceType  : uint8_t { NONE, PAWN, ROOK, KNIGHT, BISHOP, QUEEN, KING };
enum PieceColor : uint8_t { NO_COLOR, WHITE, BLACK };

struct Piece {
    PieceType  type  = NONE;
    PieceColor color = NO_COLOR;
};

struct Position {
    char col = 'A';  // 'A'–'H'
    int  row = 1;    // 1–8
    bool operator==(const Position& o) const { return col == o.col && row == o.row; }
    bool operator!=(const Position& o) const { return !(*this == o); }
};

struct PhysicalConfig {
    float originX = 3.8f;   // physical X of A-file in cm
    float originY = 5.5f;   // physical Y of rank 1 in cm
    float stepX   = 5.0f;   // cm per file
    float stepY   = 5.0f;   // cm per rank
};

enum  StepType { MOVE_TO, MAGNET_ON, MAGNET_OFF };

struct Step {
    StepType type   = MOVE_TO;
    Position target = {};    // chess square (meaningful for on-board MOVE_TO)
    float    x      = 0.0f; // physical X in cm (authoritative for all MOVE_TO)
    float    y      = 0.0f; // physical Y in cm (authoritative for all MOVE_TO)
    // x and y are 0 for MAGNET_ON / MAGNET_OFF steps
};
```

- [ ] **Step 2: Add native test environment to `platformio.ini`**

```ini
[env:seeed_xiao_esp32s3]
platform = espressif32
board = seeed_xiao_esp32s3
framework = arduino
lib_deps = adafruit/Adafruit VEML7700 Library@^2.1.6

[env:native]
platform = native
```

- [ ] **Step 3: Verify it compiles (no test yet — just confirm headers parse)**

```bash
pio run -e native
```

Expected: BUILD SUCCESS (nothing to compile yet, just checks environment).

- [ ] **Step 4: Commit**

```bash
git add src/ChessTypes.h platformio.ini
git commit -m "feat: add ChessTypes header and native test env"
```

---

## Task 2: ChessGame — Board Initialisation

**Files:**
- Create: `src/ChessGame.h`
- Create: `src/ChessGame.cpp`
- Create: `test/test_chess_game/test_chess_game.cpp`

- [ ] **Step 1: Write the failing tests**

Create `test/test_chess_game/test_chess_game.cpp`:

```cpp
#include <unity.h>
#include "../../src/ChessGame.h"

void setUp()    {}
void tearDown() {}

// ── Standard init ──────────────────────────────────────────────
void test_standard_white_pawn_row2() {
    ChessGame g;
    Piece p = g.getPieceAt({'E', 2});
    TEST_ASSERT_EQUAL(PAWN,  p.type);
    TEST_ASSERT_EQUAL(WHITE, p.color);
}

void test_standard_black_pawn_row7() {
    ChessGame g;
    Piece p = g.getPieceAt({'D', 7});
    TEST_ASSERT_EQUAL(PAWN,  p.type);
    TEST_ASSERT_EQUAL(BLACK, p.color);
}

void test_standard_white_king_e1() {
    ChessGame g;
    Piece p = g.getPieceAt({'E', 1});
    TEST_ASSERT_EQUAL(KING,  p.type);
    TEST_ASSERT_EQUAL(WHITE, p.color);
}

void test_standard_empty_e4() {
    ChessGame g;
    TEST_ASSERT_TRUE(g.isEmpty({'E', 4}));
}

// ── Custom init ────────────────────────────────────────────────
void test_custom_board() {
    Piece board[8][8] = {};
    board[0][4] = {KING, WHITE};  // E1
    board[7][4] = {KING, BLACK};  // E8
    ChessGame g(board);
    TEST_ASSERT_EQUAL(KING, g.getPieceAt({'E', 1}).type);
    TEST_ASSERT_EQUAL(KING, g.getPieceAt({'E', 8}).type);
    TEST_ASSERT_TRUE(g.isEmpty({'E', 4}));
}

// ── Reset ──────────────────────────────────────────────────────
void test_reset_restores_standard() {
    Piece board[8][8] = {};
    board[0][4] = {KING, WHITE};
    ChessGame g(board);
    g.reset();
    Piece p = g.getPieceAt({'A', 1});
    TEST_ASSERT_EQUAL(ROOK,  p.type);
    TEST_ASSERT_EQUAL(WHITE, p.color);
}

int main() {
    UNITY_BEGIN();
    RUN_TEST(test_standard_white_pawn_row2);
    RUN_TEST(test_standard_black_pawn_row7);
    RUN_TEST(test_standard_white_king_e1);
    RUN_TEST(test_standard_empty_e4);
    RUN_TEST(test_custom_board);
    RUN_TEST(test_reset_restores_standard);
    return UNITY_END();
}
```

- [ ] **Step 2: Create `src/ChessGame.h`**

```cpp
#pragma once
#include "ChessTypes.h"
#include <vector>

class ChessGame {
public:
    ChessGame();
    explicit ChessGame(const Piece board[8][8]);
    void reset();

    bool       isLegalMove(Position from, Position to) const;
    bool       applyMove(Position from, Position to);
    PieceColor getTurn()              const;
    Piece      getPieceAt(Position p) const;
    bool       isEmpty(Position p)    const;
    const std::vector<Piece>& getCaptured() const;

private:
    Piece      _board[8][8];   // [rowIdx 0–7][colIdx 0–7]
    PieceColor _turn = WHITE;
    std::vector<Piece> _captured;

    void initStandard();

    bool isPawnMove  (Position from, Position to) const;
    bool isRookMove  (Position from, Position to) const;
    bool isKnightMove(Position from, Position to) const;
    bool isBishopMove(Position from, Position to) const;
    bool isQueenMove (Position from, Position to) const;
    bool isKingMove  (Position from, Position to) const;
    bool isPathClear (Position from, Position to) const;

    static int ci(Position p) { return p.col - 'A'; }
    static int ri(Position p) { return p.row - 1; }

    Piece&       at(Position p)       { return _board[ri(p)][ci(p)]; }
    const Piece& at(Position p) const { return _board[ri(p)][ci(p)]; }
};
```

- [ ] **Step 3: Create `src/ChessGame.cpp` with init only**

```cpp
#include "ChessGame.h"
#include <cstring>

ChessGame::ChessGame() { initStandard(); }

ChessGame::ChessGame(const Piece board[8][8]) {
    memcpy(_board, board, sizeof(_board));
}

void ChessGame::reset() {
    _turn = WHITE;
    _captured.clear();
    initStandard();
}

void ChessGame::initStandard() {
    for (int r = 0; r < 8; r++)
        for (int c = 0; c < 8; c++)
            _board[r][c] = {NONE, NO_COLOR};

    PieceType backRank[] = {ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK};
    for (int c = 0; c < 8; c++) {
        _board[0][c] = {backRank[c], WHITE};
        _board[1][c] = {PAWN, WHITE};
        _board[6][c] = {PAWN, BLACK};
        _board[7][c] = {backRank[c], BLACK};
    }
}

PieceColor ChessGame::getTurn()              const { return _turn; }
Piece      ChessGame::getPieceAt(Position p) const { return at(p); }
bool       ChessGame::isEmpty(Position p)    const { return at(p).type == NONE; }
const std::vector<Piece>& ChessGame::getCaptured() const { return _captured; }

// Stubs — will be filled in Tasks 3–6
bool ChessGame::isLegalMove(Position, Position) const { return false; }
bool ChessGame::applyMove(Position, Position)         { return false; }
bool ChessGame::isPawnMove  (Position, Position) const { return false; }
bool ChessGame::isRookMove  (Position, Position) const { return false; }
bool ChessGame::isKnightMove(Position, Position) const { return false; }
bool ChessGame::isBishopMove(Position, Position) const { return false; }
bool ChessGame::isQueenMove (Position, Position) const { return false; }
bool ChessGame::isKingMove  (Position, Position) const { return false; }
bool ChessGame::isPathClear (Position, Position) const { return false; }
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pio test -e native -f test_chess_game -v
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ChessGame.h src/ChessGame.cpp test/test_chess_game/test_chess_game.cpp
git commit -m "feat: ChessGame board init, custom board, reset"
```

---

## Task 3: ChessGame — Pawn Move Validation (TDD)

**Files:**
- Modify: `test/test_chess_game/test_chess_game.cpp`
- Modify: `src/ChessGame.cpp`

- [ ] **Step 1: Add pawn tests to `test_chess_game.cpp`**

Add these test functions and register them in `main()`:

```cpp
// ── Pawn moves ─────────────────────────────────────────────────
void test_pawn_forward_one() {
    ChessGame g;
    TEST_ASSERT_TRUE(g.isLegalMove({'E', 2}, {'E', 3}));
}

void test_pawn_forward_two_from_start() {
    ChessGame g;
    TEST_ASSERT_TRUE(g.isLegalMove({'E', 2}, {'E', 4}));
}

void test_pawn_forward_two_blocked_by_piece_at_e3() {
    Piece board[8][8] = {};
    board[1][4] = {PAWN, WHITE};   // E2
    board[2][4] = {PAWN, BLACK};   // E3 — blocker
    ChessGame g(board);
    TEST_ASSERT_FALSE(g.isLegalMove({'E', 2}, {'E', 4}));
}

void test_pawn_cannot_go_backward() {
    Piece board[8][8] = {};
    board[2][4] = {PAWN, WHITE};   // E3
    ChessGame g(board);
    TEST_ASSERT_FALSE(g.isLegalMove({'E', 3}, {'E', 2}));
}

void test_pawn_diagonal_capture_legal() {
    Piece board[8][8] = {};
    board[3][4] = {PAWN, WHITE};   // E4
    board[4][3] = {PAWN, BLACK};   // D5 — enemy
    ChessGame g(board);
    TEST_ASSERT_TRUE(g.isLegalMove({'E', 4}, {'D', 5}));
}

void test_pawn_diagonal_no_capture_illegal() {
    ChessGame g;   // D3 is empty
    TEST_ASSERT_FALSE(g.isLegalMove({'E', 2}, {'D', 3}));
}

void test_pawn_cannot_capture_forward() {
    Piece board[8][8] = {};
    board[1][4] = {PAWN, WHITE};   // E2
    board[2][4] = {PAWN, BLACK};   // E3 — blocked
    ChessGame g(board);
    TEST_ASSERT_FALSE(g.isLegalMove({'E', 2}, {'E', 3}));
}
```

In `main()` add:
```cpp
RUN_TEST(test_pawn_forward_one);
RUN_TEST(test_pawn_forward_two_from_start);
RUN_TEST(test_pawn_forward_two_blocked_by_piece_at_e3);
RUN_TEST(test_pawn_cannot_go_backward);
RUN_TEST(test_pawn_diagonal_capture_legal);
RUN_TEST(test_pawn_diagonal_no_capture_illegal);
RUN_TEST(test_pawn_cannot_capture_forward);
```

- [ ] **Step 2: Run to confirm failures**

```bash
pio test -e native -f test_chess_game -v
```

Expected: new pawn tests FAIL (isLegalMove always returns false).

- [ ] **Step 3: Implement `isLegalMove` and `isPawnMove` in `ChessGame.cpp`**

Replace the stubs:

```cpp
bool ChessGame::isLegalMove(Position from, Position to) const {
    if (from.col < 'A' || from.col > 'H' || from.row < 1 || from.row > 8) return false;
    if (to.col   < 'A' || to.col   > 'H' || to.row   < 1 || to.row   > 8) return false;
    if (from == to) return false;
    const Piece& mover = at(from);
    if (mover.type == NONE)           return false;
    if (mover.color != _turn)         return false;
    if (!isEmpty(to) && at(to).color == mover.color) return false;
    switch (mover.type) {
        case PAWN:   return isPawnMove(from, to);
        case ROOK:   return isRookMove(from, to);
        case KNIGHT: return isKnightMove(from, to);
        case BISHOP: return isBishopMove(from, to);
        case QUEEN:  return isQueenMove(from, to);
        case KING:   return isKingMove(from, to);
        default:     return false;
    }
}

bool ChessGame::isPawnMove(Position from, Position to) const {
    int dc  = ci(to) - ci(from);
    int dr  = ri(to) - ri(from);
    int dir = (at(from).color == WHITE) ? 1 : -1;
    int startRi = (at(from).color == WHITE) ? 1 : 6;

    // Forward 1 — destination must be empty
    if (dc == 0 && dr == dir && isEmpty(to)) return true;

    // Forward 2 from starting rank — both squares must be empty
    if (dc == 0 && dr == 2 * dir && ri(from) == startRi) {
        Position mid = {from.col, from.row + dir};
        return isEmpty(mid) && isEmpty(to);
    }

    // Diagonal capture — must be an enemy piece at destination
    if ((dc == 1 || dc == -1) && dr == dir && !isEmpty(to))
        return true;  // friendly-fire already blocked in isLegalMove

    return false;
}
```

- [ ] **Step 4: Run tests — all pass**

```bash
pio test -e native -f test_chess_game -v
```

Expected: 13 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ChessGame.cpp test/test_chess_game/test_chess_game.cpp
git commit -m "feat: pawn move validation"
```

---

## Task 4: ChessGame — Sliding Pieces (Rook, Bishop, Queen)

**Files:**
- Modify: `test/test_chess_game/test_chess_game.cpp`
- Modify: `src/ChessGame.cpp`

- [ ] **Step 1: Add sliding piece tests**

```cpp
// ── Rook ───────────────────────────────────────────────────────
void test_rook_horizontal_clear() {
    Piece board[8][8] = {};
    board[2][0] = {ROOK, WHITE};   // A3
    ChessGame g(board);
    TEST_ASSERT_TRUE(g.isLegalMove({'A', 3}, {'E', 3}));
}

void test_rook_blocked_by_friendly() {
    Piece board[8][8] = {};
    board[2][0] = {ROOK,  WHITE};  // A3
    board[2][2] = {PAWN,  WHITE};  // C3 — friendly blocker
    ChessGame g(board);
    TEST_ASSERT_FALSE(g.isLegalMove({'A', 3}, {'E', 3}));
}

void test_rook_cannot_move_diagonal() {
    Piece board[8][8] = {};
    board[0][0] = {ROOK, WHITE};   // A1
    ChessGame g(board);
    TEST_ASSERT_FALSE(g.isLegalMove({'A', 1}, {'D', 4}));
}

// ── Bishop ─────────────────────────────────────────────────────
void test_bishop_diagonal_clear() {
    Piece board[8][8] = {};
    board[0][2] = {BISHOP, WHITE};  // C1
    ChessGame g(board);
    TEST_ASSERT_TRUE(g.isLegalMove({'C', 1}, {'F', 4}));
}

void test_bishop_blocked() {
    Piece board[8][8] = {};
    board[0][2] = {BISHOP, WHITE};  // C1
    board[1][3] = {PAWN,   WHITE};  // D2 — blocker
    ChessGame g(board);
    TEST_ASSERT_FALSE(g.isLegalMove({'C', 1}, {'F', 4}));
}

void test_bishop_cannot_move_straight() {
    Piece board[8][8] = {};
    board[0][2] = {BISHOP, WHITE};  // C1
    ChessGame g(board);
    TEST_ASSERT_FALSE(g.isLegalMove({'C', 1}, {'C', 4}));
}

// ── Queen ──────────────────────────────────────────────────────
void test_queen_straight_clear() {
    Piece board[8][8] = {};
    board[0][3] = {QUEEN, WHITE};   // D1
    ChessGame g(board);
    TEST_ASSERT_TRUE(g.isLegalMove({'D', 1}, {'D', 5}));
}

void test_queen_diagonal_clear() {
    Piece board[8][8] = {};
    board[0][3] = {QUEEN, WHITE};   // D1
    ChessGame g(board);
    TEST_ASSERT_TRUE(g.isLegalMove({'D', 1}, {'G', 4}));
}
```

Add all 8 to `main()` with `RUN_TEST(...)`.

- [ ] **Step 2: Run to confirm failures**

```bash
pio test -e native -f test_chess_game -v
```

Expected: new sliding piece tests FAIL.

- [ ] **Step 3: Implement `isPathClear`, `isRookMove`, `isBishopMove`, `isQueenMove`**

```cpp
bool ChessGame::isPathClear(Position from, Position to) const {
    int dc = ci(to) - ci(from);
    int dr = ri(to) - ri(from);
    int stepC = (dc == 0) ? 0 : (dc > 0 ? 1 : -1);
    int stepR = (dr == 0) ? 0 : (dr > 0 ? 1 : -1);
    int c = ci(from) + stepC;
    int r = ri(from) + stepR;
    while (c != ci(to) || r != ri(to)) {
        if (_board[r][c].type != NONE) return false;
        c += stepC;
        r += stepR;
    }
    return true;
}

bool ChessGame::isRookMove(Position from, Position to) const {
    int dc = ci(to) - ci(from);
    int dr = ri(to) - ri(from);
    if (dc != 0 && dr != 0) return false;
    return isPathClear(from, to);
}

bool ChessGame::isBishopMove(Position from, Position to) const {
    int dc = ci(to) - ci(from);
    int dr = ri(to) - ri(from);
    if (dc < 0) dc = -dc;
    if (dr < 0) dr = -dr;
    if (dc != dr) return false;
    return isPathClear(from, to);
}

bool ChessGame::isQueenMove(Position from, Position to) const {
    return isRookMove(from, to) || isBishopMove(from, to);
}
```

- [ ] **Step 4: Run tests — all pass**

```bash
pio test -e native -f test_chess_game -v
```

Expected: 21 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ChessGame.cpp test/test_chess_game/test_chess_game.cpp
git commit -m "feat: rook, bishop, queen move validation"
```

---

## Task 5: ChessGame — Knight and King

**Files:**
- Modify: `test/test_chess_game/test_chess_game.cpp`
- Modify: `src/ChessGame.cpp`

- [ ] **Step 1: Add knight and king tests**

```cpp
// ── Knight ─────────────────────────────────────────────────────
void test_knight_l_shape() {
    Piece board[8][8] = {};
    board[0][1] = {KNIGHT, WHITE};   // B1
    ChessGame g(board);
    TEST_ASSERT_TRUE(g.isLegalMove({'B', 1}, {'C', 3}));
    TEST_ASSERT_TRUE(g.isLegalMove({'B', 1}, {'A', 3}));
    TEST_ASSERT_TRUE(g.isLegalMove({'B', 1}, {'D', 2}));
}

void test_knight_jumps_over_pieces() {
    ChessGame g;  // B1 knight surrounded by pawns — can still jump
    TEST_ASSERT_TRUE(g.isLegalMove({'B', 1}, {'C', 3}));
}

void test_knight_invalid_move() {
    Piece board[8][8] = {};
    board[0][1] = {KNIGHT, WHITE};   // B1
    ChessGame g(board);
    TEST_ASSERT_FALSE(g.isLegalMove({'B', 1}, {'B', 3}));
}

// ── King ───────────────────────────────────────────────────────
void test_king_one_step_any_direction() {
    Piece board[8][8] = {};
    board[3][4] = {KING, WHITE};   // E4
    ChessGame g(board);
    TEST_ASSERT_TRUE(g.isLegalMove({'E', 4}, {'E', 5}));
    TEST_ASSERT_TRUE(g.isLegalMove({'E', 4}, {'D', 4}));
    TEST_ASSERT_TRUE(g.isLegalMove({'E', 4}, {'F', 3}));
}

void test_king_cannot_move_two_squares() {
    Piece board[8][8] = {};
    board[3][4] = {KING, WHITE};   // E4
    ChessGame g(board);
    TEST_ASSERT_FALSE(g.isLegalMove({'E', 4}, {'E', 6}));
}
```

Add 5 tests to `main()`.

- [ ] **Step 2: Run to confirm failures**

```bash
pio test -e native -f test_chess_game -v
```

Expected: new knight/king tests FAIL.

- [ ] **Step 3: Implement `isKnightMove` and `isKingMove`**

```cpp
bool ChessGame::isKnightMove(Position from, Position to) const {
    int dc = ci(to) - ci(from);  if (dc < 0) dc = -dc;
    int dr = ri(to) - ri(from);  if (dr < 0) dr = -dr;
    return (dc == 1 && dr == 2) || (dc == 2 && dr == 1);
}

bool ChessGame::isKingMove(Position from, Position to) const {
    int dc = ci(to) - ci(from);  if (dc < 0) dc = -dc;
    int dr = ri(to) - ri(from);  if (dr < 0) dr = -dr;
    return dc <= 1 && dr <= 1;
}
```

- [ ] **Step 4: Run tests — all pass**

```bash
pio test -e native -f test_chess_game -v
```

Expected: 26 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ChessGame.cpp test/test_chess_game/test_chess_game.cpp
git commit -m "feat: knight and king move validation"
```

---

## Task 6: ChessGame — Turn Validation, `applyMove`, Capture Tracking

**Files:**
- Modify: `test/test_chess_game/test_chess_game.cpp`
- Modify: `src/ChessGame.cpp`

- [ ] **Step 1: Add tests**

```cpp
// ── Turn validation ────────────────────────────────────────────
void test_black_cannot_move_on_whites_turn() {
    ChessGame g;
    TEST_ASSERT_FALSE(g.isLegalMove({'E', 7}, {'E', 6}));  // black pawn, white's turn
}

// ── applyMove ──────────────────────────────────────────────────
void test_apply_move_updates_board() {
    ChessGame g;
    g.applyMove({'E', 2}, {'E', 4});
    TEST_ASSERT_TRUE(g.isEmpty({'E', 2}));
    Piece p = g.getPieceAt({'E', 4});
    TEST_ASSERT_EQUAL(PAWN,  p.type);
    TEST_ASSERT_EQUAL(WHITE, p.color);
}

void test_apply_move_alternates_turn() {
    ChessGame g;
    TEST_ASSERT_EQUAL(WHITE, g.getTurn());
    g.applyMove({'E', 2}, {'E', 4});
    TEST_ASSERT_EQUAL(BLACK, g.getTurn());
}

void test_apply_move_capture_adds_to_captured() {
    Piece board[8][8] = {};
    board[3][4] = {PAWN, WHITE};  // E4
    board[4][3] = {PAWN, BLACK};  // D5 — enemy
    ChessGame g(board);
    g.applyMove({'E', 4}, {'D', 5});
    TEST_ASSERT_EQUAL(1u, g.getCaptured().size());
    TEST_ASSERT_EQUAL(BLACK, g.getCaptured()[0].color);
}

void test_apply_move_illegal_returns_false() {
    ChessGame g;
    TEST_ASSERT_FALSE(g.applyMove({'E', 2}, {'E', 5}));  // too far for pawn
}
```

Add 5 tests to `main()`.

- [ ] **Step 2: Run to confirm failures**

```bash
pio test -e native -f test_chess_game -v
```

Expected: new turn/apply tests FAIL.

- [ ] **Step 3: Implement `applyMove`**

```cpp
bool ChessGame::applyMove(Position from, Position to) {
    if (!isLegalMove(from, to)) return false;
    if (!isEmpty(to)) _captured.push_back(at(to));
    at(to)   = at(from);
    at(from) = {NONE, NO_COLOR};
    _turn    = (_turn == WHITE) ? BLACK : WHITE;
    return true;
}
```

- [ ] **Step 4: Run tests — all pass**

```bash
pio test -e native -f test_chess_game -v
```

Expected: 31 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ChessGame.cpp test/test_chess_game/test_chess_game.cpp
git commit -m "feat: applyMove, turn alternation, capture tracking"
```

---

## Task 7: MovePlanner — Setup + Coordinate Mapping

**Files:**
- Create: `src/MovePlanner.h`
- Create: `src/MovePlanner.cpp`
- Create: `test/test_move_planner/test_move_planner.cpp`

- [ ] **Step 1: Create `src/MovePlanner.h`**

```cpp
#pragma once
#include "ChessTypes.h"
#include "ChessGame.h"
#include <queue>
#include <vector>
#include <utility>

class MovePlanner {
public:
    MovePlanner(ChessGame& game, PhysicalConfig config);

    bool startMove(Position from, Position to);
    bool nextStep();
    bool isMoveDone() const;
    Step peekNextStep() const;

private:
    ChessGame&     _game;
    PhysicalConfig _cfg;
    std::queue<Step> _steps;

    Position _pendingFrom = {};
    Position _pendingTo   = {};
    bool     _hasPending  = false;

    // Pre-computed border parking slots for captured pieces (physical XY pairs)
    std::vector<std::pair<float, float>> _capturedSlots;
    int _nextSlot = 0;

    void initCapturedSlots();

    // Path planning helpers
    std::vector<Position> rectilinearPath(Position from, Position to) const;
    Position findParkSquare(Position blocked, const Piece planBoard[8][8]) const;
    void appendPickAndPlace(Position from, Position to);
    void appendCaptureParkXY(Position capturedAt, float px, float py);
    void copyGameBoard(Piece out[8][8]) const;

    float physX(Position p) const;
    float physY(Position p) const;
    Step  moveStep(Position p) const;
    Step  moveStepXY(float x, float y) const;
};
```

- [ ] **Step 2: Create `src/MovePlanner.cpp` (coordinate mapping + init only)**

```cpp
#include "MovePlanner.h"
#include <cstring>

MovePlanner::MovePlanner(ChessGame& game, PhysicalConfig config)
    : _game(game), _cfg(config) {
    initCapturedSlots();
}

// Pre-generate 24 border parking slots (8 bottom, 8 top, 8 right)
void MovePlanner::initCapturedSlots() {
    float margin = _cfg.stepY * 0.5f;
    float yBottom = _cfg.originY - margin;
    float yTop    = _cfg.originY + 7.0f * _cfg.stepY + margin;
    float xRight  = _cfg.originX + 7.0f * _cfg.stepX + _cfg.stepX * 0.5f;

    for (int c = 0; c < 8; c++)
        _capturedSlots.push_back({_cfg.originX + c * _cfg.stepX, yBottom});
    for (int c = 0; c < 8; c++)
        _capturedSlots.push_back({_cfg.originX + c * _cfg.stepX, yTop});
    for (int r = 0; r < 8; r++)
        _capturedSlots.push_back({xRight, _cfg.originY + r * _cfg.stepY});
}

float MovePlanner::physX(Position p) const {
    return _cfg.originX + (p.col - 'A') * _cfg.stepX;
}
float MovePlanner::physY(Position p) const {
    return _cfg.originY + (p.row - 1)   * _cfg.stepY;
}

Step MovePlanner::moveStep(Position p) const {
    return {MOVE_TO, p, physX(p), physY(p)};
}
Step MovePlanner::moveStepXY(float x, float y) const {
    return {MOVE_TO, {'Z', 0}, x, y};
}

void MovePlanner::copyGameBoard(Piece out[8][8]) const {
    for (int r = 0; r < 8; r++)
        for (int c = 0; c < 8; c++)
            out[r][c] = _game.getPieceAt({(char)('A' + c), r + 1});
}

// Stubs — implemented in Tasks 8–11
bool MovePlanner::startMove(Position, Position)  { return false; }
bool MovePlanner::nextStep()                     { return false; }
bool MovePlanner::isMoveDone()             const { return true; }
Step MovePlanner::peekNextStep()           const { return {}; }

std::vector<Position> MovePlanner::rectilinearPath(Position, Position) const { return {}; }
Position MovePlanner::findParkSquare(Position b, const Piece[8][8]) const { return b; }
void MovePlanner::appendPickAndPlace(Position, Position) {}
void MovePlanner::appendCaptureParkXY(Position, float, float) {}
```

- [ ] **Step 3: Create `test/test_move_planner/test_move_planner.cpp` with coordinate test**

```cpp
#include <unity.h>
#include "../../src/MovePlanner.h"

void setUp()    {}
void tearDown() {}

static ChessGame makeMinimalGame(Position whitePiecePos, PieceType type) {
    Piece board[8][8] = {};
    board[whitePiecePos.row - 1][whitePiecePos.col - 'A'] = {type, WHITE};
    return ChessGame(board);
}

void test_phys_coords_a1() {
    Piece board[8][8] = {};
    board[0][0] = {ROOK, WHITE};   // A1
    ChessGame g(board);
    MovePlanner p(g, {3.8f, 5.5f, 5.0f, 5.0f});
    // Verify by checking the step x/y after a single-square move
    // A1 → A2: MOVE_TO A1 step should have x=3.8, y=5.5
    // We can't call startMove yet, so just verify init doesn't crash
    TEST_ASSERT_FALSE(p.isMoveDone() == false);   // isMoveDone() == true (queue empty)
    TEST_ASSERT_TRUE(p.isMoveDone());
}

int main() {
    UNITY_BEGIN();
    RUN_TEST(test_phys_coords_a1);
    return UNITY_END();
}
```

- [ ] **Step 4: Run both test suites**

```bash
pio test -e native -v
```

Expected: 32 total tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/MovePlanner.h src/MovePlanner.cpp test/test_move_planner/test_move_planner.cpp
git commit -m "feat: MovePlanner skeleton, coordinate mapping, border slot init"
```

---

## Task 8: MovePlanner — Simple Move (No Obstacles)

**Files:**
- Modify: `test/test_move_planner/test_move_planner.cpp`
- Modify: `src/MovePlanner.cpp`

- [ ] **Step 1: Add step-sequence tests**

```cpp
// Helper: drain queue into a vector for inspection
static std::vector<Step> drainSteps(MovePlanner& p) {
    std::vector<Step> steps;
    while (!p.isMoveDone()) {
        steps.push_back(p.peekNextStep());
        p.nextStep();
    }
    return steps;
}

void test_simple_vertical_move_step_count() {
    // E2 → E4: MOVE_TO E2, MAGNET_ON, MOVE_TO E3, MOVE_TO E4, MAGNET_OFF = 5 steps
    Piece board[8][8] = {};
    board[1][4] = {PAWN, WHITE};  // E2
    ChessGame g(board);
    MovePlanner p(g, {3.8f, 5.5f, 5.0f, 5.0f});
    TEST_ASSERT_TRUE(p.startMove({'E', 2}, {'E', 4}));
    auto steps = drainSteps(p);
    TEST_ASSERT_EQUAL(5u, steps.size());
}

void test_simple_move_step_sequence() {
    Piece board[8][8] = {};
    board[1][4] = {PAWN, WHITE};  // E2
    ChessGame g(board);
    MovePlanner p(g, {3.8f, 5.5f, 5.0f, 5.0f});
    p.startMove({'E', 2}, {'E', 4});

    // Step 0: MOVE_TO E2
    Step s = p.peekNextStep();
    TEST_ASSERT_EQUAL(MOVE_TO, s.type);
    TEST_ASSERT_EQUAL('E', s.target.col);
    TEST_ASSERT_EQUAL(2,   s.target.row);
    p.nextStep();

    // Step 1: MAGNET_ON
    s = p.peekNextStep();
    TEST_ASSERT_EQUAL(MAGNET_ON, s.type);
    p.nextStep();

    // Step 2: MOVE_TO E3 (intermediate)
    s = p.peekNextStep();
    TEST_ASSERT_EQUAL(MOVE_TO, s.type);
    TEST_ASSERT_EQUAL(3, s.target.row);
    p.nextStep();

    // Step 3: MOVE_TO E4
    s = p.peekNextStep();
    TEST_ASSERT_EQUAL(MOVE_TO, s.type);
    TEST_ASSERT_EQUAL(4, s.target.row);
    p.nextStep();

    // Step 4: MAGNET_OFF
    s = p.peekNextStep();
    TEST_ASSERT_EQUAL(MAGNET_OFF, s.type);
    p.nextStep();

    TEST_ASSERT_TRUE(p.isMoveDone());
}

void test_illegal_move_rejected() {
    ChessGame g;
    MovePlanner p(g, {3.8f, 5.5f, 5.0f, 5.0f});
    TEST_ASSERT_FALSE(p.startMove({'E', 2}, {'E', 5}));  // pawn can't jump 3
    TEST_ASSERT_TRUE(p.isMoveDone());  // queue stays empty
}

void test_phys_x_y_in_step() {
    Piece board[8][8] = {};
    board[1][4] = {PAWN, WHITE};  // E2
    ChessGame g(board);
    MovePlanner p(g, {3.8f, 5.5f, 5.0f, 5.0f});
    p.startMove({'E', 2}, {'E', 4});
    Step s = p.peekNextStep();
    // E = col index 4 → x = 3.8 + 4*5.0 = 23.8
    TEST_ASSERT_FLOAT_WITHIN(0.001f, 23.8f, s.x);
    // row 2 → y = 5.5 + 1*5.0 = 10.5
    TEST_ASSERT_FLOAT_WITHIN(0.001f, 10.5f, s.y);
}
```

Add 4 tests to `main()`.

- [ ] **Step 2: Run to confirm failures**

```bash
pio test -e native -f test_move_planner -v
```

Expected: new tests FAIL.

- [ ] **Step 3: Implement `rectilinearPath`, `appendPickAndPlace`, `startMove` (no-obstacle case)**

```cpp
// Returns intermediate squares between from and to, horizontal leg first.
// Does NOT include from or to themselves.
std::vector<Position> MovePlanner::rectilinearPath(Position from, Position to) const {
    std::vector<Position> path;
    int fc = from.col - 'A', fr = from.row - 1;
    int tc = to.col   - 'A', tr = to.row   - 1;
    int stepC = (tc > fc) ? 1 : (tc < fc ? -1 : 0);
    int stepR = (tr > fr) ? 1 : (tr < fr ? -1 : 0);

    // Horizontal leg
    for (int c = fc + stepC; c != tc; c += stepC)
        path.push_back({(char)('A' + c), from.row});

    // Corner square (only for L-shaped paths)
    if (fc != tc && fr != tr)
        path.push_back({to.col, from.row});

    // Vertical leg
    for (int r = fr + stepR; r != tr; r += stepR)
        path.push_back({to.col, r + 1});

    return path;
}

void MovePlanner::appendPickAndPlace(Position from, Position to) {
    _steps.push(moveStep(from));
    _steps.push({MAGNET_ON, from, 0.0f, 0.0f});
    for (auto& sq : rectilinearPath(from, to))
        _steps.push(moveStep(sq));
    _steps.push(moveStep(to));
    _steps.push({MAGNET_OFF, to, 0.0f, 0.0f});
}

void MovePlanner::appendCaptureParkXY(Position capturedAt, float px, float py) {
    _steps.push(moveStep(capturedAt));
    _steps.push({MAGNET_ON, capturedAt, 0.0f, 0.0f});
    _steps.push(moveStepXY(px, py));
    _steps.push({MAGNET_OFF, {'Z', 0}, 0.0f, 0.0f});
}

bool MovePlanner::startMove(Position from, Position to) {
    if (!_game.isLegalMove(from, to)) return false;
    while (!_steps.empty()) _steps.pop();
    _pendingFrom = from;
    _pendingTo   = to;
    _hasPending  = true;

    Piece planBoard[8][8];
    copyGameBoard(planBoard);

    auto pathSquares = rectilinearPath(from, to);

    // If destination occupied (capture), park it first
    if (!_game.isEmpty(to)) {
        if (_nextSlot < (int)_capturedSlots.size()) {
            auto [px, py] = _capturedSlots[_nextSlot++];
            appendCaptureParkXY(to, px, py);
            planBoard[to.row - 1][to.col - 'A'] = {NONE, NO_COLOR};
        }
    }

    // Displace blockers along path
    std::vector<std::pair<Position, Position>> displacements;
    for (auto& sq : pathSquares) {
        if (planBoard[sq.row - 1][sq.col - 'A'].type != NONE) {
            Position park = findParkSquare(sq, planBoard);
            appendPickAndPlace(sq, park);
            planBoard[park.row - 1][park.col - 'A'] = planBoard[sq.row - 1][sq.col - 'A'];
            planBoard[sq.row - 1][sq.col - 'A']     = {NONE, NO_COLOR};
            displacements.push_back({sq, park});
        }
    }

    // Main piece move
    appendPickAndPlace(from, to);

    // Restore blockers in reverse
    for (int i = (int)displacements.size() - 1; i >= 0; i--)
        appendPickAndPlace(displacements[i].second, displacements[i].first);

    return true;
}

bool MovePlanner::isMoveDone() const { return _steps.empty(); }

Step MovePlanner::peekNextStep() const {
    if (_steps.empty()) return {};
    return _steps.front();
}

bool MovePlanner::nextStep() {
    if (_steps.empty()) return false;
    _steps.pop();
    if (_steps.empty() && _hasPending) {
        _game.applyMove(_pendingFrom, _pendingTo);
        _hasPending = false;
    }
    return !_steps.empty();
}
```

- [ ] **Step 4: Implement `findParkSquare`**

```cpp
Position MovePlanner::findParkSquare(Position blocked, const Piece planBoard[8][8]) const {
    int ci = blocked.col - 'A';
    int ri = blocked.row - 1;
    // Search orthogonal neighbors: up, down, right, left
    const int dcs[] = { 0,  0, 1, -1};
    const int drs[] = { 1, -1, 0,  0};
    for (int i = 0; i < 4; i++) {
        int nc = ci + dcs[i];
        int nr = ri + drs[i];
        if (nc >= 0 && nc < 8 && nr >= 0 && nr < 8) {
            if (planBoard[nr][nc].type == NONE)
                return {(char)('A' + nc), nr + 1};
        }
    }
    return blocked;  // fallback: all neighbors occupied (shouldn't happen in normal play)
}
```

- [ ] **Step 5: Run all tests — all pass**

```bash
pio test -e native -v
```

Expected: 36 total tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/MovePlanner.cpp test/test_move_planner/test_move_planner.cpp
git commit -m "feat: MovePlanner simple move path planning and step execution"
```

---

## Task 9: MovePlanner — Obstacle Displacement

**Files:**
- Modify: `test/test_move_planner/test_move_planner.cpp`

- [ ] **Step 1: Add obstacle displacement tests**

```cpp
void test_blocker_displaced_and_restored() {
    // E2 (white pawn) → E4, but E3 has a white rook blocking
    Piece board[8][8] = {};
    board[1][4] = {PAWN, WHITE};   // E2
    board[2][4] = {ROOK, WHITE};   // E3 — blocker
    ChessGame g(board);
    MovePlanner p(g, {3.8f, 5.5f, 5.0f, 5.0f});
    TEST_ASSERT_TRUE(p.startMove({'E', 2}, {'E', 4}));

    auto steps = drainSteps(p);

    // Expect: [displace E3 rook] + [move E2 pawn to E4] + [restore E3 rook]
    // Each pick-and-place for adjacent square = MOVE_TO + MAGNET_ON + MOVE_TO + MAGNET_OFF = 4 steps
    // E3 → park (adjacent, 1 sq): 4 steps
    // E2 → E4 (2 intermediate: E3): 5 steps
    // park → E3: 4 steps
    // Total = 13
    TEST_ASSERT_EQUAL(13u, steps.size());
    // First step must be MOVE_TO E3 (pick up blocker first)
    TEST_ASSERT_EQUAL(MOVE_TO, steps[0].type);
    TEST_ASSERT_EQUAL(3, steps[0].target.row);
    TEST_ASSERT_EQUAL('E', steps[0].target.col);
}

void test_board_state_after_blocked_move() {
    Piece board[8][8] = {};
    board[1][4] = {PAWN, WHITE};   // E2
    board[2][4] = {ROOK, WHITE};   // E3 — blocker
    ChessGame g(board);
    MovePlanner p(g, {3.8f, 5.5f, 5.0f, 5.0f});
    p.startMove({'E', 2}, {'E', 4});
    drainSteps(p);  // executes all steps; applyMove called at end
    // After move: E2 empty, E4 has pawn, E3 has rook (restored)
    TEST_ASSERT_TRUE(g.isEmpty({'E', 2}));
    TEST_ASSERT_EQUAL(PAWN, g.getPieceAt({'E', 4}).type);
    TEST_ASSERT_EQUAL(ROOK, g.getPieceAt({'E', 3}).type);
}
```

Add 2 tests to `main()`.

- [ ] **Step 2: Run — both pass** (implementation already handles this in Task 8)

```bash
pio test -e native -f test_move_planner -v
```

Expected: all tests PASS including the 2 new ones.

- [ ] **Step 3: Commit**

```bash
git add test/test_move_planner/test_move_planner.cpp
git commit -m "test: MovePlanner obstacle displacement verification"
```

---

## Task 10: MovePlanner — Capture and Border Parking

**Files:**
- Modify: `test/test_move_planner/test_move_planner.cpp`

- [ ] **Step 1: Add capture tests**

```cpp
void test_capture_step_goes_to_border() {
    // White pawn at E4 captures black pawn at D5
    Piece board[8][8] = {};
    board[3][4] = {PAWN, WHITE};   // E4
    board[4][3] = {PAWN, BLACK};   // D5
    ChessGame g(board);
    MovePlanner p(g, {3.8f, 5.5f, 5.0f, 5.0f});
    TEST_ASSERT_TRUE(p.startMove({'E', 4}, {'D', 5}));

    auto steps = drainSteps(p);

    // Capture park sequence: MOVE_TO D5, MAGNET_ON, MOVE_TO border (XY), MAGNET_OFF = 4 steps
    // Main move E4 → D5 (L-shape, 1 corner): MOVE_TO E4, MAGNET_ON, MOVE_TO D4 (corner), MOVE_TO D5, MAGNET_OFF = 5 steps
    // Total = 9 steps
    TEST_ASSERT_EQUAL(9u, steps.size());

    // Step 0: MOVE_TO D5 (picking up captured piece first)
    TEST_ASSERT_EQUAL(MOVE_TO, steps[0].type);
    TEST_ASSERT_EQUAL('D', steps[0].target.col);
    TEST_ASSERT_EQUAL(5,   steps[0].target.row);

    // Step 2: MOVE_TO border (off-board coords, target col == 'Z')
    TEST_ASSERT_EQUAL(MOVE_TO, steps[2].type);
    TEST_ASSERT_EQUAL('Z', steps[2].target.col);
}

void test_capture_updates_board_and_captured_list() {
    Piece board[8][8] = {};
    board[3][4] = {PAWN, WHITE};   // E4
    board[4][3] = {PAWN, BLACK};   // D5
    ChessGame g(board);
    MovePlanner p(g, {3.8f, 5.5f, 5.0f, 5.0f});
    p.startMove({'E', 4}, {'D', 5});
    drainSteps(p);
    TEST_ASSERT_EQUAL(PAWN, g.getPieceAt({'D', 5}).type);
    TEST_ASSERT_EQUAL(WHITE, g.getPieceAt({'D', 5}).color);
    TEST_ASSERT_EQUAL(1u, g.getCaptured().size());
}
```

Add 2 tests to `main()`.

- [ ] **Step 2: Run — both pass** (implementation already handles this in Task 8)

```bash
pio test -e native -f test_move_planner -v
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/test_move_planner/test_move_planner.cpp
git commit -m "test: MovePlanner capture and border parking verification"
```

---

## Task 11: Integration — Update `main.cpp`

**Files:**
- Modify: `src/main.cpp`

- [ ] **Step 1: Add ChessGame and MovePlanner to `main.cpp`**

Replace the entire file content with:

```cpp
#include <Arduino.h>
#include "StepperMotor.h"
#include "CoreXY.h"
#include "Electromagnet.h"
#include "ChessGame.h"
#include "MovePlanner.h"

StepperMotor motorA(D4, D5, D6);
StepperMotor motorB(D9, D8, D7);
CoreXY       xy(motorA, motorB);
Electromagnet magnet(D2);

static constexpr PhysicalConfig BOARD_CFG = {3.8f, 5.5f, 5.0f, 5.0f};

ChessGame   game;
MovePlanner planner(game, BOARD_CFG);

void setup() {
    Serial.begin(115200);
    delay(1000);

    xy.begin();
    xy.setSpeed(1500);
    xy.setHome();
    xy.setMaxBounds(16400, 16400);
    magnet.begin();

    Serial.println("[Chess] Ready. Enter move as FROM-TO, e.g. E2-E4");
}

void loop() {
    // Execute pending steps
    if (!planner.isMoveDone()) {
        Step s = planner.peekNextStep();
        // TODO: insert hall-effect sensor check here before advancing
        planner.nextStep();
        if      (s.type == MOVE_TO)    xy.moveToCm(s.x, s.y);
        else if (s.type == MAGNET_ON)  magnet.on();
        else if (s.type == MAGNET_OFF) magnet.off();
        return;
    }

    // Parse new move input from Serial (format: "E2-E4")
    if (!Serial.available()) return;
    String input = Serial.readStringUntil('\n');
    input.trim();
    input.toUpperCase();

    if (input.length() < 5 || input.charAt(2) != '-') {
        Serial.println("  Invalid format. Use FROM-TO, e.g. E2-E4");
        return;
    }

    Position from = {input.charAt(0), input.substring(1, 2).toInt()};
    Position to   = {input.charAt(3), input.substring(4).toInt()};

    if (!planner.startMove(from, to)) {
        Serial.printf("  Illegal move: %c%d -> %c%d\n",
                      from.col, from.row, to.col, to.row);
        return;
    }

    Serial.printf("  Moving %c%d -> %c%d\n",
                  from.col, from.row, to.col, to.row);
}
```

- [ ] **Step 2: Build for the target board (verify it compiles)**

```bash
pio run -e seeed_xiao_esp32s3
```

Expected: BUILD SUCCESS.

- [ ] **Step 3: Run native tests one final time**

```bash
pio test -e native -v
```

Expected: all 40 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main.cpp
git commit -m "feat: integrate ChessGame and MovePlanner into main.cpp"
```

---

## Known Limitations (noted for future work)

- Displacement moves to adjacent squares do not recursively check for sub-blockers (safe for adjacent 1-square moves).
- Captured piece path to the border assumes a clear path (no pieces between capture square and board edge).
- No check, checkmate, or stalemate detection.
- No castling, en passant, or pawn promotion.
- Hall effect sensor integration point is in `main.cpp` loop (marked with `TODO` comment).
