import http from 'node:http'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { WebSocketServer } from 'ws'
import type WebSocket from 'ws'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer } from './mcp.js'
import {
  addClient, removeClient, setPlaying, setError, clearError,
  getState, broadcast, setPattern, suppressNextWatcherBroadcast,
} from './state.js'
import { startWatcher, PATTERN_FILE, PATTERNS_DIR } from './watcher.js'

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

// ── HTTP server ────────────────────────────────────────────────────────────────
const httpServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id')

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  const url = req.url ?? '/'

  // ── Health ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET' && url === '/health') {
    const s = getState()
    json(res, 200, { status: 'ok', connectedClients: s.clients.size })
    return
  }

  // ── Patterns REST ───────────────────────────────────────────────────────────

  // GET /patterns — list saved pattern names
  if (req.method === 'GET' && url === '/patterns') {
    try {
      const files = await readdir(PATTERNS_DIR).catch(() => [] as string[])
      const names = files.filter(f => f.endsWith('.js')).map(f => f.slice(0, -3))
      json(res, 200, { patterns: names })
    } catch (err) {
      json(res, 500, { error: String(err) })
    }
    return
  }

  // GET /patterns/:name — get a saved pattern's code
  if (req.method === 'GET' && url.startsWith('/patterns/')) {
    const name = decodeURIComponent(url.slice('/patterns/'.length))
    const file = path.join(PATTERNS_DIR, `${name}.js`)
    try {
      const code = (await readFile(file, 'utf8')).trim()
      json(res, 200, { name, code })
    } catch {
      json(res, 404, { error: 'Pattern not found' })
    }
    return
  }

  // POST /patterns/load — load a saved pattern and broadcast to browser
  if (req.method === 'POST' && url === '/patterns/load') {
    const body = await parseBody(req) as Record<string, unknown> | undefined
    const name = typeof body?.name === 'string' ? body.name : null
    if (!name) { json(res, 400, { error: 'name required' }); return }
    const file = path.join(PATTERNS_DIR, `${name}.js`)
    try {
      const code = (await readFile(file, 'utf8')).trim()
      setPattern(code)
      clearError()
      suppressNextWatcherBroadcast()
      await writeFile(PATTERN_FILE, code, 'utf8')
      broadcast({ type: 'pattern', code, name })
      json(res, 200, { ok: true, name, code })
    } catch {
      json(res, 404, { error: 'Pattern not found' })
    }
    return
  }

  // ── MCP ─────────────────────────────────────────────────────────────────────
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

// ── WebSocket server ───────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws: WebSocket) => {
  addClient(ws)
  console.log(`[ws] client connected (total: ${getState().clients.size})`)

  // Hydrate the new client with the current pattern immediately
  ws.send(JSON.stringify({ type: 'pattern', code: getState().pattern }))

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
          console.error('[ws] browser eval error:', msg.message)
        }
        break
      case 'cleared':
        clearError()
        break
      case 'code_changed':
        // Browser editor was manually edited — sync state and persist to disk
        if (typeof msg.code === 'string' && msg.code.trim()) {
          setPattern(msg.code.trim())
          suppressNextWatcherBroadcast()
          await writeFile(PATTERN_FILE, msg.code.trim(), 'utf8').catch(err =>
            console.error('[ws] failed to persist code_changed:', err)
          )
        }
        break
    }
  } catch {
    console.warn('[ws] received non-JSON message')
  }
}

// ── Start ──────────────────────────────────────────────────────────────────────
const stopWatcher = startWatcher()

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

process.on('SIGINT', () => { stopWatcher(); httpServer.close(() => process.exit(0)) })
process.on('SIGTERM', () => { stopWatcher(); httpServer.close(() => process.exit(0)) })
