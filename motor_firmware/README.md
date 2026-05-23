# Motor Firmware

Runs on the **Raspberry Pi Pico (RP2040)**. Owns the chess game state, validates moves, plans the physical piece path, and drives the CoreXY gantry and electromagnet.

## What It Does

- Maintains a full chess game (legal move validation, turn tracking, board state)
- Receives move commands from the ESP32-S3 over UART (`MOVE:E2:E4`)
- Plans the physical path — routing around pieces, lifting/lowering the electromagnet
- Drives two stepper motors in CoreXY kinematics to move the carriage
- Emits game events back to the ESP32-S3 (`ACK`, `DONE`, `TURN`, `STATE`)

## Hardware

**Board:** Raspberry Pi Pico (RP2040)

| Component | Pins (GPIO) |
|-----------|-------------|
| Motor A (enable / step / dir) | GPIO 2, 3, 4 |
| Motor B (enable / step / dir) | GPIO 18, 19, 20 |
| Electromagnet (IN1 / IN2 / ENA) | GPIO 6, 7, 8 |
| UART to ESP32-S3 (TX / RX) | Serial2 (GPIO 4/5 default) |

**Motion specs:**
- Travel: ~41 cm × 41 cm
- Steps per axis: 16,400
- Square origin A1: (2.5 cm, 2.5 cm) from home
- Square spacing: 5.0 cm per column and row

## Building & Flashing

Requires [PlatformIO](https://platformio.org/) (CLI or VS Code extension).

```bash
cd motor_firmware
pio run --target upload
```

The board and upload port are set in `platformio.ini` (`board = pico`, port `/dev/cu.usbmodem144401`). Update the port to match your system if needed.

**Dependencies** (auto-installed by PlatformIO):
- `adafruit/Adafruit VEML7700 Library`

## UART Protocol

The Pico communicates with the ESP32-S3 over UART at **115200 baud**.

### Incoming (ESP32-S3 → Pico)

| Message | Meaning |
|---------|---------|
| `MOVE:<from>:<to>` | e.g. `MOVE:E2:E4` |
| `RESET` | Reset the game to starting position |
| `STATE?` | Request a full board state dump |

### Outgoing (Pico → ESP32-S3)

| Message | Meaning |
|---------|---------|
| `ACK:<from>:<to>` | Move accepted, motion starting |
| `DONE:<from>:<to>` | Motors finished, piece placed |
| `ILLEGAL:<reason>` | Move rejected |
| `TURN:<WHITE\|BLACK>` | Turn changed |
| `STATE:<board> <w\|b>` | 64-char board snapshot + side to move |
| `LOG:<text>` | Debug message |

## Source Layout

```
src/
├── main.cpp          # Setup, UART command dispatch, move loop
├── ChessGame.cpp/h   # Chess rules and board state
├── ChessTypes.h      # Piece and square types
├── CoreXY.cpp/h      # CoreXY kinematics
├── MovePlanner.cpp/h # Physical path planning around pieces
├── StepperMotor.cpp/h# Low-level stepper driver
└── Electromagnet.h   # Electromagnet H-bridge control
```

## Debugging

Open a serial monitor at **115200 baud** on the Pico's USB port. Protocol lines (`ACK`, `DONE`, etc.) go to `Serial2` (UART to ESP32); debug logs go to USB `Serial`.
