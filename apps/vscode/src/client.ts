import http from 'node:http'
import { EventEmitter } from 'node:events'
import WebSocket from 'ws'

export type ServerState = {
  playing: boolean
  error: string | null
  connectedClients: number
}

export type ServerMessage =
  | { type: 'pattern'; code: string; name?: string }
  | { type: 'play' }
  | { type: 'stop' }
  | { type: 'state'; playing: boolean }
  | { type: 'error'; message: string }
  | { type: 'cleared' }

type McpResponse = {
  result?: { content?: Array<{ type: string; text?: string }> }
  jsonrpc: string
  id: number
}

// Declaration merging for typed EventEmitter events
export interface ConductorClient {
  on(event: 'connected',    listener: () => void): this
  on(event: 'disconnected', listener: () => void): this
  on(event: 'message',      listener: (msg: ServerMessage) => void): this
  emit(event: 'connected'): boolean
  emit(event: 'disconnected'): boolean
  emit(event: 'message', msg: ServerMessage): boolean
}

export class ConductorClient extends EventEmitter {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  private connected = false
  private state: ServerState = { playing: false, error: null, connectedClients: 0 }

  constructor(private baseUrl: string) {
    super()
    this.connect()
  }

  isConnected(): boolean { return this.connected }
  getState(): ServerState { return { ...this.state } }

  updateState(patch: Partial<ServerState>): void {
    this.state = { ...this.state, ...patch }
  }

  // Forward a raw message to the daemon (e.g. webview → daemon relay)
  send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  private wsUrl(): string {
    return this.baseUrl.replace(/^http/, 'ws')
  }

  private connect(): void {
    if (this.disposed) return
    try {
      const ws = new WebSocket(this.wsUrl())
      this.ws = ws

      ws.on('open', () => {
        this.connected = true
        this.emit('connected')
      })

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as ServerMessage
          this.applyMessage(msg)
          this.emit('message', msg)
        } catch { /* ignore malformed */ }
      })

      ws.on('close', () => {
        this.connected = false
        this.ws = null
        this.emit('disconnected')
        this.scheduleReconnect()
      })

      ws.on('error', () => {
        // 'close' fires after 'error'; handle reconnect there
        this.connected = false
        this.emit('disconnected')
      })
    } catch {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 3000)
  }

  private applyMessage(msg: ServerMessage): void {
    if (msg.type === 'play')    this.state = { ...this.state, playing: true }
    if (msg.type === 'stop')    this.state = { ...this.state, playing: false }
    if (msg.type === 'state')   this.state = { ...this.state, playing: msg.playing }
    if (msg.type === 'error')   this.state = { ...this.state, error: msg.message }
    if (msg.type === 'cleared') this.state = { ...this.state, error: null }
  }

  // ── HTTP MCP calls ──────────────────────────────────────────────────────────

  private async callMcp(tool: string, args: Record<string, unknown> = {}): Promise<McpResponse> {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: tool, arguments: args },
    })

    return new Promise((resolve, reject) => {
      const url = new URL('/mcp', this.baseUrl)
      const req = http.request(
        {
          hostname: url.hostname,
          port: Number(url.port) || 80,
          path: '/mcp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            Accept: 'application/json, text/event-stream',
          },
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString()
            const dataLine = text.split('\n').find((l) => l.startsWith('data: '))
            if (!dataLine) { reject(new Error('No data line in MCP response')); return }
            try { resolve(JSON.parse(dataLine.slice(6)) as McpResponse) }
            catch { reject(new Error('Failed to parse MCP response')) }
          })
        }
      )
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('Request timed out')) })
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  }

  private mcpText(res: McpResponse): string {
    const text = res?.result?.content?.[0]?.text
    if (!text) throw new Error('Empty MCP response')
    return text
  }

  async fetchState(): Promise<ServerState> {
    const res = await this.callMcp('get_state')
    const parsed = JSON.parse(this.mcpText(res)) as ServerState
    this.state = parsed
    return parsed
  }

  async listPatterns(): Promise<string[]> {
    const res = await this.callMcp('list_patterns')
    return (JSON.parse(this.mcpText(res)) as { patterns: string[] }).patterns
  }

  async savePattern(name: string): Promise<void> {
    await this.callMcp('save_pattern', { name })
  }

  async deletePattern(name: string): Promise<void> {
    await this.callMcp('delete_pattern', { name })
  }

  async loadPattern(name: string): Promise<void> {
    await this.callMcp('load_pattern', { name })
  }

  async setPattern(code: string): Promise<void> {
    await this.callMcp('set_pattern', { code })
  }

  async play(): Promise<void> {
    await this.callMcp('play')
  }

  async stop(): Promise<void> {
    await this.callMcp('stop')
  }

  dispose(): void {
    this.disposed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
    this.removeAllListeners()
  }
}
