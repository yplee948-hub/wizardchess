You're updating an existing Next.js chess board UI to drive a real chess robot over a WebSocket. The robot is an ESP32-S3 on the same LAN that hosts a single WebSocket endpoint and relays everything to/from a Raspberry Pi Pico that owns the actual game state.

## Endpoint

- URL: `ws://<S3_IP>/ws` — single endpoint, all traffic.
- Read the IP from `process.env.NEXT_PUBLIC_S3_WS_URL` (full `ws://…/ws` URL). Default to `ws://192.168.1.42/ws` if unset.
- The S3 prints its IP over USB serial on boot.

## Protocol — UI → S3 (you send these)

```json
{ "type": "move",  "from": "E2", "to": "E4" }
{ "type": "reset" }
{ "type": "hello" }
```

- `from`/`to` are uppercase algebraic squares ("A1"–"H8").
- `hello` is optional; on a fresh connection the S3 will already replay cached state.

## Protocol — S3 → UI (you receive these)

```json
{ "type": "ack",     "from": "E2", "to": "E4" }
{ "type": "done",    "from": "E2", "to": "E4" }
{ "type": "illegal", "reason": "..." }
{ "type": "turn",    "color": "WHITE" }
{ "type": "state",   "board": "<64chars>", "turn": "WHITE" }
{ "type": "log",     "text": "..." }
```

- `state.board` is 64 chars, row-major from rank 8 down to rank 1, piece letters `PNBRQK` (white) / `pnbrqk` (black) / `.` (empty). No slashes, no FEN — just the 64 chars.
- `state.turn` and `turn.color` are `"WHITE"` or `"BLACK"`.
- `illegal` does **not** carry from/to — correlate it with the move you most recently sent.
- Starting-position `state.board` is `"rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR"`.

## Connection lifecycle

1. UI opens the socket.
2. S3 immediately pushes the cached `state` and last `turn` (no need to send `hello` first). If the S3 has nothing cached yet, nothing arrives — request with `hello` to retry.
3. UI sends `move` or `reset`.
4. Sequence on a successful move: `ack` → `done` → `turn`. On a rejected move: `illegal` only.
5. Sequence on reset: `state` → `turn`.

## Behavioral requirements

- **No optimistic UI.** Mark the move "pending" the moment you send it; render the board change only on `done`. On `illegal`, revert/clear the pending state and show the reason.
- **Board state is not authoritative on the client.** Drive it entirely from `state` / `done` / `turn`. Do not maintain a parallel game model — the Pico is the source of truth.
- **Multi-source.** The board can change from voice input on the device, not just from this UI. Treat every incoming `done` / `state` / `turn` as ground truth and re-render. Two browsers connected at once should stay in sync.
- **Reconnect.** On socket close, reconnect with exponential backoff (start 500 ms, cap 10 s, jitter optional). On reconnect, the S3 will replay cached `state` automatically.
- **Reset button.** Sends `{"type":"reset"}` and waits for the resulting `state` to repaint.

## Constraints

- Single client component owns the socket for the page's lifetime.
- No Node API routes, no server-side WebSocket code — direct browser → S3.
- Don't add auth or queueing.

## Acceptance

- Loading the page connects to the S3 and renders the current board within ~1 s.
- Clicking a piece + target square sends `move`, shows pending state, then animates on `done`.
- A second browser tab on the same LAN reflects the same moves in real time.
- Saying a move out loud at the device produces the same updates in the UI without anything being clicked.
- Pulling the S3's power and bringing it back recovers the connection automatically.
