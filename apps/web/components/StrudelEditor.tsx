'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePatternSocket } from '../hooks/usePatternSocket'
import { ConnectionStatus } from './ConnectionStatus'
import { PatternPanel } from './PatternPanel'

import '@strudel/repl'

interface StrudelMirror {
  code: string
  setCode(code: string): void
  evaluate(autostart?: boolean): Promise<void>
  stop(): Promise<void>
  toggle(): Promise<void>
}

interface StrudelEditorElement extends HTMLElement {
  editor: StrudelMirror
}

const HISTORY_KEY = 'conductor:history'
const HISTORY_MAX = 50

type HistoryEntry = { code: string; ts: number; name?: string }

function pushHistory(code: string, name?: string): void {
  try {
    const prev: HistoryEntry[] = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    const next = [{ code, ts: Date.now(), name }, ...prev.filter(h => h.code !== code)].slice(0, HISTORY_MAX)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch { /* storage unavailable */ }
}

export function StrudelEditor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<StrudelMirror | null>(null)
  const sendRef = useRef<ReturnType<typeof usePatternSocket>['send'] | null>(null)

  // Holds a message that arrived before the editor was ready
  const pendingMessageRef = useRef<{ code: string; name?: string } | null>(null)

  // Serial evaluate queue — avoids concurrent editor.evaluate() calls
  const evalChainRef = useRef<Promise<void>>(Promise.resolve())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [evalError, setEvalError] = useState<string | null>(null)
  const [patternName, setPatternName] = useState<string | undefined>(undefined)
  const [showPanel, setShowPanel] = useState(false)

  // Stable evaluate wrapper that serializes calls and updates local state
  const enqueueEval = useCallback((code: string, name?: string) => {
    evalChainRef.current = evalChainRef.current.then(async () => {
      const editor = editorRef.current
      if (!editor) return
      editor.setCode(code)
      try {
        await editor.evaluate()
        setEvalError(null)
        setPatternName(name)
        sendRef.current?.({ type: 'cleared' })
        pushHistory(code, name)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setEvalError(message)
        sendRef.current?.({ type: 'error', message })
      }
    })
  }, [])

  const { status, send } = usePatternSocket({
    onMessage: useCallback((msg) => {
      if (msg.type === 'pattern') {
        if (!editorRef.current) {
          // Editor not ready yet — hold the last message; replayed on resolve
          pendingMessageRef.current = { code: msg.code, name: msg.name }
          return
        }
        enqueueEval(msg.code, msg.name)
      } else if (msg.type === 'play') {
        editorRef.current?.evaluate()
        setIsPlaying(true)
        sendRef.current?.({ type: 'state', playing: true })
      } else if (msg.type === 'stop') {
        editorRef.current?.stop()
        setIsPlaying(false)
        sendRef.current?.({ type: 'state', playing: false })
      }
    }, [enqueueEval]),
  })

  // Keep sendRef current so callbacks don't stale-close over send
  useEffect(() => { sendRef.current = send }, [send])

  // One-time mount: resolve editor, replay pending, wire onChange
  useEffect(() => {
    import('@strudel/webaudio')
      .then(({ initAudioOnFirstClick }) => { initAudioOnFirstClick() })
      .catch(() => {})

    customElements.whenDefined('strudel-editor').then(() => {
      const el = containerRef.current?.querySelector('strudel-editor') as StrudelEditorElement | null
      if (!el?.editor) return
      editorRef.current = el.editor

      // <strudel-editor> has no content; the real CodeMirror container is
      // inserted as its next sibling by connectedCallback. Hide the placeholder
      // and give the sibling absolute fill so it is visible and reachable.
      el.style.display = 'none'
      const sibling = el.nextElementSibling as HTMLElement | null
      if (sibling) {
        sibling.style.position = 'absolute'
        sibling.style.inset = '0'
      }

      // Replay any message that arrived before the editor was ready
      const pending = pendingMessageRef.current
      if (pending) {
        pendingMessageRef.current = null
        enqueueEval(pending.code, pending.name)
      }

      let lastCode = el.editor.code
      let debounceTimer: ReturnType<typeof setTimeout> | null = null
      const pollInterval = setInterval(() => {
        const code = el.editor.code
        if (code === lastCode) return
        lastCode = code
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          sendRef.current?.({ type: 'code_changed', code })
        }, 800)
      }, 1000)
      intervalRef.current = pollInterval
    })
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [enqueueEval])

  // Report initial play state once connected
  useEffect(() => {
    if (status === 'connected') send({ type: 'state', playing: false })
  }, [status, send])

  function handlePlay() {
    editorRef.current?.evaluate()
    setIsPlaying(true)
    send({ type: 'state', playing: true })
  }

  function handleStop() {
    editorRef.current?.stop()
    setIsPlaying(false)
    send({ type: 'state', playing: false })
  }

  function handleLoadPattern(code: string, name?: string) {
    enqueueEval(code, name)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#1a1a2e', color: '#e0e0e0', fontFamily: 'monospace' }}>

      {/* ── Header bar ─────────────────────────────────────────────── */}
      <div style={{
        padding: '0 12px',
        background: '#12122a',
        borderBottom: '1px solid #2a2a4a',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        height: 38,
        flexShrink: 0,
      }}>
        <ConnectionStatus status={status} />

        <div style={{ flex: 1 }} />

        {patternName && (
          <span style={{ fontSize: 11, color: '#888', letterSpacing: '0.05em' }}>
            {patternName}
          </span>
        )}

        {/* Transport */}
        <button
          onClick={isPlaying ? handleStop : handlePlay}
          style={{
            padding: '3px 14px',
            background: isPlaying ? '#c0392b' : '#27ae60',
            color: '#fff',
            border: 'none',
            borderRadius: 3,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'monospace',
            letterSpacing: '0.05em',
          }}
        >
          {isPlaying ? 'stop' : 'play'}
        </button>

        <button
          onClick={() => setShowPanel(p => !p)}
          style={{
            padding: '3px 10px',
            background: showPanel ? '#2a2a5a' : 'transparent',
            color: '#aaa',
            border: '1px solid #444',
            borderRadius: 3,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          patterns
        </button>
      </div>

      {/* ── Error bar ──────────────────────────────────────────────── */}
      {evalError && (
        <div style={{
          padding: '5px 14px',
          background: '#2d0a0a',
          borderBottom: '1px solid #7a1a1a',
          color: '#ff6b6b',
          fontSize: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'monospace' }}>{evalError}</span>
          <button
            onClick={() => setEvalError(null)}
            style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      {/* ── Editor + Panel ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <strudel-editor suppressHydrationWarning />
        </div>

        {showPanel && (
          <PatternPanel onLoad={handleLoadPattern} />
        )}
      </div>

    </div>
  )
}
