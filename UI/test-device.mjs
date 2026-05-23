import WebSocket from 'ws'

const ws = new WebSocket('ws://localhost:3001/device')

ws.on('open', () => {
  console.log('[device] connected to broker')
  ws.send(JSON.stringify({
    type: 'state',
    board: 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR',
    turn: 'WHITE'
  }))
  console.log('[device] sent initial board state')
})

const STARTING_STATE = {
  type: 'state',
  board: 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR',
  turn: 'WHITE'
}

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString())
  console.log('[device] received:', msg)

  if (msg.type === 'hello') {
    ws.send(JSON.stringify(STARTING_STATE))
    console.log('[device] hello — sent state')
  }

  if (msg.type === 'move') {
    ws.send(JSON.stringify({ type: 'ack', from: msg.from, to: msg.to }))
    console.log(`[device] ack'd ${msg.from} → ${msg.to}`)

    setTimeout(() => {
      ws.send(JSON.stringify({ type: 'done', from: msg.from, to: msg.to }))
      console.log(`[device] done ${msg.from} → ${msg.to}`)
    }, 1000)
  }

  if (msg.type === 'reset') {
    ws.send(JSON.stringify(STARTING_STATE))
    console.log('[device] reset — sent starting state')
  }
})

ws.on('close', () => console.log('[device] disconnected'))
ws.on('error', (e) => console.error('[device] error:', e.message))
