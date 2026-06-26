#pragma once
#include <Arduino.h>

// ─────────────────────────────────────────────────────────────────────────────
// Serial is DISABLED on this board.
//
// The electromagnet is wired to the UART0 console pins: ENA=GPIO1 (U0TXD),
// IN1=GPIO3 (U0RXD). Any real Serial output would toggle GPIO1 and fire the
// magnet, so every Serial.* call is routed to this no-op sink instead.
//
// To restore serial debugging, move the magnet off GPIO1/3 first, then delete
// this header and the `#include "NullSerial.h"` lines.
//
// TEMP DEBUG ESCAPE HATCH: building with -DMOTOR_DEBUG_SERIAL leaves the real
// Serial active so you can read the boot banner (incl. the board's MAC). The
// magnet WILL twitch while serial prints — disconnect it for that build.
// Use env [env:esp32dev_macprint] in platformio.ini. Flash the normal
// [env:esp32dev] for actual operation.
// ─────────────────────────────────────────────────────────────────────────────
#ifndef MOTOR_DEBUG_SERIAL

struct NullSerialT {
    void begin(unsigned long) {}
    void begin(unsigned long, uint32_t) {}
    void end() {}
    void flush() {}
    int  available() { return 0; }
    String readStringUntil(char) { return String(); }
    template <typename... A> size_t print(A...)   { return 0; }
    template <typename... A> size_t println(A...) { return 0; }
    template <typename... A> int    printf(A...)  { return 0; }
    explicit operator bool() const { return true; }
};

static NullSerialT NullSerial;

// Redirect the global `Serial` token to the sink for the rest of this TU.
#define Serial NullSerial

#endif  // MOTOR_DEBUG_SERIAL
