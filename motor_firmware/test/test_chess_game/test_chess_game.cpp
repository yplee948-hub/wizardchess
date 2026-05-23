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

void test_pawn_forward_two_blocked_at_destination() {
    Piece board[8][8] = {};
    board[1][4] = {PAWN, WHITE};   // E2
    board[3][4] = {PAWN, BLACK};   // E4 — enemy at destination
    ChessGame g(board);
    TEST_ASSERT_FALSE(g.isLegalMove({'E', 2}, {'E', 4}));
}

void test_pawn_diagonal_capture_right() {
    Piece board[8][8] = {};
    board[3][4] = {PAWN, WHITE};   // E4
    board[4][5] = {PAWN, BLACK};   // F5 — enemy (dc=+1)
    ChessGame g(board);
    TEST_ASSERT_TRUE(g.isLegalMove({'E', 4}, {'F', 5}));
}

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

void test_rook_vertical_clear() {
    Piece board[8][8] = {};
    board[0][4] = {ROOK, WHITE};   // E1
    ChessGame g(board);
    TEST_ASSERT_TRUE(g.isLegalMove({'E', 1}, {'E', 5}));
}

void test_bishop_down_left_diagonal() {
    Piece board[8][8] = {};
    board[4][4] = {BISHOP, WHITE};  // E5
    ChessGame g(board);
    TEST_ASSERT_TRUE(g.isLegalMove({'E', 5}, {'B', 2}));
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

void test_queen_blocked_on_diagonal() {
    Piece board[8][8] = {};
    board[0][3] = {QUEEN, WHITE};  // D1
    board[1][4] = {PAWN,  WHITE};  // E2 — blocker
    ChessGame g(board);
    TEST_ASSERT_FALSE(g.isLegalMove({'D', 1}, {'G', 4}));
}

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

// ── Turn validation ────────────────────────────────────────────────
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

// ── Optional bonus test — black pawn moves after turn switch ────
void test_black_pawn_forward_after_turn_switch() {
    ChessGame g;
    g.applyMove({'E', 2}, {'E', 4});  // white moves, now black's turn
    TEST_ASSERT_TRUE(g.isLegalMove({'E', 7}, {'E', 6}));  // black pawn forward 1
}

int main() {
    UNITY_BEGIN();
    RUN_TEST(test_standard_white_pawn_row2);
    RUN_TEST(test_standard_black_pawn_row7);
    RUN_TEST(test_standard_white_king_e1);
    RUN_TEST(test_standard_empty_e4);
    RUN_TEST(test_custom_board);
    RUN_TEST(test_reset_restores_standard);
    RUN_TEST(test_pawn_forward_one);
    RUN_TEST(test_pawn_forward_two_from_start);
    RUN_TEST(test_pawn_forward_two_blocked_by_piece_at_e3);
    RUN_TEST(test_pawn_cannot_go_backward);
    RUN_TEST(test_pawn_diagonal_capture_legal);
    RUN_TEST(test_pawn_diagonal_no_capture_illegal);
    RUN_TEST(test_pawn_cannot_capture_forward);
    RUN_TEST(test_pawn_forward_two_blocked_at_destination);
    RUN_TEST(test_pawn_diagonal_capture_right);
    RUN_TEST(test_rook_horizontal_clear);
    RUN_TEST(test_rook_blocked_by_friendly);
    RUN_TEST(test_rook_cannot_move_diagonal);
    RUN_TEST(test_rook_vertical_clear);
    RUN_TEST(test_bishop_diagonal_clear);
    RUN_TEST(test_bishop_blocked);
    RUN_TEST(test_bishop_cannot_move_straight);
    RUN_TEST(test_bishop_down_left_diagonal);
    RUN_TEST(test_queen_straight_clear);
    RUN_TEST(test_queen_diagonal_clear);
    RUN_TEST(test_queen_blocked_on_diagonal);
    RUN_TEST(test_knight_l_shape);
    RUN_TEST(test_knight_jumps_over_pieces);
    RUN_TEST(test_knight_invalid_move);
    RUN_TEST(test_king_one_step_any_direction);
    RUN_TEST(test_king_cannot_move_two_squares);
    RUN_TEST(test_black_cannot_move_on_whites_turn);
    RUN_TEST(test_apply_move_updates_board);
    RUN_TEST(test_apply_move_alternates_turn);
    RUN_TEST(test_apply_move_capture_adds_to_captured);
    RUN_TEST(test_apply_move_illegal_returns_false);
    RUN_TEST(test_black_pawn_forward_after_turn_switch);
    return UNITY_END();
}
