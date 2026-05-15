import http from 'node:http'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ConductorClient } from './client'

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void

let server: http.Server
let baseUrl: string
let currentHandler: Handler = (_req, res) => { res.writeHead(500); res.end() }

function sseBody(data: unknown): string {
  return `event: message\ndata: ${JSON.stringify(data)}\n\n`
}

function mcpResult(text: string, id = 1) {
  return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } }
}

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = http.createServer((req, res) => currentHandler(req, res))
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number }
        baseUrl = `http://127.0.0.1:${addr.port}`
        resolve()
      })
    })
)

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

describe('ConductorClient — MCP HTTP', () => {
  it('fetchState parses server state', async () => {
    currentHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.end(sseBody(mcpResult(JSON.stringify({ playing: true, error: null, connectedClients: 2 }))))
    }
    // Use a non-WS URL so the WS connection attempt just fails silently
    const c = new ConductorClient(baseUrl)
    const state = await c.fetchState()
    expect(state).toEqual({ playing: true, error: null, connectedClients: 2 })
    c.dispose()
  })

  it('fetchState surfaces eval errors', async () => {
    currentHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.end(sseBody(mcpResult(JSON.stringify({ playing: false, error: 'SyntaxError: boom', connectedClients: 1 }))))
    }
    const c = new ConductorClient(baseUrl)
    const state = await c.fetchState()
    expect(state.error).toBe('SyntaxError: boom')
    c.dispose()
  })

  it('setPattern sends the correct tool name and code', async () => {
    let body = ''
    currentHandler = (req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        body = Buffer.concat(chunks).toString()
        res.writeHead(200)
        res.end(sseBody(mcpResult('{"ok":true}')))
      })
    }
    const c = new ConductorClient(baseUrl)
    await c.setPattern("note('c3')")
    const parsed = JSON.parse(body)
    expect(parsed.params.name).toBe('set_pattern')
    expect(parsed.params.arguments.code).toBe("note('c3')")
    c.dispose()
  })

  it('listPatterns returns the pattern array', async () => {
    currentHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.end(sseBody(mcpResult(JSON.stringify({ patterns: ['a', 'b', 'c'] }))))
    }
    const c = new ConductorClient(baseUrl)
    const patterns = await c.listPatterns()
    expect(patterns).toEqual(['a', 'b', 'c'])
    c.dispose()
  })

  it('rejects on connection refused', async () => {
    const c = new ConductorClient('http://127.0.0.1:1')
    await expect(c.fetchState()).rejects.toThrow()
    c.dispose()
  })

  it('rejects when response has no data line', async () => {
    currentHandler = (_req, res) => { res.writeHead(200); res.end('event: message\n\n') }
    const c = new ConductorClient(baseUrl)
    await expect(c.fetchState()).rejects.toThrow('No data line')
    c.dispose()
  })
})

describe('ConductorClient — local state', () => {
  it('updateState patches state without overwriting other fields', () => {
    const c = new ConductorClient(baseUrl)
    c.updateState({ playing: true })
    expect(c.getState().playing).toBe(true)
    expect(c.getState().error).toBeNull()
    c.dispose()
  })

  it('isConnected starts false when daemon is not reachable', () => {
    const c = new ConductorClient('http://127.0.0.1:1')
    expect(c.isConnected()).toBe(false)
    c.dispose()
  })
})
