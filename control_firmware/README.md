# Control Firmware

Runs on the **Seeed XIAO ESP32-S3**. Acts as the central brain: transcribes voice commands via OpenAI Whisper, hosts a WebSocket server for the web UI, and relays everything to the Pico over UART.

## What It Does

- Listens for a button press, records up to 3 seconds of audio via I2S microphone
- Sends the audio to OpenAI Whisper and parses the transcript for a chess move ("e2 to e4")
- Hosts a WebSocket server so the Next.js UI can send moves and receive live game events
- Forwards move commands to the Pico (`MOVE:E2:E4`) and relays Pico responses back to the UI
- Voice and UI commands are interchangeable — the Pico can't tell them apart

## Hardware

**Board:** Seeed XIAO ESP32-S3

| Component | Pins |
|-----------|------|
| I2S Mic DOUT / BCLK / LRCLK | D0, D1, D2 |
| Record button (BOOT, active LOW) | D3 |
| UART TX to Pico / RX from Pico | D4, D5 |

**Required hardware:**
- ICS-43432 (or compatible) I2S MEMS microphone
- Wi-Fi access to the same LAN as the laptop running the UI

## Configuration

Credentials are kept out of source control. Before building:

```bash
cp src/config.h.example src/config.h
```

Edit `src/config.h`:

```cpp
#define WIFI_SSID       "your_network_name"
#define WIFI_PASSWORD   "your_wifi_password"
#define OPENAI_API_KEY  "sk-proj-..."
```

`src/config.h` is gitignored and will never be committed.

## Building & Flashing

Requires [PlatformIO](https://platformio.org/).

```bash
cd control_firmware
pio run --target upload
```

Update the upload port in `platformio.ini` if `/dev/cu.usbmodem14301` doesn't match your system.

**Dependencies** (auto-installed):
- `bblanchon/ArduinoJson`
- `mathieucarbou/AsyncTCP`
- `mathieucarbou/ESPAsyncWebServer`

## Usage

1. Flash the firmware and open a serial monitor at **115200 baud**.
2. The ESP32 connects to Wi-Fi and prints its IP address — note it for the UI.
3. Press the **BOOT button** to record a move. Speak clearly: *"e2 to e4"*.
4. The firmware transcribes, parses, and sends the move to the Pico automatically.

Alternatively, the Next.js UI connects to `ws://<esp32-ip>/ws` and sends moves directly.

## WebSocket API

The ESP32 hosts a WebSocket at `ws://<device-ip>/ws`.

### UI → ESP32

```json
{ "type": "move",  "from": "E2", "to": "E4" }
{ "type": "reset" }
{ "type": "hello" }
```

### ESP32 → UI

```json
{ "type": "ack",     "from": "E2", "to": "E4" }
{ "type": "illegal", "from": "E2", "to": "E4", "reason": "..." }
{ "type": "done",    "from": "E2", "to": "E4" }
{ "type": "turn",    "color": "WHITE" }
{ "type": "state",   "board": "rnbqkbnr...w" }
{ "type": "log",     "text": "..." }
```

## Source Layout

```
src/
├── main.cpp        # Button handler, recording pipeline, Whisper call, move parser
├── pico_link.cpp/h # UART protocol to/from the Pico
├── ui_link.cpp/h   # WebSocket server (ESPAsyncWebServer)
└── config.h        # Credentials (gitignored — copy from config.h.example)
```
