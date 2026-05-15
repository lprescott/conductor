import http from 'node:http'
import { WebSocketServer } from 'ws'
import type WebSocket from 'ws'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer } from './mcp.js'
import { addClient, removeClient, setPlaying, setError, clearError, getState, broadcast } from './state.js'
import { startWatcher } from './watcher.js'

const PORT = Number(process.env.PORT) || 7777
const HOST = '127.0.0.1'

function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()))
      } catch {
        resolve(undefined)
      }
    })
    req.on('error', reject)
  })
}

// ── HTTP server ────────────────────────────────────────────────────────────────
const httpServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    const s = getState()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', connectedClients: s.clients.size }))
    return
  }

  if (req.url === '/mcp') {
    // Per-request instances required: connect() silently overwrites transport (SDK #1405)
    // and stateless transports cannot be reused (SDK #1994)
    const server = createMcpServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

    res.on('close', () => {
      void transport.close()
      void server.close()
    })

    try {
      await server.connect(transport)
      const body = req.method === 'POST' ? await parseBody(req) : undefined
      await transport.handleRequest(req, res, body)
    } catch (err) {
      console.error('[mcp] error handling request:', err)
      if (!res.headersSent) {
        res.writeHead(500)
        res.end('Internal Server Error')
      }
    }
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

// ── WebSocket server ───────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws: WebSocket) => {
  addClient(ws)
  console.log(`[ws] client connected (total: ${getState().clients.size})`)

  // Hydrate the new client with current pattern immediately
  const current = getState().pattern
  ws.send(JSON.stringify({ type: 'pattern', code: current }))

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as Record<string, unknown>
      if (msg.type === 'state' && typeof msg.playing === 'boolean') {
        setPlaying(msg.playing)
      } else if (msg.type === 'error' && typeof msg.message === 'string') {
        setError(msg.message)
        console.error('[ws] browser error:', msg.message)
      } else if (msg.type === 'cleared') {
        clearError()
      }
    } catch {
      console.warn('[ws] received non-JSON message')
    }
  })

  ws.on('close', () => {
    removeClient(ws)
    console.log(`[ws] client disconnected (total: ${getState().clients.size})`)
  })

  ws.on('error', (err) => {
    console.error('[ws] socket error:', err)
    removeClient(ws)
  })
})

// ── Start ──────────────────────────────────────────────────────────────────────
const stopWatcher = startWatcher()

httpServer.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT}`)
  console.log(`[server] MCP endpoint: http://${HOST}:${PORT}/mcp`)
})

process.on('SIGINT', () => {
  stopWatcher()
  httpServer.close(() => process.exit(0))
})
process.on('SIGTERM', () => {
  stopWatcher()
  httpServer.close(() => process.exit(0))
})
