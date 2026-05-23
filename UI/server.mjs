import { createServer } from 'http'
import { parse } from 'url'
import { WebSocketServer } from 'ws'
import next from 'next'

const dev        = process.env.NODE_ENV !== 'production'
const uiPort     = parseInt(process.env.PORT        || '3000', 10)
const brokerPort = parseInt(process.env.BROKER_PORT || '3001', 10)

// ── Next.js UI (port 3000) ────────────────────────────────────────────────────
const app    = next({ dev })
const handle = app.getRequestHandler()

await app.prepare()

createServer(async (req, res) => {
  await handle(req, res, parse(req.url, true))
}).listen(uiPort, () => {
  console.log(`> UI ready on http://localhost:${uiPort}`)
})

// ── WS Broker (port 3001, separate to avoid conflicting with Next.js HMR) ─────
//
// Browsers connect to  ws://<host>:3001/ws
// ESP32-S3 connects to ws://<host>:3001/device

const browserWss = new WebSocketServer({ noServer: true, perMessageDeflate: false })
const deviceWss  = new WebSocketServer({ noServer: true, perMessageDeflate: false })

let deviceWs = null
const browserClients = new Set()

deviceWss.on('connection', (ws) => {
  console.log('[broker] ESP32 connected')
  // If an older socket is still being tracked, close it before replacing.
  if (deviceWs && deviceWs !== ws) {
    try { deviceWs.close() } catch { /* ignore */ }
  }
  deviceWs = ws

  ws.on('message', (data) => {
    const msg = data.toString()
    console.log('[broker] device →', msg)
    for (const b of browserClients) {
      if (b.readyState === 1 /* OPEN */) b.send(msg)
    }
  })

  ws.on('close', () => {
    console.log('[broker] ESP32 disconnected')
    // Only clear if this socket is still the current one — a stale close from
    // a previous connection must not wipe out the new live one.
    if (deviceWs === ws) deviceWs = null
  })

  ws.on('error', (e) => console.warn('[broker] device error:', e.message))
})

browserWss.on('connection', (ws) => {
  console.log('[broker] browser connected')
  browserClients.add(ws)

  ws.on('message', (data) => {
    const msg = data.toString()
    console.log('[broker] browser →', msg)
    if (deviceWs?.readyState === 1 /* OPEN */) {
      deviceWs.send(msg)
    } else {
      console.warn('[broker] ESP32 not connected — dropping:', msg)
    }
  })

  ws.on('close',  () => browserClients.delete(ws))
  ws.on('error', (e) => console.warn('[broker] browser error:', e.message))
})

const brokerServer = createServer((_, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Chess WS broker — connect via WebSocket')
})

brokerServer.on('upgrade', (req, socket, head) => {
  const { pathname } = parse(req.url)
  if (pathname === '/device') {
    deviceWss.handleUpgrade(req, socket, head, (ws) => deviceWss.emit('connection', ws, req))
  } else if (pathname === '/ws') {
    browserWss.handleUpgrade(req, socket, head, (ws) => browserWss.emit('connection', ws, req))
  } else {
    socket.destroy()
  }
})

brokerServer.listen(brokerPort, () => {
  console.log(`> WS broker on port ${brokerPort}: /ws (browsers)  /device (ESP32)`)
})
