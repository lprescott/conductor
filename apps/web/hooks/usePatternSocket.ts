'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

export type ServerMessage =
  | { type: 'pattern'; code: string; name?: string }
  | { type: 'play' }
  | { type: 'stop' }

export type ClientMessage =
  | { type: 'state'; playing: boolean }
  | { type: 'error'; message: string }
  | { type: 'cleared' }
  | { type: 'code_changed'; code: string }

export type SocketStatus = 'connecting' | 'connected' | 'disconnected'

interface UsePatternSocketOptions {
  url?: string
  onMessage: (msg: ServerMessage) => void
}

export function usePatternSocket({ url = 'ws://localhost:7777', onMessage }: UsePatternSocketOptions) {
  const [status, setStatus] = useState<SocketStatus>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    let ws: WebSocket
    let destroyed = false
    let retryTimeout: ReturnType<typeof setTimeout>

    function connect() {
      if (destroyed) return
      setStatus('connecting')
      ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => { if (!destroyed) setStatus('connected') }

      ws.onclose = () => {
        if (!destroyed) {
          setStatus('disconnected')
          retryTimeout = setTimeout(connect, 2000)
        }
      }

      ws.onerror = () => { ws.close() }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as ServerMessage
          onMessageRef.current(msg)
        } catch {
          console.warn('[socket] received non-JSON message')
        }
      }
    }

    connect()

    return () => {
      destroyed = true
      clearTimeout(retryTimeout)
      ws?.close()
      wsRef.current = null
    }
  }, [url])

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  return { status, send }
}
