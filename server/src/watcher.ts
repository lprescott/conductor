import chokidar from 'chokidar'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setPattern, broadcast } from './state.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// server/src → server → monorepo root
const PATTERN_FILE = path.resolve(__dirname, '../..', 'pattern.js')

export function startWatcher(): () => void {
  const watcher = chokidar.watch(PATTERN_FILE, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  })

  watcher.on('add', async () => {
    try {
      const code = (await readFile(PATTERN_FILE, 'utf8')).trim()
      setPattern(code)
      console.log('[watcher] pattern.js loaded')
    } catch {
      // file may not exist yet
    }
  })

  watcher.on('change', async () => {
    try {
      const code = (await readFile(PATTERN_FILE, 'utf8')).trim()
      setPattern(code)
      broadcast({ type: 'pattern', code })
      console.log('[watcher] pattern.js changed, broadcasting')
    } catch (err) {
      console.error('[watcher] failed to read pattern.js:', err)
    }
  })

  console.log(`[watcher] watching ${PATTERN_FILE}`)

  return () => { void watcher.close() }
}
