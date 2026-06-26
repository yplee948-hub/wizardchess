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

    bool       isInCheck(PieceColor color) const;
    bool       hasLegalMoves(PieceColor color) const;
    GameResult getResult() const;

    // Exposed for MovePlanner to detect special-case move types before planning.
    bool isEnPassantMove(Position from, Position to) const;
    bool isCastlingMove(Position from, Position to)  const;

private:
    Piece      _board[8][8];   // [rowIdx 0–7][colIdx 0–7]
    PieceColor _turn = WHITE;
    std::vector<Piece> _captured;

    // Castling rights: [0=WHITE, 1=BLACK][0=queenside, 1=kingside]
    bool     _castleRights[2][2];
    Position _enPassantTarget;  // square a pawn can land on via en passant (kNoSquare if none)

    void initStandard();

    bool isPawnMove    (Position from, Position to) const;
    bool isRookMove    (Position from, Position to) const;
    bool isKnightMove  (Position from, Position to) const;
    bool isBishopMove  (Position from, Position to) const;
    bool isQueenMove   (Position from, Position to) const;
    bool isKingMove    (Position from, Position to) const;
    bool isPathClear   (Position from, Position to) const;
    bool isCastlingLegal(Position from, Position to) const;

    bool isPawnAttack      (Position from, Position to) const;
    bool canAttackSquare   (Position from, Position to) const;
    bool isSquareAttackedBy(Position sq, PieceColor attackerColor) const;
    bool wouldLeaveInCheck (Position from, Position to) const;
    void applyMoveRaw      (Position from, Position to);

    static int ci(Position p) { return p.col - 'A'; }
    static int ri(Position p) { return p.row - 1; }
    static int colorIdx(PieceColor c) { return c == WHITE ? 0 : 1; }

    Piece&       at(Position p)       { return _board[ri(p)][ci(p)]; }
    const Piece& at(Position p) const { return _board[ri(p)][ci(p)]; }
};
