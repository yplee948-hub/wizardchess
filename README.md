# Wizard Chess

A Harry Potter-style physical chess board that moves pieces autonomously using an electromagnet on a CoreXY gantry. Players interact via voice command or a web UI — the board physically slides the pieces to match the move.

## How It Works

```
Browser (Next.js UI)
        │
        │  WebSocket (LAN)
        ▼
ESP32-S3 (control_firmware)   ◄──── I2S Microphone (voice → Whisper)
        │
        │  UART @ 115200
        ▼
Raspberry Pi Pico (motor_firmware)
        │
        ▼
CoreXY gantry + Electromagnet
```

1. A player speaks a move ("e2 to e4") or clicks it in the UI.
2. The **ESP32-S3** transcribes voice via OpenAI Whisper (or receives it over WebSocket) and forwards it to the Pico.
3. The **Pico** validates the move, plans the physical path, and drives the CoreXY stepper motors and electromagnet to move the piece.
4. Game state lives on the Pico and is relayed back to the UI in real time.

## Repository Structure

```
wizardchess/
├── motor_firmware/      # Raspberry Pi Pico — CoreXY motion + chess game logic
├── control_firmware/    # Seeed XIAO ESP32-S3 — voice + WebSocket bridge (ESP-NOW to motor)
├── UI/                  # Next.js web UI + WebSocket broker (only copy — do not duplicate)
├── prints/              # KiCad PCB + gerbers (STLs on OneDrive)
└── README.md            # This file
```

> **Web UI:** Use the `UI/` folder only. If you download a separate “web interface” zip, merge into `UI/` or replace it — do not add a second top-level copy.

## Hardware Required

| Component | Role |
|-----------|------|
| Raspberry Pi Pico (RP2040) | Motor control + game logic |
| Seeed XIAO ESP32-S3 | Voice recognition + Wi-Fi bridge |
| 2× Stepper motors (+ driver) | CoreXY X/Y motion |
| Electromagnet (H-bridge driven) | Piece pickup |
| ICS-43432 I2S microphone | Voice input |
| Custom motor PCB | Integrates Pico + drivers |

## Quick Start

See the README in each subdirectory for full setup instructions:

- [`motor_firmware/`](motor_firmware/README.md) — flash the Pico first
- [`control_firmware/`](control_firmware/README.md) — flash the ESP32-S3 second
- [`UI/`](UI/README.md) — run the web interface last
## Fabrication Files (Prints)

STL models, resin slicer files (.ctb), KiCad PCB, laser cut SVGs, and Fusion 360 source files are stored on OneDrive (too large for git):

**[Open OneDrive folder](https://uwnetid-my.sharepoint.com/:f:/r/personal/ktaing_uw_edu/Documents/wizard_chess?csf=1&web=1&e=kmWmI7)**
