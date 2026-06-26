#include "ChessGame.h"
#include <cstring>
#include <type_traits>

static_assert(std::is_trivially_copyable<Piece>::value, "Piece must be trivially copyable");

ChessGame::ChessGame() {
    _castleRights[0][0] = _castleRights[0][1] = true;
    _castleRights[1][0] = _castleRights[1][1] = true;
    _enPassantTarget = kNoSquare;
    initStandard();
}

ChessGame::ChessGame(const Piece board[8][8]) : _turn(WHITE) {
    memcpy(_board, board, sizeof(_board));
    _castleRights[0][0] = _castleRights[0][1] = false;
    _castleRights[1][0] = _castleRights[1][1] = false;
    _enPassantTarget = kNoSquare;
}

void ChessGame::reset() {
    _turn = WHITE;
    _captured.clear();
    _castleRights[0][0] = _castleRights[0][1] = true;
    _castleRights[1][0] = _castleRights[1][1] = true;
    _enPassantTarget = kNoSquare;
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

// ---------- attack / check helpers ----------

bool ChessGame::isPawnAttack(Position from, Position to) const {
    int dir = (at(from).color == WHITE) ? 1 : -1;
    int dc  = ci(to) - ci(from);
    int dr  = ri(to) - ri(from);
    return dr == dir && (dc == 1 || dc == -1);
}

bool ChessGame::canAttackSquare(Position from, Position to) const {
    switch (at(from).type) {
        case PAWN:   return isPawnAttack(from, to);
        case ROOK:   return isRookMove(from, to);
        case KNIGHT: return isKnightMove(from, to);
        case BISHOP: return isBishopMove(from, to);
        case QUEEN:  return isQueenMove(from, to);
        case KING: {
            int dc = ci(to) - ci(from); if (dc < 0) dc = -dc;
            int dr = ri(to) - ri(from); if (dr < 0) dr = -dr;
            return dc <= 1 && dr <= 1 && (dc + dr > 0);
        }
        default: return false;
    }
}

bool ChessGame::isSquareAttackedBy(Position sq, PieceColor attackerColor) const {
    for (int r = 1; r <= 8; r++) {
        for (char c = 'A'; c <= 'H'; c++) {
            Position p = {c, r};
            if (at(p).color == attackerColor && canAttackSquare(p, sq)) return true;
        }
    }
    return false;
}

bool ChessGame::isInCheck(PieceColor color) const {
    for (int r = 1; r <= 8; r++) {
        for (char c = 'A'; c <= 'H'; c++) {
            Position p = {c, r};
            if (at(p).type == KING && at(p).color == color) {
                return isSquareAttackedBy(p, color == WHITE ? BLACK : WHITE);
            }
        }
    }
    return false;
}

// Raw board-only move for simulation (no turn flip, no state updates).
// Handles en passant square removal so self-check simulation is correct.
void ChessGame::applyMoveRaw(Position from, Position to) {
    if (at(from).type == PAWN && to == _enPassantTarget) {
        at({to.col, from.row}) = {NONE, NO_COLOR};
    }
    at(to)   = at(from);
    at(from) = {NONE, NO_COLOR};
}

bool ChessGame::wouldLeaveInCheck(Position from, Position to) const {
    PieceColor moverColor = at(from).color;
    ChessGame  sim        = *this;   // default copy constructor; all members are copyable
    sim.applyMoveRaw(from, to);
    return sim.isInCheck(moverColor);
}

// ---------- piece move geometry ----------

bool ChessGame::isPawnMove(Position from, Position to) const {
    int dc      = ci(to) - ci(from);
    int dr      = ri(to) - ri(from);
    int dir     = (at(from).color == WHITE) ? 1 : -1;
    int startRi = (at(from).color == WHITE) ? 1 : 6;

    if (dc == 0 && dr == dir && isEmpty(to)) return true;

    if (dc == 0 && dr == 2 * dir && ri(from) == startRi) {
        Position mid = {from.col, from.row + dir};
        return isEmpty(mid) && isEmpty(to);
    }

    if ((dc == 1 || dc == -1) && dr == dir) {
        if (!isEmpty(to))          return true;   // normal capture
        if (to == _enPassantTarget) return true;  // en passant
    }

    return false;
}

bool ChessGame::isPathClear(Position from, Position to) const {
    int dc    = ci(to) - ci(from);
    int dr    = ri(to) - ri(from);
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
    int dc = ci(to) - ci(from); if (dc < 0) dc = -dc;
    int dr = ri(to) - ri(from); if (dr < 0) dr = -dr;
    if (dc != dr) return false;
    return isPathClear(from, to);
}

bool ChessGame::isQueenMove(Position from, Position to) const {
    return isRookMove(from, to) || isBishopMove(from, to);
}

bool ChessGame::isKnightMove(Position from, Position to) const {
    int dc = ci(to) - ci(from); if (dc < 0) dc = -dc;
    int dr = ri(to) - ri(from); if (dr < 0) dr = -dr;
    return (dc == 1 && dr == 2) || (dc == 2 && dr == 1);
}

bool ChessGame::isCastlingLegal(Position from, Position to) const {
    PieceColor color   = at(from).color;
    int        homeRow = (color == WHITE) ? 1 : 8;

    if (from != (Position{'E', homeRow})) return false;

    int dcSigned = ci(to) - ci(from);
    bool kingside  = (dcSigned ==  2);
    bool queenside = (dcSigned == -2);
    if (!kingside && !queenside) return false;

    int side = kingside ? 1 : 0;
    if (!_castleRights[colorIdx(color)][side]) return false;

    char rookFile = kingside ? 'H' : 'A';
    Position rookPos = {rookFile, homeRow};
    if (at(rookPos).type != ROOK || at(rookPos).color != color) return false;

    // All squares between king and rook must be empty.
    char lo = (char)((from.col < rookFile ? from.col : rookFile) + 1);
    char hi = (char)((from.col > rookFile ? from.col : rookFile) - 1);
    for (char c = lo; c <= hi; c++) {
        if (!isEmpty({c, homeRow})) return false;
    }

    // King must not currently be in check.
    if (isInCheck(color)) return false;

    // King must not pass through or land on an attacked square.
    PieceColor enemy = (color == WHITE) ? BLACK : WHITE;
    int step = kingside ? 1 : -1;
    for (int c = ci(from); c != ci(to) + step; c += step) {
        if (isSquareAttackedBy({(char)('A' + c), homeRow}, enemy)) return false;
    }

    return true;
}

bool ChessGame::isKingMove(Position from, Position to) const {
    int dc = ci(to) - ci(from);
    int dr = ri(to) - ri(from);
    int absDc = dc < 0 ? -dc : dc;
    int absDr = dr < 0 ? -dr : dr;

    if (absDc <= 1 && absDr <= 1) return true;                     // normal 1-square move
    if (absDr == 0 && absDc == 2) return isCastlingLegal(from, to); // castling
    return false;
}

// ---------- public move interface ----------

bool ChessGame::isLegalMove(Position from, Position to) const {
    if (from.col < 'A' || from.col > 'H' || from.row < 1 || from.row > 8) return false;
    if (to.col   < 'A' || to.col   > 'H' || to.row   < 1 || to.row   > 8) return false;
    if (from == to) return false;
    const Piece& mover = at(from);
    if (mover.type == NONE)                              return false;
    if (mover.color != _turn)                            return false;
    if (!isEmpty(to) && at(to).color == mover.color)    return false;

    bool moveOk;
    switch (mover.type) {
        case PAWN:   moveOk = isPawnMove  (from, to); break;
        case ROOK:   moveOk = isRookMove  (from, to); break;
        case KNIGHT: moveOk = isKnightMove(from, to); break;
        case BISHOP: moveOk = isBishopMove(from, to); break;
        case QUEEN:  moveOk = isQueenMove (from, to); break;
        case KING:   moveOk = isKingMove  (from, to); break;
        default:     return false;
    }
    if (!moveOk) return false;

    return !wouldLeaveInCheck(from, to);
}

bool ChessGame::isEnPassantMove(Position from, Position to) const {
    return at(from).type == PAWN
        && to == _enPassantTarget
        && (ci(to) - ci(from) == 1 || ci(to) - ci(from) == -1);
}

bool ChessGame::isCastlingMove(Position from, Position to) const {
    int dc = ci(to) - ci(from);
    return at(from).type == KING && (dc == 2 || dc == -2);
}

bool ChessGame::applyMove(Position from, Position to) {
    if (!isLegalMove(from, to)) return false;

    PieceColor moverColor = at(from).color;
    PieceType  moverType  = at(from).type;

    // Update castling rights if a corner rook is captured.
    if (!isEmpty(to) && at(to).type == ROOK) {
        if (to == (Position{'A', 1})) _castleRights[colorIdx(WHITE)][0] = false;
        if (to == (Position{'H', 1})) _castleRights[colorIdx(WHITE)][1] = false;
        if (to == (Position{'A', 8})) _castleRights[colorIdx(BLACK)][0] = false;
        if (to == (Position{'H', 8})) _castleRights[colorIdx(BLACK)][1] = false;
    }

    // Normal capture.
    if (!isEmpty(to)) _captured.push_back(at(to));

    // En passant: remove the bypassed pawn (not at `to`).
    if (moverType == PAWN && to == _enPassantTarget) {
        Position capturedPawn = {to.col, from.row};
        _captured.push_back(at(capturedPawn));
        at(capturedPawn) = {NONE, NO_COLOR};
    }

    // Castling: also slide the rook.
    if (moverType == KING) {
        int dc = ci(to) - ci(from);
        if (dc == 2 || dc == -2) {
            bool kingside     = dc > 0;
            Position rookFrom = {kingside ? 'H' : 'A', from.row};
            Position rookTo   = {kingside ? 'F' : 'D', from.row};
            at(rookTo) = at(rookFrom);
            at(rookFrom) = {NONE, NO_COLOR};
        }
        _castleRights[colorIdx(moverColor)][0] = false;
        _castleRights[colorIdx(moverColor)][1] = false;
    }

    // Move the piece.
    at(to)   = at(from);
    at(from) = {NONE, NO_COLOR};

    // Pawn promotion: auto-queen.
    if (moverType == PAWN) {
        int backRank = (moverColor == WHITE) ? 8 : 1;
        if (to.row == backRank) at(to).type = QUEEN;
    }

    // Lose castling right when a rook moves from its home corner.
    if (moverType == ROOK) {
        if (from.col == 'A') _castleRights[colorIdx(moverColor)][0] = false;
        if (from.col == 'H') _castleRights[colorIdx(moverColor)][1] = false;
    }

    // Update en passant target for a two-square pawn advance.
    if (moverType == PAWN) {
        int dr = ri(to) - ri(from);
        if (dr == 2 || dr == -2) {
            _enPassantTarget = {from.col, (int)(from.row + (moverColor == WHITE ? 1 : -1))};
        } else {
            _enPassantTarget = kNoSquare;
        }
    } else {
        _enPassantTarget = kNoSquare;
    }

    _turn = (_turn == WHITE) ? BLACK : WHITE;
    return true;
}

// ---------- game-end detection ----------

bool ChessGame::hasLegalMoves(PieceColor color) const {
    for (int fr = 1; fr <= 8; fr++) {
        for (char fc = 'A'; fc <= 'H'; fc++) {
            Position from = {fc, fr};
            if (at(from).color != color) continue;
            for (int tr = 1; tr <= 8; tr++) {
                for (char tc = 'A'; tc <= 'H'; tc++) {
                    if (isLegalMove(from, {tc, tr})) return true;
                }
            }
        }
    }
    return false;
}

GameResult ChessGame::getResult() const {
    if (hasLegalMoves(_turn)) {
        return isInCheck(_turn) ? GAME_CHECK : GAME_ONGOING;
    }
    return isInCheck(_turn) ? GAME_CHECKMATE : GAME_STALEMATE;
}
