#include "MovePlanner.h"
#include <vector>
#include <queue>
#include <deque>
#include <algorithm>
#include <cassert>

// Mirror of the chess game's piece layout that the planner can mutate during
// planning without touching the real game state.
struct PhysBoard {
    Piece cells[8][8] = {};

    static int ri(Position p) { return p.row - 1; }
    static int ci(Position p) { return p.col - 'A'; }

    bool isEmpty(Position p) const { return cells[ri(p)][ci(p)].type == NONE; }
    void clear(Position p)         { cells[ri(p)][ci(p)] = {}; }
    void move(Position from, Position to) {
        cells[ri(to)][ci(to)]     = cells[ri(from)][ci(from)];
        cells[ri(from)][ci(from)] = {};
    }
};

namespace {

constexpr int MAX_DEPTH = 3;

// Dijkstra on the 8x8 grid (4-connected). Cost to enter a cell is 1 if empty
// (or the destination) and BLOCKER_WEIGHT if occupied, so the search prefers
// the shortest path that goes through the fewest pieces. `from` itself is the
// starting node and is not counted.
std::vector<Position> findPath(const PhysBoard& phys, Position from, Position to) {
    constexpr int BLOCKER_WEIGHT = 10;
    constexpr int INF = 1 << 20;
    int  dist[8][8];
    Position parent[8][8];
    bool visited[8][8] = {};
    for (int r = 0; r < 8; r++)
        for (int c = 0; c < 8; c++) dist[r][c] = INF;

    auto ri = [](Position p) { return p.row - 1; };
    auto ci = [](Position p) { return p.col - 'A'; };

    using Node = std::pair<int, Position>;
    struct Cmp { bool operator()(const Node& a, const Node& b) const { return a.first > b.first; } };
    std::priority_queue<Node, std::vector<Node>, Cmp> pq;

    dist[ri(from)][ci(from)]   = 0;
    parent[ri(from)][ci(from)] = from;
    pq.push({0, from});

    const int drs[] = {1, -1, 0, 0};
    const int dcs[] = {0, 0, -1, 1};

    while (!pq.empty()) {
        Position u = pq.top().second; pq.pop();
        if (visited[ri(u)][ci(u)]) continue;
        visited[ri(u)][ci(u)] = true;
        if (u == to) break;

        for (int i = 0; i < 4; i++) {
            Position v = {(char)(u.col + dcs[i]), u.row + drs[i]};
            if (v.col < 'A' || v.col > 'H' || v.row < 1 || v.row > 8) continue;
            if (visited[ri(v)][ci(v)]) continue;
            int w  = (phys.isEmpty(v) || v == to) ? 1 : BLOCKER_WEIGHT;
            int nd = dist[ri(u)][ci(u)] + w;
            if (nd < dist[ri(v)][ci(v)]) {
                dist[ri(v)][ci(v)]   = nd;
                parent[ri(v)][ci(v)] = u;
                pq.push({nd, v});
            }
        }
    }

    if (dist[ri(to)][ci(to)] == INF) return {};

    std::vector<Position> path;
    Position cur = to;
    while (!(cur == from)) {
        path.push_back(cur);
        cur = parent[ri(cur)][ci(cur)];
    }
    path.push_back(from);
    std::reverse(path.begin(), path.end());
    return path;
}

// BFS for the nearest empty square, ignoring any cells listed in `forbidden`.
// Expands through occupied cells so a piece walled in by neighbors can still
// reach an open bay further out.
bool findPark(const PhysBoard& phys, Position blocker,
              const std::vector<Position>& forbidden, Position& park) {
    bool seen[8][8] = {};
    seen[blocker.row - 1][blocker.col - 'A'] = true;
    std::queue<Position> q;
    q.push(blocker);

    const int drs[] = {1, -1, 0, 0};
    const int dcs[] = {0, 0, -1, 1};

    while (!q.empty()) {
        Position cur = q.front(); q.pop();
        for (int i = 0; i < 4; i++) {
            Position v = {(char)(cur.col + dcs[i]), cur.row + drs[i]};
            if (v.col < 'A' || v.col > 'H' || v.row < 1 || v.row > 8) continue;
            int rIdx = v.row - 1, cIdx = v.col - 'A';
            if (seen[rIdx][cIdx]) continue;
            seen[rIdx][cIdx] = true;
            q.push(v);

            if (!phys.isEmpty(v)) continue;
            bool forb = false;
            for (const Position& f : forbidden) if (f == v) { forb = true; break; }
            if (forb) continue;

            park = v;
            return true;
        }
    }
    return false;
}

// Reduce a cell-by-cell path to the gantry stops the motion controller needs:
// only the endpoint of each axis-aligned run plus the final cell.
std::vector<Position> waypoints(const std::vector<Position>& path) {
    std::vector<Position> wp;
    if (path.size() < 2) return wp;
    for (size_t i = 1; i < path.size(); i++) {
        if (i + 1 < path.size()) {
            int dr1 = path[i].row     - path[i - 1].row;
            int dc1 = path[i].col     - path[i - 1].col;
            int dr2 = path[i + 1].row - path[i].row;
            int dc2 = path[i + 1].col - path[i].col;
            if (dr1 == dr2 && dc1 == dc2) continue;  // colinear, drop interior cell
        }
        wp.push_back(path[i]);
    }
    return wp;
}

}  // namespace

MovePlanner::MovePlanner(ChessGame& game, const PhysicalConfig& config)
    : _game(game), _cfg(config) {
    initBorderSlots();
}

void MovePlanner::initBorderSlots() {
    _borderSlots.clear();
    _borderOccupied.clear();
    float yAbove = _cfg.originY + 8 * _cfg.stepY;
    for (int c = 0; c < 8; c++) {
        float x = _cfg.originX + c * _cfg.stepX;
        _borderSlots.push_back({x, yAbove});
        _borderOccupied.push_back(false);
    }
    float yBelow = _cfg.originY - _cfg.stepY;
    for (int c = 0; c < 8; c++) {
        float x = _cfg.originX + c * _cfg.stepX;
        _borderSlots.push_back({x, yBelow});
        _borderOccupied.push_back(false);
    }
    float xLeft = _cfg.originX - _cfg.stepX;
    for (int r = 0; r < 8; r++) {
        float y = _cfg.originY + r * _cfg.stepY;
        _borderSlots.push_back({xLeft, y});
        _borderOccupied.push_back(false);
    }
    float xRight = _cfg.originX + 8 * _cfg.stepX;
    for (int r = 0; r < 8; r++) {
        float y = _cfg.originY + r * _cfg.stepY;
        _borderSlots.push_back({xRight, y});
        _borderOccupied.push_back(false);
    }
}

int MovePlanner::nextFreeBorderSlot() const {
    for (int i = 0; i < (int)_borderSlots.size(); i++) {
        if (!_borderOccupied[i]) return i;
    }
    return -1;
}

void MovePlanner::physicalCoords(Position pos, float& x, float& y) const {
    x = _cfg.originX + (pos.col - 'A') * _cfg.stepX;
    y = _cfg.originY + (pos.row - 1)  * _cfg.stepY;
}

bool MovePlanner::planSegment(PhysBoard& phys, Position from, Position to,
                              int depth, std::vector<Step>& out) const {
    if (depth > MAX_DEPTH) return false;
    if (from == to)        return true;

    auto path = findPath(phys, from, to);
    if (path.empty()) return false;

    // Cells we must clear: occupied path cells strictly between `from` and `to`.
    std::vector<Position> blockers;
    for (size_t i = 1; i + 1 < path.size(); i++) {
        if (!phys.isEmpty(path[i])) blockers.push_back(path[i]);
    }

    // Pick park squares for each blocker. Forbidden = all path cells + already
    // chosen parks for this segment, so blockers don't pile up on each other
    // and don't sit back down on our own path.
    std::vector<Position> forbidden(path.begin(), path.end());
    std::vector<Position> parks;
    parks.reserve(blockers.size());
    for (Position b : blockers) {
        Position p;
        if (!findPark(phys, b, forbidden, p)) return false;
        parks.push_back(p);
        forbidden.push_back(p);
    }

    // Park each blocker (each is its own recursive sub-segment).
    for (size_t i = 0; i < blockers.size(); i++) {
        if (!planSegment(phys, blockers[i], parks[i], depth + 1, out)) return false;
    }

    // Emit the main segment: position over `from`, magnet on, walk waypoints,
    // magnet off at `to`.
    PieceColor carry = phys.cells[PhysBoard::ri(from)][PhysBoard::ci(from)].color;
    float fx, fy;
    physicalCoords(from, fx, fy);
    out.push_back({MOVE_TO,   from, fx, fy, NO_COLOR});
    out.push_back({MAGNET_ON, from, 0.0f, 0.0f, carry});
    for (Position wp : waypoints(path)) {
        float x, y;
        physicalCoords(wp, x, y);
        out.push_back({MOVE_TO, wp, x, y, NO_COLOR});
    }
    out.push_back({MAGNET_OFF, to, 0.0f, 0.0f, NO_COLOR});

    phys.move(from, to);

    // Restore blockers in reverse order — later parks are unwound first so the
    // physical board returns to its pre-segment state (with the moved piece
    // now at `to`).
    for (size_t i = blockers.size(); i-- > 0; ) {
        if (!planSegment(phys, parks[i], blockers[i], depth + 1, out)) return false;
    }

    return true;
}

bool MovePlanner::startMove(Position from, Position to) {
    if (!_game.isLegalMove(from, to)) return false;
    if (!_steps.empty())              return false;

    PhysBoard phys;
    for (int r = 1; r <= 8; r++) {
        for (char c = 'A'; c <= 'H'; c++) {
            phys.cells[r - 1][c - 'A'] = _game.getPieceAt({c, r});
        }
    }

    std::vector<Step> plan;

    bool isEnPassant = _game.isEnPassantMove(from, to);
    bool isCastle    = _game.isCastlingMove(from, to);
    bool isCapture   = !isEnPassant && !phys.isEmpty(to);

    // En passant: lift the bypassed pawn (at {to.col, from.row}) off to a border slot.
    if (isEnPassant) {
        Position capturedPos = {to.col, from.row};
        int borderIdx = nextFreeBorderSlot();
        if (borderIdx < 0) return false;
        auto [bx, by] = _borderSlots[borderIdx];
        float tx, ty;
        physicalCoords(capturedPos, tx, ty);
        PieceColor capturedColor = phys.cells[PhysBoard::ri(capturedPos)][PhysBoard::ci(capturedPos)].color;
        plan.push_back({MOVE_TO,    capturedPos, tx,   ty,   NO_COLOR});
        plan.push_back({MAGNET_ON,  capturedPos, 0.0f, 0.0f, capturedColor});
        plan.push_back({MOVE_TO,    kNoSquare,   bx,   by,   NO_COLOR});
        plan.push_back({MAGNET_OFF, kNoSquare,   0.0f, 0.0f, NO_COLOR});
        phys.clear(capturedPos);
        _borderOccupied[borderIdx] = true;
    }

    // Normal capture: lift the enemy piece off `to` to a border slot first.
    if (isCapture) {
        int borderIdx = nextFreeBorderSlot();
        if (borderIdx < 0) return false;
        auto [bx, by] = _borderSlots[borderIdx];
        float tx, ty;
        physicalCoords(to, tx, ty);
        PieceColor capturedColor = phys.cells[PhysBoard::ri(to)][PhysBoard::ci(to)].color;
        plan.push_back({MOVE_TO,    to,        tx,   ty,   NO_COLOR});
        plan.push_back({MAGNET_ON,  to,        0.0f, 0.0f, capturedColor});
        plan.push_back({MOVE_TO,    kNoSquare, bx,   by,   NO_COLOR});
        plan.push_back({MAGNET_OFF, kNoSquare, 0.0f, 0.0f, NO_COLOR});
        phys.clear(to);
        _borderOccupied[borderIdx] = true;
    }

    if (isCastle) {
        // Move the king first (F/G or B/C/D are empty by castling rules → no blockers).
        // Then slide the rook; the recursive planner handles the king being in the way.
        bool kingside     = (to.col > from.col);
        Position rookFrom = {kingside ? 'H' : 'A', from.row};
        Position rookTo   = {kingside ? 'F' : 'D', from.row};
        if (!planSegment(phys, from,     to,     0, plan)) return false;
        if (!planSegment(phys, rookFrom, rookTo, 0, plan)) return false;
    } else {
        if (!planSegment(phys, from, to, 0, plan)) return false;
    }

    for (const Step& s : plan) _steps.push(s);
    bool ok = _game.applyMove(from, to);
    assert(ok);
    return true;
}

bool MovePlanner::nextStep() {
    if (_steps.empty()) return false;
    _steps.pop();
    return !_steps.empty();
}

bool MovePlanner::isMoveDone() const {
    return _steps.empty();
}

Step MovePlanner::peekNextStep() const {
    if (_steps.empty()) return {};
    return _steps.front();
}
