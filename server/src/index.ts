import http from 'node:http'
import net from 'node:net'
import { writeFileSync, renameSync } from 'node:fs'
import { WebSocketServer } from 'ws'
import type WebSocket from 'ws'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer } from './mcp.js'
import {
  addClient, removeClient, setPlaying, setError, clearError, getState,
} from './state.js'

const PREFERRED_PORT = Number(process.env.PORT) || 7777
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

// Daemon binds to 127.0.0.1 only, so the realistic attackers are pages that
// the user has open in a browser. Allow MCP clients running on the same
// machine (no Origin header, or http(s)://localhost / 127.0.0.1) and the
// VS Code webview iframe (origin: vscode-webview://*). Reject everything else.
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin || origin === 'null') return true
  try {
    const u = new URL(origin)
    if (u.protocol === 'vscode-webview:') return true
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true
    return false
  } catch { return false }
}

const httpServer = http.createServer(async (req, res) => {
  const origin = req.headers.origin
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin ?? '*')
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id')

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

function writePortFile(port: number): void {
  const target = process.env.CONDUCTOR_PORT_FILE
  if (!target) return
  const tmp = `${target}.tmp`
  try {
    writeFileSync(tmp, String(port))
    renameSync(tmp, target)
  } catch (err) {
    console.error('[server] failed to write port file:', err)
  }
}

httpServer.on('listening', () => {
  const addr = httpServer.address()
  const port = typeof addr === 'object' && addr ? addr.port : PREFERRED_PORT
  console.log(`[server] listening on http://${HOST}:${port}`)
  console.log(`[server] MCP endpoint: http://${HOST}:${port}/mcp`)
  writePortFile(port)
})

httpServer.on('error', (err) => {
  console.error('[server] runtime error:', err)
})

// Probe with a throwaway socket to decide preferred vs ephemeral. There's a
// TOCTOU race against another process grabbing the port between probe and
// bind, but in practice the daemon is the only thing aiming at PREFERRED_PORT.
function probePortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer()
    tester.once('error', () => resolve(false))
    tester.once('listening', () => tester.close(() => resolve(true)))
    tester.listen(port, HOST)
  })
}

void (async () => {
  const free = await probePortFree(PREFERRED_PORT)
  if (!free) console.warn(`[server] port ${PREFERRED_PORT} in use, falling back to ephemeral`)
  httpServer.listen(free ? PREFERRED_PORT : 0, HOST)
})()

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

// Exit when our parent closes stdin. The extension host pipes stdin to us
// and never writes to it; when the host dies (gracefully or not), the OS
// closes the pipe and we get 'end' immediately — no PID poll, no race.
if (process.env.CONDUCTOR_PARENT_STDIN === '1') {
  process.stdin.on('end', () => shutdown('parent-stdin-closed'))
  process.stdin.resume()
}
