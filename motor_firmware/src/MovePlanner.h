#pragma once
#include "ChessTypes.h"
#include "ChessGame.h"
#include <queue>
#include <vector>
#include <utility>

struct PhysBoard;  // implementation detail, defined in MovePlanner.cpp

class MovePlanner {
public:
    MovePlanner(ChessGame& game, const PhysicalConfig& config);

    bool startMove(Position from, Position to);
    // Call peekNextStep() first to read the current step, then nextStep() to advance.
    // Returns true if more steps remain after advancing.
    bool nextStep();
    bool isMoveDone() const;
    // Precondition: !isMoveDone(). Returns a zero-initialised Step if queue is empty.
    Step peekNextStep() const;

    // Public for testing — converts a chess Position to physical cm coordinates
    void physicalCoords(Position pos, float& x, float& y) const;

private:
    ChessGame&     _game;
    PhysicalConfig _cfg;
    std::queue<Step> _steps;

    std::vector<std::pair<float,float>> _borderSlots;
    std::vector<bool>                   _borderOccupied;

    void initBorderSlots();
    int  nextFreeBorderSlot() const;  // returns index of first free slot, or -1

    // Plans an axis-aligned magnet-on segment that moves the piece at `from` to `to`,
    // recursively parking and restoring blockers. Updates `phys` to reflect the
    // post-segment state. Returns false if no plan exists within the recursion limit.
    bool planSegment(PhysBoard& phys, Position from, Position to,
                     int depth, std::vector<Step>& out) const;
};
