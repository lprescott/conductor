import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { readFile, writeFile, readdir, unlink, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { getState, setPattern, setPlaying, broadcast, broadcastExcept, clearError, suppressNextWatcherBroadcast } from './state.js'
import { PATTERN_FILE, PATTERNS_DIR } from './watcher.js'

async function ensurePatternsDir(): Promise<void> {
  await mkdir(PATTERNS_DIR, { recursive: true })
}

export function patternPath(name: string): string {
  const safe = name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
  if (!safe) throw new Error('Invalid pattern name')
  return path.join(PATTERNS_DIR, `${safe}.js`)
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'conductor',
    version: '0.1.0',
  })

  server.registerTool(
    'get_pattern',
    { description: 'Returns the current Strudel pattern code playing in the browser.' },
    async () => ({
      content: [{ type: 'text', text: JSON.stringify({ code: getState().pattern }) }],
    })
  )

  server.registerTool(
    'set_pattern',
    {
      description: 'Sets a new Strudel pattern. The browser updates live and music changes instantly. Also writes to pattern.js.',
      inputSchema: { code: z.string().min(1).describe('Valid Strudel pattern code') },
    },
    async ({ code }) => {
      setPattern(code)
      clearError()
      broadcast({ type: 'pattern', code })
      suppressNextWatcherBroadcast()
      try {
        await writeFile(PATTERN_FILE, code, 'utf8')
      } catch (err) {
        console.error('[mcp] failed to write pattern.js:', err)
      }
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] }
    }
  )

  server.registerTool(
    'get_state',
    { description: 'Returns current playback state: whether audio is playing, any eval error, and browser client count.' },
    async () => {
      const s = getState()
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              playing: s.playing,
              error: s.error,
              connectedClients: s.clients.size,
            }),
          },
        ],
      }
    }
  )

  server.registerTool(
    'play',
    { description: 'Starts Strudel playback in the browser.' },
    async () => {
      setPlaying(true)
      broadcast({ type: 'play' })
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] }
    }
  )

  server.registerTool(
    'stop',
    { description: 'Stops Strudel playback in the browser.' },
    async () => {
      setPlaying(false)
      broadcast({ type: 'stop' })
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] }
    }
  )

  server.registerTool(
    'save_pattern',
    {
      description: 'Saves the current pattern (or provided code) to the patterns/ library under a given name.',
      inputSchema: {
        name: z.string().min(1).describe('Pattern name, e.g. "groovy-bass"'),
        code: z.string().optional().describe('Code to save; omit to save current pattern'),
      },
    },
    async ({ name, code }) => {
      await ensurePatternsDir()
      const toSave = code ?? getState().pattern
      await writeFile(patternPath(name), toSave, 'utf8')
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, name }) }] }
    }
  )

  server.registerTool(
    'list_patterns',
    { description: 'Lists all saved patterns in the patterns/ library.' },
    async () => {
      await ensurePatternsDir()
      let files: string[] = []
      try {
        files = await readdir(PATTERNS_DIR)
      } catch {
        files = []
      }
      const names = files.filter(f => f.endsWith('.js')).map(f => f.slice(0, -3))
      return { content: [{ type: 'text', text: JSON.stringify({ patterns: names }) }] }
    }
  )

  server.registerTool(
    'load_pattern',
    {
      description: 'Loads a saved pattern by name, sets it as active, and broadcasts to the browser.',
      inputSchema: { name: z.string().min(1).describe('Name of the saved pattern to load') },
    },
    async ({ name }) => {
      const code = (await readFile(patternPath(name), 'utf8')).trim()
      setPattern(code)
      clearError()
      suppressNextWatcherBroadcast()
      await writeFile(PATTERN_FILE, code, 'utf8')
      broadcast({ type: 'pattern', code, name })
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, name, code }) }] }
    }
  )

  server.registerTool(
    'delete_pattern',
    {
      description: 'Deletes a saved pattern from the patterns/ library.',
      inputSchema: { name: z.string().min(1) },
    },
    async ({ name }) => {
      await unlink(patternPath(name))
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] }
    }
  )

  server.registerTool(
    'get_strudel_docs',
    { description: 'Returns a curated Strudel API reference so the AI can write valid patterns without guessing.' },
    async () => ({ content: [{ type: 'text', text: STRUDEL_DOCS }] })
  )

  return server
}

const STRUDEL_DOCS = `
# Strudel Quick Reference

## Pattern constructors
- note("c3 e3 g3")          — MIDI note names or numbers; letters+octave
- sound("bd sd hh")         — sample name sequences
- s("piano")                — alias for sound()
- n("0 2 4")                — numeric note index
- freq("440 550 660")       — raw frequency in Hz

## Transformations
- .fast(2)                  — double the speed
- .slow(4)                  — quarter speed
- .rev()                    — reverse
- .every(4, x => x.fast(2))— every 4 cycles apply transform
- .off(0.25, x => x.fast(2)) — offset copy with transform (note: .up() is not available)

## Effects
- .gain(0.8)                — volume multiplier
- .lpf(800)                 — low-pass filter cutoff Hz
- .hpf(200)                 — high-pass filter cutoff Hz
- .delay(0.5)               — delay wet amount
- .room(0.5)                — reverb room size
- .pan(0)                   — stereo pan (-1 left, 1 right)
- .vowel("a e i")           — formant filter

## Stacking and mini-notation
- stack(pat1, pat2)         — layer patterns simultaneously
- cat(pat1, pat2)           — play patterns sequentially, one per cycle
- "bd [sd sd] hh*2"         — mini-notation: [] = group, *N = repeat
- "c3 [e3 g3]"              — nested groups

## Instruments / synths
- .s("piano")               — Salamander piano samples
- .s("bd") / .s("sd")       — basic drum samples
- .synth()                  — default synth
- .fm()                     — FM synth
- .supersaw()               — supersaw wave

## Arpeggios / chords
- chord("C:major")          — chord name
- arpeggio(chord("C:major")) — arpeggio of a chord

## Mini-notation reference
- "a b c d"    — four equal steps per cycle
- "a*2"        — repeat a twice
- "a/2"        — stretch a over 2 cycles
- "[a b]"      — group (one step between them)
- "<a b>"      — alternate each cycle
- "a!3"        — replicate: a a a
- "a@2"        — weight: a lasts twice as long

## Example patterns
note("c3 e3 g3 b3").s("piano").slow(2)
stack(sound("bd*2"), sound("~ sd"), note("c2 g2").s("bass"))
note("<c3 e3 g3>*4").s("piano").fast(1.5).room(0.4)
`
