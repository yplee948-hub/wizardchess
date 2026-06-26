#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <string.h>

#include "StepperMotor.h"
#include "CoreXY.h"
#include "Electromagnet.h"
#include "ChessGame.h"
#include "MovePlanner.h"
#include "NullSerial.h"  // disables Serial — magnet shares UART0 pins (GPIO1/3)

// ---- pins (ESP32 DevKit GPIO numbers) ----
// Constructor arg order: StepperMotor(EN, STEP, DIR), Electromagnet(IN1, IN2, ENA).
// Stepper 1 (TMC2209): EN=GPIO23, STEP=GPIO32, DIR=GPIO33
// Stepper 2 (TMC2209): EN=GPIO2,  STEP=GPIO5,  DIR=GPIO4
//   GPIO2 strapping, idles LOW; TMC2209 EN active-low so LOW = enabled (safe at boot).
//   GPIO5 strapping, safe as output.
StepperMotor motorA(23, 32, 33);
StepperMotor motorB(2, 5, 4);
CoreXY xy(motorA, motorB);

// Magnet H-bridge (L298N): IN1=GPIO3, IN2=GPIO15, ENA=GPIO1.
//   ⚠️ ENA=GPIO1 (U0TXD), IN1=GPIO3 (U0RXD) are the UART0 console pins, so
//   Serial is disabled board-wide via NullSerial.h to keep it off the magnet.
//   GPIO1 needs a 10k pull-down (magnet off at boot); GPIO15 strapping idles HIGH.
Electromagnet magnet(3, 15, 1);
static constexpr bool MAGNET_ENABLED = true;

// Travel speed when the carriage is empty vs. carrying a piece.
// Pieces slide more reliably at lower speed.
static constexpr int TRAVEL_STEPS_PER_SEC = 4000;
static constexpr int CARRY_STEPS_PER_SEC  = 1500;

// Homing / calibration
static constexpr int   HOME_SPEED_STEPS_PER_SEC = 1200;
static constexpr float KNOWN_X_CM               = 45.0f;
static constexpr float KNOWN_Y_CM               = 45.5f;
static constexpr int   HOME_BACKOFF_STEPS        = 300;  // steps to back off after hitting a switch

// A1 = (3.8, 5.5); each letter = +5.0 cm X, each number = +5.0 cm Y
static constexpr float SQUARE_ORIGIN_X = 4.0f;
static constexpr float SQUARE_ORIGIN_Y = 5.0f;
static constexpr float SQUARE_STEP_X   = 4.625f;
static constexpr float SQUARE_STEP_Y   = 4.625f;

ChessGame   game;
MovePlanner planner(game, {SQUARE_ORIGIN_X, SQUARE_ORIGIN_Y, SQUARE_STEP_X, SQUARE_STEP_Y});

// ---------- ESP-NOW transport ----------

// The control firmware connects to this SSID. We scan for it to discover
// the AP's channel so ESP-NOW lands on the same channel without blind hopping.
// Keep this in sync with control_firmware/src/main.cpp WIFI_SSID.
static const char* CONTROL_WIFI_SSID = "robolab_5";

// Control firmware's MAC — hardcoded so we skip the broadcast pairing
// handshake. Read once from the control's serial banner. Update if the
// control board is ever swapped.
static const uint8_t CONTROL_MAC[6] = {0x1C, 0xDB, 0xD4, 0x5C, 0x9A, 0xF8};

static constexpr uint8_t MAX_CANDIDATE_CHANNELS = 8;
static uint8_t  candidateChannels[MAX_CANDIDATE_CHANNELS] = {};
static uint8_t  candidateCount = 0;
static uint8_t  candidateIndex = 0;
static uint8_t  currentChannel = 1;
static volatile bool channelLocked = false;
static volatile bool needsRescan   = true;
static volatile bool tryNextChannel = false;

struct RxMsg { uint16_t len; char data[200]; };
static QueueHandle_t rxQueue;

static void sendRaw(const char* s, size_t len) {
    esp_now_send(CONTROL_MAC, (const uint8_t*)s, len);
}

#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
static void onEspNowSent(const uint8_t* mac, esp_now_send_status_t status) {
#else
static void onEspNowSent(const uint8_t* mac, esp_now_send_status_t status) {
#endif
    if (status == ESP_NOW_SEND_SUCCESS) return;
    Serial.printf("[ESP-NOW] send FAILED to %02X:%02X:%02X:%02X:%02X:%02X\n",
                  mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    // Ask pairingTick() to advance to the next candidate channel from the
    // last scan. If we run out, it triggers a full rescan.
    tryNextChannel = true;
}

#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
static void onEspNowRecv(const esp_now_recv_info_t* info, const uint8_t* data, int len) {
    const uint8_t* src = info->src_addr;
#else
static void onEspNowRecv(const uint8_t* src, const uint8_t* data, int len) {
#endif
    if (len <= 0) return;
    if (memcmp(src, CONTROL_MAC, 6) != 0) return;  // ignore anyone else

    RxMsg m{};
    m.len = (len < (int)sizeof(m.data) - 1) ? len : (int)sizeof(m.data) - 1;
    memcpy(m.data, data, m.len);
    m.data[m.len] = '\0';
    BaseType_t hpw = pdFALSE;
    xQueueSendFromISR(rxQueue, &m, &hpw);
}

static void setChannel(uint8_t ch) {
    currentChannel = ch;
    esp_wifi_set_promiscuous(true);
    esp_wifi_set_channel(ch, WIFI_SECOND_CHAN_NONE);
    esp_wifi_set_promiscuous(false);
}

// Try the channel at candidateChannels[candidateIndex]. Returns false if the
// index is past the end of the list (caller should rescan).
static bool tryCurrentCandidate() {
    if (candidateIndex >= candidateCount) return false;
    uint8_t ch = candidateChannels[candidateIndex];
    setChannel(ch);
    channelLocked = true;
    Serial.printf("[ESP-NOW] trying channel %u (candidate %u/%u)\n",
                  ch, candidateIndex + 1, candidateCount);
    return true;
}

static void scanForControlChannel() {
    Serial.printf("[ESP-NOW] scanning for SSID '%s'...\n", CONTROL_WIFI_SSID);
    int32_t n = WiFi.scanNetworks();
    candidateCount = 0;
    for (int32_t i = 0; i < n && candidateCount < MAX_CANDIDATE_CHANNELS; i++) {
        if (!strcmp(CONTROL_WIFI_SSID, WiFi.SSID(i).c_str())) {
            uint8_t ch = (uint8_t)WiFi.channel(i);
            // Skip duplicates.
            bool seen = false;
            for (uint8_t j = 0; j < candidateCount; j++) {
                if (candidateChannels[j] == ch) { seen = true; break; }
            }
            if (!seen) candidateChannels[candidateCount++] = ch;
        }
    }
    WiFi.scanDelete();
    needsRescan    = false;
    tryNextChannel = false;
    candidateIndex = 0;

    if (candidateCount > 0) {
            tryCurrentCandidate();
    } else {
        channelLocked = false;
        Serial.printf("[ESP-NOW] SSID '%s' not found — will retry\n", CONTROL_WIFI_SSID);
    }
}

static void espNowInit() {
    WiFi.mode(WIFI_STA);
    if (esp_now_init() != ESP_OK) {
        Serial.println("[ESP-NOW] init failed");
        return;
    }
    esp_now_register_send_cb(onEspNowSent);
    esp_now_register_recv_cb(onEspNowRecv);

    // Register control as our only peer. Channel 0 = current WiFi channel.
    esp_now_peer_info_t p = {};
    memcpy(p.peer_addr, CONTROL_MAC, 6);
    p.channel = 0;
    p.encrypt = false;
    if (esp_now_add_peer(&p) != ESP_OK) {
        Serial.println("[ESP-NOW] esp_now_add_peer failed");
    }

    Serial.println("\n========================================");
    Serial.printf("  MOTOR MAC: %s\n", WiFi.macAddress().c_str());
    Serial.printf("  Control peer: %02X:%02X:%02X:%02X:%02X:%02X\n",
                  CONTROL_MAC[0], CONTROL_MAC[1], CONTROL_MAC[2],
                  CONTROL_MAC[3], CONTROL_MAC[4], CONTROL_MAC[5]);
    Serial.println("========================================\n");
    scanForControlChannel();
}

// Called from loop(). At boot or after a rescan request, runs the SSID scan.
// After send failures, advances to the next channel from the last scan; if
// the list is exhausted, triggers a fresh rescan.
//
// Throttle: only one channel change per ~200 ms — otherwise a burst of
// failed ACKs/DONEs in quick succession could spin us through the list
// before the radio actually settles on each channel.
static uint32_t lastChannelChangeMs = 0;
static constexpr uint32_t CHANNEL_CHANGE_THROTTLE_MS = 200;

static void pairingTick() {
    if (needsRescan) { scanForControlChannel(); return; }

    if (tryNextChannel) {
        uint32_t now = millis();
        if (now - lastChannelChangeMs < CHANNEL_CHANGE_THROTTLE_MS) return;
        lastChannelChangeMs = now;
        tryNextChannel = false;

        candidateIndex++;
        if (!tryCurrentCandidate()) {
            // Ran out of candidates — rescan to refresh the list.
            Serial.println("[ESP-NOW] candidates exhausted — rescanning");
            needsRescan = true;
        }
    }
}

// ---------- protocol output ----------

static void proto(const String& line) {
    sendRaw(line.c_str(), line.length());
    Serial.print("> ");
    Serial.println(line);
}

static char pieceChar(const Piece& p) {
    char c = '.';
    switch (p.type) {
        case PAWN:   c = 'p'; break;
        case ROOK:   c = 'r'; break;
        case KNIGHT: c = 'n'; break;
        case BISHOP: c = 'b'; break;
        case QUEEN:  c = 'q'; break;
        case KING:   c = 'k'; break;
        default:     return '.';
    }
    return p.color == WHITE ? (char)toupper(c) : c;
}

static void sendState() {
    String s = "STATE:";
    for (int row = 8; row >= 1; --row) {
        for (char col = 'A'; col <= 'H'; ++col) {
            s += pieceChar(game.getPieceAt({col, row}));
        }
    }
    s += ' ';
    s += (game.getTurn() == WHITE) ? 'w' : 'b';
    proto(s);
}

static void sendTurn() {
    proto(game.getTurn() == WHITE ? "TURN:WHITE" : "TURN:BLACK");
}

// ---------- input parsing ----------

static bool parseSquare(const String& s, Position& out) {
    if (s.length() < 2) return false;
    char col = s.charAt(0);
    int  row = s.substring(1).toInt();
    if (col < 'A' || col > 'H' || row < 1 || row > 8) return false;
    out = {col, row};
    return true;
}

static const char* turnStr(PieceColor c) {
    return c == WHITE ? "WHITE" : c == BLACK ? "BLACK" : "?";
}

static const char* pieceTypeStr(PieceType t) {
    switch (t) {
        case PAWN:   return "Pawn";
        case ROOK:   return "Rook";
        case KNIGHT: return "Knight";
        case BISHOP: return "Bishop";
        case QUEEN:  return "Queen";
        case KING:   return "King";
        default:     return "(empty)";
    }
}

static void printSquare(const Position& p) {
    if (p == kNoSquare) Serial.print("off-board");
    else                Serial.printf("%c%d", p.col, p.row);
}

static void performCalibration();  // forward declaration — defined before setup()

static void drainBusyInput() {
    RxMsg pending;
    while (xQueueReceive(rxQueue, &pending, 0) == pdTRUE) {
        proto("ILLEGAL:busy");
    }
}

static void executeMove(Position from, Position to) {
    Piece moving   = game.getPieceAt(from);
    Piece captured = game.getPieceAt(to);

    if (!planner.startMove(from, to)) {
        proto(String("ILLEGAL:") + from.col + from.row + ":" + to.col + to.row);
        return;
    }

    {
        String ack = "ACK:";
        ack += from.col; ack += from.row; ack += ':';
        ack += to.col;   ack += to.row;
        proto(ack);
    }

    Serial.printf("  Moving %s %s: %c%d -> %c%d",
                  turnStr(moving.color), pieceTypeStr(moving.type),
                  from.col, from.row, to.col, to.row);
    if (captured.type != NONE) {
        Serial.printf("  (captures %s %s)",
                      turnStr(captured.color), pieceTypeStr(captured.type));
    }
    Serial.println();

    while (!planner.isMoveDone()) {
        if (xy.limitHit()) {
            Serial.println("  LIMIT HIT — recalibrating");
            if (MAGNET_ENABLED) magnet.off();
            proto("ILLEGAL:limit-hit");
            performCalibration();
            game.reset();
            sendState();
            sendTurn();
            return;
        }
        Step s = planner.peekNextStep();
        switch (s.type) {
            case MOVE_TO:
                Serial.print("  MOVE_TO ");
                printSquare(s.target);
                Serial.println();
                xy.moveToCm(s.x, s.y);
                break;
            case MAGNET_ON:
                Serial.printf("  MAGNET ON (%s) @ ",
                              s.polarity == WHITE ? "A/white" :
                              s.polarity == BLACK ? "B/black" : "?");
                printSquare(s.target);
                Serial.println();
                if (MAGNET_ENABLED) magnet.on(s.polarity);
                delay(300);  // let the field settle and grab the piece
                xy.setSpeed(CARRY_STEPS_PER_SEC);
                break;
            case MAGNET_OFF:
                Serial.print("  MAGNET OFF @ ");
                printSquare(s.target);
                Serial.println();
                delay(150);
                if (MAGNET_ENABLED) magnet.off();
                xy.setSpeed(TRAVEL_STEPS_PER_SEC);
                break;
        }
        planner.nextStep();
        drainBusyInput();
    }

    drainBusyInput();

    String done = "DONE:";
    done += from.col; done += from.row; done += ':';
    done += to.col;   done += to.row;
    proto(done);

    GameResult result = game.getResult();
    switch (result) {
        case GAME_CHECKMATE:
            proto(game.getTurn() == WHITE ? "CHECKMATE:WHITE" : "CHECKMATE:BLACK");
            Serial.printf("  Checkmate! %s wins.\n",
                          game.getTurn() == WHITE ? "Black" : "White");
            break;
        case GAME_STALEMATE:
            proto("STALEMATE");
            Serial.println("  Stalemate — draw.");
            break;
        case GAME_CHECK:
            proto(game.getTurn() == WHITE ? "CHECK:WHITE" : "CHECK:BLACK");
            sendTurn();
            Serial.printf("  Check! %s to move.\n", turnStr(game.getTurn()));
            break;
        default:
            sendTurn();
            Serial.printf("  Move done. Next turn: %s\n", turnStr(game.getTurn()));
            break;
    }
}

static void handleCommand(String input) {
    input.trim();
    input.toUpperCase();
    if (input.length() == 0) return;

    Serial.printf("[cmd] %s\n", input.c_str());

    if (input == "RESET") {
        game.reset();
        Serial.println("  Game reset.");
        sendState();
        sendTurn();
        return;
    }

    if (input == "STATE?") {
        sendState();
        sendTurn();
        return;
    }

    if (!input.startsWith("MOVE:")) {
        proto("ILLEGAL:bad-format");
        return;
    }

    String body = input.substring(5);
    int sep = body.indexOf(':');
    if (sep < 0) {
        proto("ILLEGAL:bad-format");
        return;
    }

    String fromStr = body.substring(0, sep);   fromStr.trim();
    String toStr   = body.substring(sep + 1);  toStr.trim();

    Position from{}, to{};
    if (!parseSquare(fromStr, from) || !parseSquare(toStr, to)) {
        proto("ILLEGAL:bad-square");
        return;
    }

    Serial.printf("  %c%d -> %c%d\n", from.col, from.row, to.col, to.row);
    executeMove(from, to);
}

static void performCalibration() {
    Serial.println("[CAL] Starting calibration...");
    xy.setSpeed(HOME_SPEED_STEPS_PER_SEC);
    xy.clearBounds();

    // ---- X axis ----
    Serial.println("[CAL] Homing -X...");
    xy.homeToLimit(/*xAxis=*/true, /*positive=*/false, HOME_SPEED_STEPS_PER_SEC);
    xy.setPosition(0, xy.getY());
    xy.moveBy(HOME_BACKOFF_STEPS, 0);   // back off so switch releases
    delay(150);

    Serial.println("[CAL] Measuring +X...");
    long xSteps = xy.homeToLimit(true, true, HOME_SPEED_STEPS_PER_SEC);
    xy.moveBy(-HOME_BACKOFF_STEPS, 0);  // back off from +X
    delay(150);

    // ---- Y axis ----
    Serial.println("[CAL] Homing -Y...");
    xy.homeToLimit(/*xAxis=*/false, /*positive=*/false, HOME_SPEED_STEPS_PER_SEC);
    xy.setPosition(xy.getX(), 0);
    xy.moveBy(0, HOME_BACKOFF_STEPS);   // back off so switch releases
    delay(150);

    Serial.println("[CAL] Measuring +Y...");
    long ySteps = xy.homeToLimit(false, true, HOME_SPEED_STEPS_PER_SEC);
    xy.moveBy(0, -HOME_BACKOFF_STEPS);  // back off from +Y
    delay(150);

    // ---- Compute steps/cm ----
    float spcX = (float)xSteps / KNOWN_X_CM;
    float spcY = (float)ySteps / KNOWN_Y_CM;
    float spc  = (spcX + spcY) / 2.0f;
    xy.setStepsPerCm(spc);
    xy.setMaxBounds(xSteps, ySteps);

    Serial.printf("[CAL] X: %ld steps (%.1f/cm)  Y: %ld steps (%.1f/cm)  avg: %.1f/cm\n",
                  xSteps, spcX, ySteps, spcY, spc);

    // ---- Park near origin ----
    xy.setPosition(xSteps - HOME_BACKOFF_STEPS, ySteps - HOME_BACKOFF_STEPS);
    xy.moveToCm(SQUARE_ORIGIN_X - SQUARE_STEP_X, SQUARE_ORIGIN_Y - SQUARE_STEP_Y);
    xy.setSpeed(TRAVEL_STEPS_PER_SEC);

    Serial.println("[CAL] Calibration done.");
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("[ChessBot] boot");

    rxQueue = xQueueCreate(8, sizeof(RxMsg));
    espNowInit();

    xy.begin();
    xy.setSpeed(TRAVEL_STEPS_PER_SEC);

    // Limit switches — active-LOW (switch connects GPIO to GND; 10kΩ pull-up to 3.3V).
    CoreXY::LimitPins limits;
    limits.xMinus  = 26;
    limits.xPlus   = 25;
    limits.yMinus1 = 34;
    limits.yMinus2 = 35;
    limits.yPlus1  = 36;
    limits.yPlus2  = 39;
    xy.setLimitSwitches(limits, /*activeHigh=*/false);

    if (MAGNET_ENABLED) magnet.begin();

    performCalibration();

    Serial.println("[ChessBot] Ready. Waiting for pairing...");
}

void loop() {
    pairingTick();

    // Drain inbound ESP-NOW messages.
    RxMsg m;
    while (xQueueReceive(rxQueue, &m, 0) == pdTRUE) {
        handleCommand(String(m.data));
    }

    // USB serial for local debugging / manual commands.
    if (Serial.available()) {
        String input = Serial.readStringUntil('\n');
        handleCommand(input);
    }

    // Once the channel scan locks in, broadcast initial state once so the
    // control / UI start with an accurate view of the board.
    static bool announcedReady = false;
    if (channelLocked && !announcedReady) {
        announcedReady = true;
        Serial.printf("[ESP-NOW] ready on channel %u\n", currentChannel);
        sendState();
        sendTurn();
    }
}
