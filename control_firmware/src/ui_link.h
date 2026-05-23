#pragma once

#include <stdint.h>
#include "pico_link.h"

// Connect to the Next.js broker as a WebSocket client.
// serverIp  — LAN IP of the laptop running `npm run dev`
//             (e.g. "192.168.1.42").  Configure in config.h as UI_SERVER_IP.
// port      — defaults to 3000 (Next.js dev server).
// Call after WiFi is up.
void uiLinkBegin(const char *serverIp, uint16_t port = 3001);

// Drive the WebSocket client state machine. Must be called every loop().
void uiLinkPoll();

// Send a Pico event to the broker; it will be forwarded to all browsers.
void uiLinkBroadcast(const PicoEvent &e);
