'use client'

import { useEffect, useRef } from 'react'
import { usePatternSocket } from '../hooks/usePatternSocket'
import { ConnectionStatus } from './ConnectionStatus'

// Registers <strudel-editor> as a side effect — must be client-only
import '@strudel/repl'


interface StrudelMirror {
  setCode(code: string): void
  evaluate(): Promise<void>
  start(): void
  stop(): void
}

interface StrudelEditorElement extends HTMLElement {
  editor: StrudelMirror
}

export function StrudelEditor() {
  const containerRef = useRef<HTMLDivElement>(null)
  // Resolved once after customElements.whenDefined resolves
  const editorRef = useRef<StrudelMirror | null>(null)
  const audioInitRef = useRef(false)

  useEffect(() => {
    // initAudioOnFirstClick is a side effect registered by @strudel/webaudio on import;
    // importing @strudel/repl pulls it in transitively, but calling it explicitly is safer
    import('@strudel/webaudio').then(({ initAudioOnFirstClick }) => {
      if (!audioInitRef.current) {
        audioInitRef.current = true
        initAudioOnFirstClick()
      }
    }).catch(() => {/* webaudio not available */})

    // Resolve editor ref once element upgrades — .editor is not available synchronously
    customElements.whenDefined('strudel-editor').then(() => {
      const el = containerRef.current?.querySelector('strudel-editor') as StrudelEditorElement | null
      if (el?.editor) {
        editorRef.current = el.editor
      }
    })
  }, [])

  const { status, send } = usePatternSocket({
    onMessage: async (msg) => {
      const editor = editorRef.current
      if (!editor) {
        console.warn('[conductor] editor not ready, dropping message:', msg.type)
        return
      }

      if (msg.type === 'pattern') {
        try {
          editor.setCode(msg.code)
          await editor.evaluate()
          send({ type: 'cleared' })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          send({ type: 'error', message })
        }
      } else if (msg.type === 'play') {
        editor.start()
        send({ type: 'state', playing: true })
      } else if (msg.type === 'stop') {
        editor.stop()
        send({ type: 'state', playing: false })
      }
    },
  })

  // Report initial play state once connected
  useEffect(() => {
    if (status === 'connected') {
      send({ type: 'state', playing: false })
    }
  }, [status, send])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#1a1a2e' }}>
      <ConnectionStatus status={status} />
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }}>
        <strudel-editor suppressHydrationWarning style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
    </div>
  )
}
