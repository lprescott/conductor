'use client'

import { useEffect, useState, useCallback } from 'react'

const HISTORY_KEY = 'conductor:history'
const SERVER = 'http://localhost:7777'

type HistoryEntry = { code: string; ts: number; name?: string }

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

interface PatternPanelProps {
  onLoad: (code: string, name?: string) => void
}

export function PatternPanel({ onLoad }: PatternPanelProps) {
  const [tab, setTab] = useState<'library' | 'history'>('library')
  const [library, setLibrary] = useState<string[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(false)

  const fetchLibrary = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${SERVER}/patterns`)
      const data = await res.json() as { patterns: string[] }
      setLibrary(data.patterns)
    } catch {
      setLibrary([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLibrary()
    try {
      const h: HistoryEntry[] = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
      setHistory(h)
    } catch {
      setHistory([])
    }
  }, [fetchLibrary])

  async function loadFromLibrary(name: string) {
    try {
      const res = await fetch(`${SERVER}/patterns/${encodeURIComponent(name)}`)
      const data = await res.json() as { code: string }
      onLoad(data.code, name)
    } catch (err) {
      console.error('[panel] failed to load pattern:', err)
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 12px',
    background: active ? '#1a1a2e' : 'transparent',
    color: active ? '#e0e0e0' : '#666',
    border: 'none',
    borderBottom: active ? '2px solid #5b7cf7' : '2px solid transparent',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'monospace',
  })

  const rowStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderBottom: '1px solid #1e1e3a',
    cursor: 'pointer',
    fontSize: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  }

  return (
    <div style={{
      width: 220,
      background: '#12122a',
      borderLeft: '1px solid #2a2a4a',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #2a2a4a', flexShrink: 0 }}>
        <button style={tabStyle(tab === 'library')} onClick={() => { setTab('library'); fetchLibrary() }}>
          library
        </button>
        <button style={tabStyle(tab === 'history')} onClick={() => setTab('history')}>
          history
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'library' && (
          loading ? (
            <div style={{ padding: 12, color: '#555', fontSize: 12 }}>loading…</div>
          ) : library.length === 0 ? (
            <div style={{ padding: 12, color: '#555', fontSize: 12 }}>
              No saved patterns yet.{'\n'}Use save_pattern from your AI IDE.
            </div>
          ) : library.map(name => (
            <div
              key={name}
              style={rowStyle}
              onClick={() => loadFromLibrary(name)}
              onMouseEnter={e => (e.currentTarget.style.background = '#1e1e3e')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: '#c0c0e0' }}>{name}</span>
            </div>
          ))
        )}

        {tab === 'history' && (
          history.length === 0 ? (
            <div style={{ padding: 12, color: '#555', fontSize: 12 }}>
              History appears after patterns are evaluated.
            </div>
          ) : history.map((entry, i) => (
            <div
              key={i}
              style={rowStyle}
              onClick={() => onLoad(entry.code, entry.name)}
              onMouseEnter={e => (e.currentTarget.style.background = '#1e1e3e')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: '#888', fontSize: 10 }}>{timeAgo(entry.ts)}{entry.name ? ` · ${entry.name}` : ''}</span>
              <span style={{ color: '#9a9ac0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.code.split('\n')[0]}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
