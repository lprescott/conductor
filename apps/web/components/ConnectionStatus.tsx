'use client'

import type { SocketStatus } from '../hooks/usePatternSocket'

const STATUS_COLORS: Record<SocketStatus, string> = {
  connecting: '#f0a500',
  connected: '#4caf50',
  disconnected: '#f44336',
}

const STATUS_LABELS: Record<SocketStatus, string> = {
  connected: 'daemon connected',
  connecting: 'connecting...',
  disconnected: 'daemon disconnected — run: pnpm dev:server',
}

export function ConnectionStatus({ status }: { status: SocketStatus }) {
  return (
    <div
      style={{
        padding: '6px 14px',
        background: '#12122a',
        borderBottom: '1px solid #2a2a4a',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        fontFamily: 'monospace',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: STATUS_COLORS[status],
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      <span style={{ color: STATUS_COLORS[status] }}>{STATUS_LABELS[status]}</span>
    </div>
  )
}
