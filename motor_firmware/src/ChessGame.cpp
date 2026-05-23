#include "ChessGame.h"
#include <cstring>
#include <type_traits>

static_assert(std::is_trivially_copyable<Piece>::value, "Piece must be trivially copyable");

ChessGame::ChessGame() { initStandard(); }

ChessGame::ChessGame(const Piece board[8][8]) : _turn(WHITE) {
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

PieceColor ChessGame::getTurn() const { return _turn; }

Piece ChessGame::getPieceAt(Position p) const {
    if (ci(p) < 0 || ci(p) > 7 || ri(p) < 0 || ri(p) > 7) return {NONE, NO_COLOR};
    return at(p);
}
bool ChessGame::isEmpty(Position p) const {
    if (ci(p) < 0 || ci(p) > 7 || ri(p) < 0 || ri(p) > 7) return true;
    return at(p).type == NONE;
}
const std::vector<Piece>& ChessGame::getCaptured() const { return _captured; }

// Stubs — will be filled in Tasks 3–6
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

// Precondition: (from, to) must be same rank, same file, or same diagonal.
// Callers (isRookMove, isBishopMove) enforce this before calling here.
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

bool ChessGame::applyMove(Position from, Position to) {
    if (!isLegalMove(from, to)) return false;
    if (!isEmpty(to)) _captured.push_back(at(to));
    at(to)   = at(from);
    at(from) = {NONE, NO_COLOR};
    _turn    = (_turn == WHITE) ? BLACK : WHITE;
    return true;
}
