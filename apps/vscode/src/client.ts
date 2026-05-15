import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export type ServerState = {
  playing: boolean
  error: string | null
  connectedClients: number
}

export interface ConductorClient {
  on(event: 'connected',    listener: () => void): this
  on(event: 'disconnected', listener: () => void): this
  emit(event: 'connected'): boolean
  emit(event: 'disconnected'): boolean
}

export class ConductorClient extends EventEmitter {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  private connected = false
  private state: ServerState = { playing: false, error: null, connectedClients: 0 }
  private mcp: Client
  private mcpConnected: Promise<void>

  constructor(private baseUrl: string) {
    super()
    this.mcp = new Client({ name: 'conductor-vscode', version: '0.2.4' })
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`))
    this.mcpConnected = this.mcp.connect(transport).catch((err) => {
      console.error('[conductor] MCP connect failed:', err)
    })
    this.connectWs()
  }

  isConnected(): boolean { return this.connected }
  getState(): ServerState { return { ...this.state } }

  updateState(patch: Partial<ServerState>): void {
    this.state = { ...this.state, ...patch }
  }

  // Forward a raw message to the daemon (webview state/error/cleared events)
  send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  private wsUrl(): string {
    return this.baseUrl.replace(/^http/, 'ws')
  }

  private connectWs(): void {
    if (this.disposed) return
    try {
      const ws = new WebSocket(this.wsUrl())
      this.ws = ws
      ws.on('open', () => { this.connected = true; this.emit('connected') })
      ws.on('close', () => {
        this.connected = false
        this.ws = null
        this.emit('disconnected')
        this.scheduleReconnect()
      })
      ws.on('error', () => {
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
      this.connectWs()
    }, 3000)
  }

  private async call(name: string, args: Record<string, unknown> = {}): Promise<string> {
    await this.mcpConnected
    const res = await this.mcp.callTool({ name, arguments: args })
    const first = Array.isArray(res.content) ? res.content[0] : undefined
    if (!first || first.type !== 'text' || typeof first.text !== 'string') {
      throw new Error(`Empty MCP response for ${name}`)
    }
    return first.text
  }

  async fetchState(): Promise<ServerState> {
    const text = await this.call('get_state')
    const parsed = JSON.parse(text) as ServerState
    this.state = parsed
    return parsed
  }

  async listPatterns(): Promise<string[]> {
    const text = await this.call('list_patterns')
    return (JSON.parse(text) as { patterns: string[] }).patterns
  }

  async savePattern(name: string): Promise<void> { await this.call('save_pattern', { name }) }
  async deletePattern(name: string): Promise<void> { await this.call('delete_pattern', { name }) }
  async loadPattern(name: string): Promise<void> { await this.call('load_pattern', { name }) }
  async setPattern(code: string): Promise<void> { await this.call('set_pattern', { code }) }
  async play(): Promise<void> { await this.call('play') }
  async stop(): Promise<void> { await this.call('stop') }

  dispose(): void {
    this.disposed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
    void this.mcp.close().catch(() => { /* already gone */ })
    this.removeAllListeners()
  }
}
