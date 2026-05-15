import http from 'node:http'
import { WebSocketServer } from 'ws'
import type WebSocket from 'ws'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer } from './mcp.js'
import {
  addClient, removeClient, setPlaying, setError, clearError, getState,
} from './state.js'

const PORT = Number(process.env.PORT) || 7777
const HOST = '127.0.0.1'

function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
      catch { resolve(undefined) }
    })
    req.on('error', reject)
  })
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const httpServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id')

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  const url = req.url ?? '/'

  if (req.method === 'GET' && url === '/health') {
    const s = getState()
    json(res, 200, { status: 'ok', connectedClients: s.clients.size })
    return
  }

  if (url === '/mcp') {
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
      if (!res.headersSent) { res.writeHead(500); res.end('Internal Server Error') }
    }
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws: WebSocket) => {
  addClient(ws)
  console.log(`[ws] client connected (total: ${getState().clients.size})`)

  ws.on('message', (raw) => {
    void handleWsMessage(raw.toString())
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

async function handleWsMessage(raw: string): Promise<void> {
  try {
    const msg = JSON.parse(raw) as Record<string, unknown>
    switch (msg.type) {
      case 'state':
        if (typeof msg.playing === 'boolean') setPlaying(msg.playing)
        break
      case 'error':
        if (typeof msg.message === 'string') {
          setError(msg.message)
          console.error('[ws] eval error:', msg.message)
        }
        break
      case 'cleared':
        clearError()
        break
    }
  } catch {
    console.warn('[ws] received non-JSON message')
  }
}

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] port ${PORT} already in use — kill the old process with:\n  fuser -k ${PORT}/tcp`)
    process.exit(1)
  }
  throw err
})

httpServer.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT}`)
  console.log(`[server] MCP endpoint: http://${HOST}:${PORT}/mcp`)
})

// Keep the daemon alive on unexpected errors — the MCP client expects a long-lived process.
process.on('uncaughtException', (err) => console.error('[uncaught]', err))
process.on('unhandledRejection', (reason) => console.error('[unhandled rejection]', reason))

const shutdown = (signal: string) => {
  console.log(`[server] ${signal} received, shutting down`)
  httpServer.close(() => process.exit(0))
  // Force exit if close hangs on lingering WS connections
  setTimeout(() => process.exit(0), 1000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// Exit when the parent extension host dies. The harness around us (VS Code's
// extension host) sometimes goes down with SIGKILL, which never reaches our
// SIGTERM handler; without this poll the daemon orphans and holds :7777.
const parentPid = Number(process.env.CONDUCTOR_PARENT_PID)
if (parentPid > 0) {
  setInterval(() => {
    try { process.kill(parentPid, 0) }
    catch { shutdown('parent-exit') }
  }, 1000).unref()
}
