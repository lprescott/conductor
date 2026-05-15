import type WebSocket from 'ws'
import { WebSocket as WsWebSocket } from 'ws'

export interface AppState {
  pattern: string
  playing: boolean
  error: string | null
  clients: Set<WebSocket>
}

const state: AppState = {
  pattern: "note('c3 e3 g3').s('piano')",
  playing: false,
  error: null,
  clients: new Set(),
}

type Listener = (s: AppState) => void
const listeners = new Set<Listener>()

function notify() {
  for (const l of listeners) l(state)
}

export function getState(): Readonly<AppState> {
  return state
}

export function setPattern(code: string): void {
  state.pattern = code
  notify()
}

export function setPlaying(playing: boolean): void {
  state.playing = playing
  notify()
}

export function setError(message: string): void {
  state.error = message
  notify()
}

export function clearError(): void {
  state.error = null
  notify()
}

export function addClient(ws: WebSocket): void {
  state.clients.add(ws)
}

export function removeClient(ws: WebSocket): void {
  state.clients.delete(ws)
}

export function broadcast(message: object): void {
  const text = JSON.stringify(message)
  for (const client of state.clients) {
    if (client.readyState === WsWebSocket.OPEN) {
      client.send(text)
    }
  }
}

export function subscribeToStateChanges(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Prevents the watcher from echoing back a write we just made
let suppressUntil = 0

export function suppressNextWatcherBroadcast(): void {
  suppressUntil = Date.now() + 500
}

export function shouldSuppressWatcherBroadcast(): boolean {
  return Date.now() < suppressUntil
}
