# Wizard Chess — Web UI

Next.js app for the physical board: intro screen, playable board, Stockfish opponent, and a WebSocket broker that talks to the ESP32-S3 control firmware.

## Prerequisites

- Node.js 20+
- ESP32-S3 flashed with [`control_firmware`](../control_firmware/README.md) (set `UI_SERVER_IP` in `config.h` to this machine’s LAN IP)

## Setup

```bash
cd UI
npm install
cp ../control_firmware/src/config.h.example ../control_firmware/src/config.h   # if not done yet — edit Wi‑Fi/API keys on the ESP32 side
```

Optional env (`.env.local`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | Next.js HTTP |
| `BROKER_PORT` | `3001` | WebSocket broker |
| `NEXT_PUBLIC_WS_URL` | `ws://<hostname>:3001/ws` | Override WS URL in the browser |

## Run

```bash
npm run dev
```

- UI: http://localhost:3000  
- Broker: `ws://localhost:3001/ws` (browser) · `ws://<your-lan-ip>:3001/device` (ESP32)

Open the UI from another device on the same Wi‑Fi using `http://<laptop-ip>:3000` — the client picks up the broker host automatically.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | UI + broker (`server.mjs`) |
| `npm run build` | Production Next.js build |
| `npm run start` | Production UI + broker |
| `npm run lint` | ESLint |
| `node test-device.mjs` | Quick broker/device smoke test |

## Layout

```
UI/
├── app/              # Next.js App Router (intro + /game)
├── public/           # SVG pieces, intro assets, Stockfish WASM
├── scripts/          # Stockfish copy helper, ws-test.html
├── server.mjs        # HTTP (3000) + WebSocket broker (3001)
└── test-device.mjs   # Broker connectivity helper
```

See [root README](../README.md) for full system architecture and flash order.
