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
