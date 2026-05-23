#pragma once

#include <Arduino.h>

enum class PicoEventType : uint8_t {
    Unknown = 0,
    Ack,
    Illegal,
    Done,
    Turn,
    State,
    Log,
};

struct PicoEvent {
    PicoEventType type;
    char from[4];     // ACK / DONE
    char to[4];       // ACK / DONE
    char color[8];    // TURN  ("WHITE" | "BLACK")
    char board[80];   // STATE payload (raw, e.g. "<64chars> w")
    char text[96];    // ILLEGAL reason or LOG text or unknown raw line
};

using PicoEventCallback = void (*)(const PicoEvent &);

// Bring up ESP-NOW transport to the motor controller and register the event
// callback. WiFi.mode(WIFI_STA) must be set by the caller (this firmware
// already does so for the Whisper HTTPS client).
void picoBegin(PicoEventCallback cb);

// Service pairing announcements and dispatch any queued inbound frames.
// Non-blocking; safe to call every loop() iteration.
void picoPoll();

// Outgoing helpers — one ESP-NOW frame per call. No newline terminator;
// the motor firmware treats each frame as a complete command.
void picoSendMove(const char *from, const char *to);
void picoSendReset();
void picoSendStateRequest();

// True once the motor controller has been discovered and paired.
bool picoIsPaired();
