#include "pico_link.h"

#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <ctype.h>
#include <string.h>

// ── Peer MAC (hardcoded) ─────────────────────────────────────────────────────
// Motor controller's MAC. Read once from motor serial at first boot and
// pasted here. If the motor board is ever swapped, update this constant.
static const uint8_t MOTOR_MAC[6] = {0x3C, 0xE9, 0x0E, 0x89, 0xD3, 0xAC};


// ── State ────────────────────────────────────────────────────────────────────
static PicoEventCallback gCallback = nullptr;

struct RxMsg { uint16_t len; char data[200]; };
static QueueHandle_t gRxQueue = nullptr;


// ── Helpers ──────────────────────────────────────────────────────────────────
static bool ieq(const char *a, const char *b) {
    while (*a && *b) {
        if (tolower((unsigned char)*a) != tolower((unsigned char)*b)) return false;
        a++; b++;
    }
    return *a == '\0' && *b == '\0';
}

static void copyField(char *dst, size_t cap, const char *src, size_t n) {
    if (n >= cap) n = cap - 1;
    memcpy(dst, src, n);
    dst[n] = '\0';
}

static const char *findColon(const char *s, const char *end) {
    while (s < end && *s != ':') s++;
    return s;
}

static void sendRaw(const char *s, size_t len) {
    esp_now_send(MOTOR_MAC, (const uint8_t *)s, len);
}


// ── Parser ───────────────────────────────────────────────────────────────────
static void parseFrame(const char *line, size_t len) {
    while (len > 0 && (line[len-1] == '\r' || line[len-1] == '\n' ||
                       line[len-1] == ' '  || line[len-1] == '\t')) len--;
    if (len == 0) return;

    PicoEvent ev = {};
    ev.type = PicoEventType::Unknown;

    const char *end   = line + len;
    const char *colon = findColon(line, end);
    size_t      keyLen = colon - line;

    copyField(ev.text, sizeof(ev.text), line, len);

    char key[16] = {};
    copyField(key, sizeof(key), line, keyLen);

    const char *rest    = (colon < end) ? colon + 1 : end;
    size_t      restLen = end - rest;

    if (ieq(key, "ACK") || ieq(key, "DONE")) {
        const char *mid = findColon(rest, end);
        if (mid == end) { if (gCallback) gCallback(ev); return; }
        copyField(ev.from, sizeof(ev.from), rest, mid - rest);
        copyField(ev.to,   sizeof(ev.to),   mid + 1, end - (mid + 1));
        ev.type = ieq(key, "ACK") ? PicoEventType::Ack : PicoEventType::Done;
    }
    else if (ieq(key, "ILLEGAL")) {
        copyField(ev.text, sizeof(ev.text), rest, restLen);
        ev.type = PicoEventType::Illegal;
    }
    else if (ieq(key, "TURN")) {
        copyField(ev.color, sizeof(ev.color), rest, restLen);
        ev.type = PicoEventType::Turn;
    }
    else if (ieq(key, "STATE")) {
        copyField(ev.board, sizeof(ev.board), rest, restLen);
        ev.type = PicoEventType::State;
    }
    else if (ieq(key, "LOG")) {
        copyField(ev.text, sizeof(ev.text), rest, restLen);
        ev.type = PicoEventType::Log;
    }

    if (gCallback) gCallback(ev);
}


// ── ESP-NOW callbacks ────────────────────────────────────────────────────────
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
static void onEspNowSent(const uint8_t *mac, esp_now_send_status_t status) {
#else
static void onEspNowSent(const uint8_t *mac, esp_now_send_status_t status) {
#endif
    if (status != ESP_NOW_SEND_SUCCESS) {
        Serial.printf("[pico_link] send FAILED to %02X:%02X:%02X:%02X:%02X:%02X\n",
                      mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    }
}

#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
static void onEspNowRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
    const uint8_t *src = info->src_addr;
#else
static void onEspNowRecv(const uint8_t *src, const uint8_t *data, int len) {
#endif
    if (len <= 0) return;
    if (memcmp(src, MOTOR_MAC, 6) != 0) return;  // ignore anyone else

    RxMsg m{};
    m.len = (len < (int)sizeof(m.data) - 1) ? len : (int)sizeof(m.data) - 1;
    memcpy(m.data, data, m.len);
    m.data[m.len] = '\0';
    BaseType_t hpw = pdFALSE;
    xQueueSendFromISR(gRxQueue, &m, &hpw);
}


// ── Public API ───────────────────────────────────────────────────────────────
void picoBegin(PicoEventCallback cb) {
    gCallback = cb;

    if (!gRxQueue) gRxQueue = xQueueCreate(8, sizeof(RxMsg));

    if (WiFi.getMode() == WIFI_OFF) WiFi.mode(WIFI_STA);

    if (esp_now_init() != ESP_OK) {
        Serial.println("[pico_link] esp_now_init failed");
        return;
    }
    esp_now_register_send_cb(onEspNowSent);
    esp_now_register_recv_cb(onEspNowRecv);

    // Register the motor as our only peer. Channel 0 = current WiFi channel.
    esp_now_peer_info_t p = {};
    memcpy(p.peer_addr, MOTOR_MAC, 6);
    p.channel = 0;
    p.encrypt = false;
    if (esp_now_add_peer(&p) != ESP_OK) {
        Serial.println("[pico_link] esp_now_add_peer failed");
    }

    uint8_t primary; wifi_second_chan_t second;
    esp_wifi_get_channel(&primary, &second);
    Serial.println("\n========================================");
    Serial.printf("  CONTROL MAC: %s\n", WiFi.macAddress().c_str());
    Serial.printf("  WiFi channel: %u\n", primary);
    Serial.printf("  Motor peer:   %02X:%02X:%02X:%02X:%02X:%02X\n",
                  MOTOR_MAC[0], MOTOR_MAC[1], MOTOR_MAC[2],
                  MOTOR_MAC[3], MOTOR_MAC[4], MOTOR_MAC[5]);
    Serial.println("========================================\n");
}

void picoPoll() {
    if (!gRxQueue) return;
    RxMsg m;
    while (xQueueReceive(gRxQueue, &m, 0) == pdTRUE) {
        Serial.printf("[pico_link] recv %u bytes: %s\n", (unsigned)m.len, m.data);
        parseFrame(m.data, m.len);
    }
}

void picoSendMove(const char *from, const char *to) {
    char buf[24];
    int n = snprintf(buf, sizeof(buf), "MOVE:%s:%s", from, to);
    if (n > 0) sendRaw(buf, (size_t)n);
}

void picoSendReset() {
    static const char *s = "RESET";
    sendRaw(s, strlen(s));
}

void picoSendStateRequest() {
    static const char *s = "STATE?";
    sendRaw(s, strlen(s));
}

bool picoIsPaired() { return true; }  // always paired — MAC is hardcoded
