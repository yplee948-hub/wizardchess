// Chess voice controller — Arduino, button-triggered Whisper test
//
// Press BOOT button → record 3 s (or until silence) → POST to Whisper →
// parse "e2 to e4" → print result. No wake word, no UART.

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <driver/i2s.h>
#include <esp_heap_caps.h>

#include "pico_link.h"
#include "ui_link.h"
#include "config.h"  // WIFI_SSID, WIFI_PASSWORD, OPENAI_API_KEY, UI_SERVER_IP — gitignored

// ── Pins (XIAO ESP32-S3) ─────────────────────────────────────────────────────
#define I2S_PORT     I2S_NUM_0
#define I2S_SD_PIN   D0   // mic DOUT
#define I2S_SCK_PIN  D1   // BCLK
#define I2S_WS_PIN   D2   // LRCLK
#define BUTTON_PIN   D3    // BOOT button (GPIO 0, active LOW, internal pullup)
// Motor controller is reached over ESP-NOW now; no UART pins required.

#define LED_ON  LOW
#define LED_OFF HIGH

// ── Audio ────────────────────────────────────────────────────────────────────
#define SAMPLE_RATE         16000
#define MAX_RECORD_MS       3000
#define MAX_SAMPLES         (SAMPLE_RATE * MAX_RECORD_MS / 1000)  // 48 000
#define CHUNK_SAMPLES       512
#define SILENCE_RMS_THRESH  400   // lower = more sensitive to faint speech (less likely to call it silent)
#define SILENCE_CHUNKS      30    // ~0.96 s of silence required before early stop
#define MIN_RECORD_CHUNKS   (SAMPLE_RATE / CHUNK_SAMPLES / 2)
#define I2S_DOWNSHIFT       14   // ICS-43432 is 24-bit-in-32-bit; shift to 16-bit

static int16_t *audioBuf     = nullptr;
static size_t   audioSamples = 0;


// ─────────────────────────────────────────────────────────────────────────────
// WiFi
// ─────────────────────────────────────────────────────────────────────────────
static bool ensureWiFi() {
    if (WiFi.status() == WL_CONNECTED) return true;
    Serial.print("[WiFi] Connecting");
    // AP_STA (not just STA) — needed for stable WiFi + ESP-NOW coexistence.
    // Also disable WiFi power-save so ESP-NOW timing isn't disrupted by sleeps.
    WiFi.mode(WIFI_AP_STA);
    WiFi.setSleep(false);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    unsigned long t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
        delay(500); Serial.print('.');
    }
    Serial.println();
    if (WiFi.status() != WL_CONNECTED) { Serial.println("[WiFi] Failed"); return false; }
    Serial.printf("[WiFi] %s\n", WiFi.localIP().toString().c_str());
    return true;
}


// ─────────────────────────────────────────────────────────────────────────────
// I2S — 32-bit slot (ICS-43432 is 24-bit-in-32-bit)
// ─────────────────────────────────────────────────────────────────────────────
static void initI2S() {
    i2s_config_t cfg = {
        .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate          = SAMPLE_RATE,
        .bits_per_sample      = I2S_BITS_PER_SAMPLE_32BIT,
        .channel_format       = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count        = 4,
        .dma_buf_len          = CHUNK_SAMPLES,
        .use_apll             = false,
        .tx_desc_auto_clear   = false,
        .fixed_mclk           = 0,
    };
    i2s_pin_config_t pins = {
        .mck_io_num   = I2S_PIN_NO_CHANGE,
        .bck_io_num   = I2S_SCK_PIN,
        .ws_io_num    = I2S_WS_PIN,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num  = I2S_SD_PIN,
    };
    ESP_ERROR_CHECK(i2s_driver_install(I2S_PORT, &cfg, 0, nullptr));
    ESP_ERROR_CHECK(i2s_set_pin(I2S_PORT, &pins));
}

// Read N int16 samples, downconverting from 32-bit slots.
static bool readI2S16(int16_t *out, size_t nSamples) {
    static int32_t buf32[CHUNK_SAMPLES];
    size_t got = 0;
    if (i2s_read(I2S_PORT, buf32, nSamples * sizeof(int32_t), &got, portMAX_DELAY) != ESP_OK)
        return false;
    size_t n = got / sizeof(int32_t);
    for (size_t i = 0; i < n; i++) {
        int32_t s = buf32[i] >> I2S_DOWNSHIFT;
        if (s >  32767) s =  32767;
        if (s < -32768) s = -32768;
        out[i] = (int16_t)s;
    }
    return n == nSamples;
}


// ─────────────────────────────────────────────────────────────────────────────
// Recording
// ─────────────────────────────────────────────────────────────────────────────
static bool isSilent(const int16_t *buf, size_t n) {
    int64_t rms = 0;
    for (size_t i = 0; i < n; i++) rms += (int64_t)buf[i] * buf[i];
    return (rms / (int64_t)n) < (int64_t)SILENCE_RMS_THRESH * SILENCE_RMS_THRESH;
}

static bool recordAudio() {
    audioSamples = 0;
    int16_t chunk[CHUNK_SAMPLES];
    int silentRun = 0;
    const int totalChunks = MAX_SAMPLES / CHUNK_SAMPLES;
    int peak = 0;

    for (int c = 0; c < totalChunks; c++) {
        if (!readI2S16(chunk, CHUNK_SAMPLES)) continue;
        size_t n = CHUNK_SAMPLES;
        if (audioSamples + n > MAX_SAMPLES) n = MAX_SAMPLES - audioSamples;
        memcpy(audioBuf + audioSamples, chunk, n * 2);
        audioSamples += n;

        for (size_t i = 0; i < n; i++) {
            int v = chunk[i] < 0 ? -chunk[i] : chunk[i];
            if (v > peak) peak = v;
        }

        if (c >= MIN_RECORD_CHUNKS) {
            silentRun = isSilent(chunk, n) ? silentRun + 1 : 0;
            if (silentRun >= SILENCE_CHUNKS) {
                Serial.println("[REC] Silence → stopping early");
                break;
            }
        }
    }
    Serial.printf("[REC] %u samples (%.2f s), peak=%d/32767\n",
                  (unsigned)audioSamples, (float)audioSamples / SAMPLE_RATE, peak);
    return audioSamples > 0;
}


// ─────────────────────────────────────────────────────────────────────────────
// WAV builder (PCM 16-bit mono 16 kHz)
// ─────────────────────────────────────────────────────────────────────────────
static uint8_t *buildWAV(size_t &wavSize) {
    uint32_t dataBytes = audioSamples * 2;
    wavSize = 44 + dataBytes;
    uint8_t *w = (uint8_t *)heap_caps_malloc(wavSize, MALLOC_CAP_SPIRAM);
    if (!w) return nullptr;

    auto p32 = [&](int o, uint32_t v) { w[o]=v; w[o+1]=v>>8; w[o+2]=v>>16; w[o+3]=v>>24; };
    auto p16 = [&](int o, uint16_t v) { w[o]=v; w[o+1]=v>>8; };

    memcpy(w,    "RIFF", 4);  p32(4,  wavSize - 8);
    memcpy(w+8,  "WAVE", 4);
    memcpy(w+12, "fmt ", 4);  p32(16, 16);
    p16(20, 1); p16(22, 1);
    p32(24, SAMPLE_RATE);
    p32(28, SAMPLE_RATE * 2);
    p16(32, 2); p16(34, 16);
    memcpy(w+36, "data", 4);  p32(40, dataBytes);
    memcpy(w+44, audioBuf, dataBytes);
    return w;
}


// ─────────────────────────────────────────────────────────────────────────────
// Whisper API
// ─────────────────────────────────────────────────────────────────────────────
static bool callWhisper(const uint8_t *wav, size_t wavSize, String &transcript) {
    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;
    http.begin(client, "https://api.openai.com/v1/audio/transcriptions");
    http.addHeader("Authorization", String("Bearer ") + OPENAI_API_KEY);
    http.setTimeout(30000);

    String bnd = "Bnd" + String(millis());
    http.addHeader("Content-Type", "multipart/form-data; boundary=" + bnd);

    String pre =
        "--" + bnd + "\r\n"
        "Content-Disposition: form-data; name=\"model\"\r\n\r\n"
        "whisper-1\r\n"
        "--" + bnd + "\r\n"
        "Content-Disposition: form-data; name=\"file\"; filename=\"audio.wav\"\r\n"
        "Content-Type: audio/wav\r\n\r\n";
    String suf = "\r\n--" + bnd + "--\r\n";

    size_t bodyLen = pre.length() + wavSize + suf.length();
    uint8_t *body  = (uint8_t *)heap_caps_malloc(bodyLen, MALLOC_CAP_SPIRAM);
    if (!body) { Serial.println("[API] Body OOM"); return false; }

    memcpy(body,                          pre.c_str(), pre.length());
    memcpy(body + pre.length(),           wav,         wavSize);
    memcpy(body + pre.length() + wavSize, suf.c_str(), suf.length());

    int code = http.POST(body, bodyLen);
    heap_caps_free(body);

    if (code != 200) {
        Serial.printf("[API] HTTP %d: %s\n", code, http.getString().c_str());
        http.end(); return false;
    }
    String resp = http.getString();
    http.end();

    JsonDocument doc;
    if (deserializeJson(doc, resp) != DeserializationError::Ok) {
        Serial.println("[API] JSON parse error");
        return false;
    }
    transcript = doc["text"] | "";
    transcript.toLowerCase();
    Serial.printf("[API] Transcript: '%s'\n", transcript.c_str());
    return transcript.length() > 0;
}


// ─────────────────────────────────────────────────────────────────────────────
// Move parser
// ─────────────────────────────────────────────────────────────────────────────
static bool parseMove(const String &text, String &from, String &to) {
    int found = 0;
    for (int i = 0; i + 1 < (int)text.length() && found < 2; i++) {
        char col = (char)tolower((unsigned char)text[i]);
        char row = text[i + 1];
        if (col >= 'a' && col <= 'h' && row >= '1' && row <= '8') {
            (found == 0 ? from : to) = String(col) + row;
            found++; i++;
        }
    }
    return found == 2;
}


// ─────────────────────────────────────────────────────────────────────────────
// Pipeline
// ─────────────────────────────────────────────────────────────────────────────
static void runPipeline() {
    digitalWrite(LED_BUILTIN, LED_ON);
    bool recOk = recordAudio();
    digitalWrite(LED_BUILTIN, LED_OFF);
    if (!recOk) { Serial.println("[PIPE] Recording failed"); return; }

    size_t wavSz;
    uint8_t *wav = buildWAV(wavSz);
    if (!wav) { Serial.println("[PIPE] WAV OOM"); return; }

    if (!ensureWiFi()) { heap_caps_free(wav); return; }

    String transcript;
    bool ok = callWhisper(wav, wavSz, transcript);
    heap_caps_free(wav);
    if (!ok) { Serial.println("[PIPE] Whisper failed"); return; }

    if (transcript.indexOf("reset") >= 0) {
        Serial.println("[S3 → Pico] RESET (from voice)");
        picoSendReset();
        return;
    }

    String from, to;
    if (!parseMove(transcript, from, to)) {
        Serial.printf("[PIPE] No chess move in: '%s'\n", transcript.c_str());
        return;
    }
    Serial.printf("[S3 → Pico] MOVE:%s:%s\n", from.c_str(), to.c_str());
    picoSendMove(from.c_str(), to.c_str());
}


// ─────────────────────────────────────────────────────────────────────────────
// Pico event handler — print every event in a human-readable form
// ─────────────────────────────────────────────────────────────────────────────
static void onPicoEvent(const PicoEvent &e) {
    uiLinkBroadcast(e);  // mirror to all WS clients

    switch (e.type) {
        case PicoEventType::Ack:
            Serial.printf("[Pico → S3] ACK %s → %s\n", e.from, e.to); break;
        case PicoEventType::Done:
            Serial.printf("[Pico → S3] DONE %s → %s\n", e.from, e.to); break;
        case PicoEventType::Illegal:
            Serial.printf("[Pico → S3] ILLEGAL: %s\n", e.text); break;
        case PicoEventType::Turn:
            Serial.printf("[Pico → S3] TURN: %s\n", e.color); break;
        case PicoEventType::State:
            Serial.printf("[Pico → S3] STATE: %s\n", e.board); break;
        case PicoEventType::Log:
            Serial.printf("[Pico → S3] LOG: %s\n", e.text); break;
        case PicoEventType::Unknown:
        default:
            Serial.printf("[Pico → S3] UNKNOWN: %s\n", e.text); break;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// setup / loop
// ─────────────────────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n[INIT] Chess voice + Pico link");

    pinMode(LED_BUILTIN, OUTPUT);
    digitalWrite(LED_BUILTIN, LED_OFF);
    pinMode(BUTTON_PIN, INPUT_PULLUP);

    audioBuf = (int16_t *)heap_caps_malloc(MAX_SAMPLES * 2, MALLOC_CAP_SPIRAM);
    if (!audioBuf) {
        Serial.println("[INIT] PSRAM alloc failed");
        for (;;) delay(1000);
    }

    initI2S();
    ensureWiFi();

    // Init ESP-NOW *before* opening the WebSocket — esp_now_init() can briefly
    // perturb the radio, so getting it out of the way first keeps the WS handshake
    // from racing against it.
    picoBegin(onPicoEvent);
    Serial.println("[INIT] ESP-NOW link to motor controller — hardcoded peer");

    uiLinkBegin(UI_SERVER_IP);

    Serial.println("[READY] Press BOOT to record a move.");
}

void loop() {
    static bool lastButton = HIGH;
    bool b = digitalRead(BUTTON_PIN);
    if (lastButton == HIGH && b == LOW) {
        delay(20);  // debounce
        if (digitalRead(BUTTON_PIN) == LOW) {
            Serial.println("\n[BTN] Pressed → recording");
            runPipeline();
            Serial.println("[READY] Press BOOT to record a move.");
        }
    }
    lastButton = b;

    picoPoll();
    uiLinkPoll();
    delay(10);
}
