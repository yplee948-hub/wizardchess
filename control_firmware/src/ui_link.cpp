#include "ui_link.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>

#include "pico_link.h"

static WebSocketsClient gWsClient;
static bool             gConnected = false;


// ─────────────────────────────────────────────────────────────────────────────
// Outgoing — format a PicoEvent as JSON and send to the broker
// ─────────────────────────────────────────────────────────────────────────────
static void sendJson(const char *json, size_t len) {
    if (!gConnected) return;
    gWsClient.sendTXT(json, len);
}



// ─────────────────────────────────────────────────────────────────────────────
// Incoming — dispatch JSON from the broker (originally from a browser)
// ─────────────────────────────────────────────────────────────────────────────
static void handleText(const char *data, size_t len) {
    JsonDocument doc;
    if (deserializeJson(doc, data, len) != DeserializationError::Ok) {
        Serial.printf("[ui_link] bad JSON: %.*s\n", (int)len, data);
        return;
    }
    const char *type = doc["type"] | "";

    if (strcmp(type, "move") == 0) {
        const char *from = doc["from"] | "";
        const char *to   = doc["to"]   | "";
        if (*from && *to) {
            Serial.printf("[UI → S3] move %s → %s\n", from, to);
            picoSendMove(from, to);
        }
    } else if (strcmp(type, "reset") == 0) {
        Serial.println("[UI → S3] reset");
        picoSendReset();
    } else if (strcmp(type, "hello") == 0) {
        Serial.println("[UI → S3] hello — requesting state from Pico");
        picoSendStateRequest();
    } else {
        Serial.printf("[ui_link] unknown type: '%s'\n", type);
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// WebSocket event handler
// ─────────────────────────────────────────────────────────────────────────────
static void onWsEvent(WStype_t type, uint8_t *payload, size_t length) {
    switch (type) {
        case WStype_CONNECTED:
            gConnected = true;
            Serial.printf("[ui_link] connected to broker at %s\n", (char *)payload);
            break;
        case WStype_DISCONNECTED:
            gConnected = false;
            Serial.println("[ui_link] disconnected from broker — will retry");
            break;
        case WStype_TEXT:
            Serial.printf("[ui_link] ← %.*s\n", (int)length, (char *)payload);
            handleText((const char *)payload, length);
            break;
        case WStype_ERROR:
            Serial.printf("[ui_link] WS error\n");
            break;
        default:
            break;
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────
void uiLinkBegin(const char *serverIp, uint16_t port) {
    gWsClient.begin(serverIp, port, "/device");
    gWsClient.onEvent(onWsEvent);
    gWsClient.setReconnectInterval(2000);
    Serial.printf("[ui_link] connecting to broker ws://%s:%u/device\n", serverIp, port);
}

void uiLinkPoll() {
    gWsClient.loop();
}

void uiLinkBroadcast(const PicoEvent &e) {
    char buf[200];
    size_t n = 0;

    switch (e.type) {
        case PicoEventType::Ack:
            n = snprintf(buf, sizeof(buf),
                "{\"type\":\"ack\",\"from\":\"%s\",\"to\":\"%s\"}", e.from, e.to);
            break;
        case PicoEventType::Done:
            n = snprintf(buf, sizeof(buf),
                "{\"type\":\"done\",\"from\":\"%s\",\"to\":\"%s\"}", e.from, e.to);
            break;
        case PicoEventType::Illegal:
            n = snprintf(buf, sizeof(buf),
                "{\"type\":\"illegal\",\"reason\":\"%s\"}", e.text);
            break;
        case PicoEventType::Turn:
            n = snprintf(buf, sizeof(buf),
                "{\"type\":\"turn\",\"color\":\"%s\"}", e.color);
            break;
        case PicoEventType::State: {
            // Split "<64chars> <w|b>" into board string and turn.
            char board[72] = {};
            char turn = '?';
            const char *sp = strrchr(e.board, ' ');
            if (sp) {
                size_t bl = (size_t)(sp - e.board);
                if (bl >= sizeof(board)) bl = sizeof(board) - 1;
                memcpy(board, e.board, bl);
                board[bl] = '\0';
                turn = sp[1];
            } else {
                strncpy(board, e.board, sizeof(board) - 1);
            }
            const char *turnStr = (turn == 'w' || turn == 'W') ? "WHITE"
                               : (turn == 'b' || turn == 'B') ? "BLACK" : "";
            n = snprintf(buf, sizeof(buf),
                "{\"type\":\"state\",\"board\":\"%s\",\"turn\":\"%s\"}", board, turnStr);
            break;
        }
        case PicoEventType::Log:
            n = snprintf(buf, sizeof(buf),
                "{\"type\":\"log\",\"text\":\"%s\"}", e.text);
            break;
        default:
            return;
    }

    if (n > 0 && n < sizeof(buf)) sendJson(buf, n);
}
