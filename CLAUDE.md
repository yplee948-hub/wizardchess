# CLAUDE.md

Context for Claude across conversations on this project. Update as the project evolves.

## What this project is

**Wizard Chess** — a Harry Potter-style physical chess board that autonomously moves pieces using an electromagnet on a CoreXY gantry. Players issue moves by voice or web UI; the board slides pieces to match.

This is a TECHIN 515 capstone-style project.

## Architecture

```
Browser ──── ws://<laptop>/ws ────▶ Next.js broker (server.mjs, port 3000)
                                          │
                                     ws://<laptop>/device
                                          │
                                          ▼
                                   ESP32-S3 (control_firmware)  ◀── I2S mic → Whisper
                                          │  ESP-NOW
                                          ▼
                                   ESP32-S3 (motor_firmware)
                                          │
                                          ▼
                                   CoreXY gantry + Electromagnet
```

- **Next.js server (`server.mjs`)** is a WebSocket broker — browsers connect to `/ws`, the ESP32-S3 connects to `/device` as a client. Messages are forwarded in both directions.
- The ESP32-S3 connecting *as a client* avoids the `permessage-deflate` compression issue that broke direct browser→ESP32 WebSocket connections.
- Any device on the LAN can open the UI; `socket.ts` auto-derives the WS URL from `window.location.host`.
- **control_firmware** receives moves/resets from the broker, sends them over ESP-NOW to the motor ESP32-S3, and relays game state events back.
- **motor_firmware** validates moves, drives steppers + electromagnet via CoreXY, and sends game state back over ESP-NOW.

## Repository layout

| Path | Role |
|------|------|
| `motor_firmware/` | Raspberry Pi Pico (RP2040) — CoreXY motion + chess game logic. PlatformIO. |
| `control_firmware/` | Seeed XIAO ESP32-S3 — voice recognition + WebSocket bridge + UART link to Pico. PlatformIO. |
| `UI/` | Next.js web interface with Stockfish AI integration. |
| `prints/` | Fabrication files (PCB KiCad, STLs, SVGs). Large assets live on OneDrive — see README. |

## Hardware

- Raspberry Pi Pico (RP2040) — motor control + game logic
- Seeed XIAO ESP32-S3 — voice + Wi-Fi
- 2× stepper motors + drivers — CoreXY X/Y
- Electromagnet (H-bridge driven) — piece pickup
- ICS-43432 I2S microphone — voice input
- Custom motor PCB integrating Pico + drivers (KiCad in `prints/Chess_motor_pcb/`)

## Inter-MCU link

control ESP32-S3 ↔ motor ESP32-S3 over **ESP-NOW** (not UART). See `control_firmware/src/pico_link.{h,cpp}`.
Auto-pairs on boot via broadcast handshake (`PAIR:CONTROL` / `PAIR_ACK:MOTOR`).

## Conventions / notes

- Flash order: Pico first, then ESP32-S3, then run UI.
- OneDrive holds fabrication files too large for git: https://uwnetid-my.sharepoint.com/:f:/r/personal/ktaing_uw_edu/Documents/wizard_chess

## WebSocket protocol (UI ↔ broker ↔ ESP32)

**Browser → ESP32** (via broker):
| type | fields | meaning |
|------|--------|---------|
| `move` | `from`, `to` (e.g. `"E2"`, `"E4"`) | player move |
| `reset` | — | reset board |
| `hello` | — | request current state snapshot |

**ESP32 → Browser** (via broker):
| type | fields | meaning |
|------|--------|---------|
| `ack` | `from`, `to` | move received by firmware |
| `done` | `from`, `to` | piece physically moved |
| `illegal` | `reason` | move rejected |
| `turn` | `color` (`"WHITE"`/`"BLACK"`) | whose turn |
| `state` | `board` (64-char string), `turn` | full board snapshot |
| `log` | `text` | debug message |

## Current status / in-progress work

_(Update this section as work proceeds.)_

- `control_firmware/main.cpp` is currently a **WiFi smoke test** — real code is in `main.cpp.bak2`. Restore when done testing.
- `UI_SERVER_IP` in `main.cpp.bak2` must be set to the laptop's LAN IP before flashing.
- Uncommitted edits in: `control_firmware/`, `motor_firmware/`, `UI/`.
- Untracked: `prints/Chess_piece_prints/`, KiCad autosaves in `prints/Chess_motor_pcb/`.

## How to keep this file fresh

When something changes that future-Claude would need to know cold (new subsystem, protocol change, hardware swap, major refactor, current milestone), update the relevant section above. Keep it concise — link to code rather than duplicating it.
