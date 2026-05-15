import * as vscode from 'vscode'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { ConductorClient } from './client'
import { PatternProvider, PatternItem } from './patternsProvider'
import { StrudelEditorProvider } from './strudelEditor'
import type { WebviewInbound } from './strudelEditor'

let client: ConductorClient
let statusBar: vscode.StatusBarItem
let daemonProcess: ChildProcess | undefined

function probeDaemon(baseUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`${baseUrl}/health`, { timeout: 500 }, (res) => {
      res.resume()
      resolve((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 500)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

async function ensureDaemonRunning(context: vscode.ExtensionContext): Promise<void> {
  const baseUrl = serverUrl()
  if (await probeDaemon(baseUrl)) return

  const bundled = path.join(context.extensionPath, 'media', 'daemon.cjs')
  if (!fs.existsSync(bundled)) return // dev install — user runs pnpm dev:server

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  const patternsDir = workspaceFolder
    ? path.join(workspaceFolder.uri.fsPath, 'patterns')
    : path.join(context.globalStorageUri.fsPath, 'patterns')

  const output = vscode.window.createOutputChannel('Conductor Daemon')
  context.subscriptions.push(output)

  daemonProcess = spawn(process.execPath, [bundled], {
    env: { ...process.env, CONDUCTOR_PATTERNS_DIR: patternsDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  daemonProcess.stdout?.on('data', (b: Buffer) => output.append(b.toString()))
  daemonProcess.stderr?.on('data', (b: Buffer) => output.append(b.toString()))
  daemonProcess.on('exit', (code) => {
    output.appendLine(`[conductor] daemon exited (${code})`)
    daemonProcess = undefined
  })
  context.subscriptions.push({ dispose: () => { daemonProcess?.kill() } })

  for (let i = 0; i < 30; i++) {
    if (await probeDaemon(baseUrl)) return
    await new Promise((r) => setTimeout(r, 100))
  }
  output.appendLine('[conductor] daemon did not respond within 3s')
}

function serverUrl(): string {
  return vscode.workspace.getConfiguration('conductor').get<string>('serverUrl', 'http://localhost:7777')
}

function renderStatusBar(): void {
  const s = client.getState()
  if (!client.isConnected()) {
    statusBar.text = '$(circle-slash) Conductor'
    statusBar.tooltip = `Daemon offline at ${serverUrl()}\n\nClick to start it`
    statusBar.command = 'conductor.startDaemon'
    statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
    return
  }
  statusBar.command = 'conductor.togglePlay'
  statusBar.backgroundColor = undefined
  if (s.error) {
    statusBar.text = '$(warning) Conductor'
    statusBar.tooltip = `Eval error: ${s.error}\n\nClick to stop`
    statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
  } else if (s.playing) {
    statusBar.text = '$(play) Conductor'
    statusBar.tooltip = 'Playing — click to stop'
  } else {
    statusBar.text = '$(debug-pause) Conductor'
    statusBar.tooltip = 'Stopped — click to play'
  }
}

function handleWebviewMessage(msg: WebviewInbound): void {
  client.send(msg)
  if (msg.type === 'state')   client.updateState({ playing: msg.playing })
  if (msg.type === 'error')   client.updateState({ error: msg.message })
  if (msg.type === 'cleared') client.updateState({ error: null })
  renderStatusBar()
}

function postToActivePanel(message: object): void {
  void StrudelEditorProvider.activePanel?.webview.postMessage(message)
}

async function ensureSongsDir(folder: vscode.Uri): Promise<vscode.Uri> {
  const songs = vscode.Uri.joinPath(folder, 'songs')
  try { await vscode.workspace.fs.createDirectory(songs) } catch { /* exists */ }
  return songs
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await ensureDaemonRunning(context)
  client = new ConductorClient(serverUrl())

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  statusBar.show()
  context.subscriptions.push(statusBar)

  const patternProvider = new PatternProvider(client)
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('conductorPatterns', patternProvider)
  )

  const pushDocToDaemon = async (doc: vscode.TextDocument): Promise<void> => {
    const code = doc.getText().trim()
    if (!code) return
    try {
      await client.setPattern(code)
    } catch { /* daemon offline — status bar already reflects */ }
    renderStatusBar()
  }

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      StrudelEditorProvider.viewType,
      new StrudelEditorProvider(context.extensionUri, {
        onWebviewMessage: handleWebviewMessage,
        onDocumentActive: (doc) => { void pushDocToDaemon(doc) },
        onDocumentSaved: (doc) => { void pushDocToDaemon(doc) },
      }),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  )

  client.on('connected', () => {
    renderStatusBar()
    patternProvider.refresh()
    void client.fetchState().then(renderStatusBar).catch(() => {})
  })
  client.on('disconnected', renderStatusBar)

  renderStatusBar()

  // First-launch offline nudge — once per session, only if a .strudel file is in play.
  let offlineNudgeShown = false
  const maybeOfflineNudge = () => {
    if (offlineNudgeShown || client.isConnected()) return
    offlineNudgeShown = true
    void vscode.window.showWarningMessage(
      'Conductor daemon is offline. The .strudel editor works locally, but MCP and pattern sync need it running.',
      'Start Daemon', 'Dismiss',
    ).then((choice) => {
      if (choice === 'Start Daemon') vscode.commands.executeCommand('conductor.startDaemon')
    })
  }

  context.subscriptions.push(

    vscode.commands.registerCommand('conductor.play', async () => {
      postToActivePanel({ type: 'play' })
      try { await client.play() } catch { /* daemon offline is fine — webview plays locally */ }
      client.updateState({ playing: true, error: null })
      renderStatusBar()
    }),

    vscode.commands.registerCommand('conductor.stop', async () => {
      postToActivePanel({ type: 'stop' })
      try { await client.stop() } catch { /* same */ }
      client.updateState({ playing: false })
      renderStatusBar()
    }),

    vscode.commands.registerCommand('conductor.togglePlay', async () => {
      await vscode.commands.executeCommand(
        client.getState().playing ? 'conductor.stop' : 'conductor.play'
      )
    }),

    vscode.commands.registerCommand('conductor.newSong', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0]
      if (!folder) {
        vscode.window.showWarningMessage('Conductor: No workspace folder open.')
        return
      }
      const name = await vscode.window.showInputBox({
        prompt: 'Song name (without .strudel)',
        placeHolder: 'my-groove',
        validateInput: (v) => /^[a-z0-9][a-z0-9\-_]*$/i.test(v.trim()) ? undefined : 'Use letters, numbers, hyphens, underscores',
      })
      if (!name) return

      const songs = await ensureSongsDir(folder.uri)
      const fileUri = vscode.Uri.joinPath(songs, `${name.trim()}.strudel`)
      const starter = [
        '// ' + name.trim(),
        'stack(',
        '  sound("bd*4").gain(0.85),',
        '  sound("~ sd ~ sd").gain(0.6),',
        '  sound("hh*8").gain(0.3),',
        '  note("<c2 c2 ab1 g1>*2").s("sawtooth").lpf(400).gain(0.7),',
        ').cpm(90)',
      ].join('\n') + '\n'

      try {
        await vscode.workspace.fs.stat(fileUri)
        const overwrite = await vscode.window.showWarningMessage(
          `${name.trim()}.strudel already exists. Overwrite?`, { modal: true }, 'Overwrite'
        )
        if (overwrite !== 'Overwrite') return
      } catch { /* good — file does not exist */ }

      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(starter, 'utf8'))
      await vscode.commands.executeCommand('vscode.openWith', fileUri, StrudelEditorProvider.viewType)
    }),

    vscode.commands.registerCommand('conductor.startDaemon', async () => {
      await ensureDaemonRunning(context)
      renderStatusBar()
    }),

    vscode.commands.registerCommand('conductor.savePattern', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Pattern name',
        placeHolder: 'my-groove',
        validateInput: (v) => v.trim() ? undefined : 'Name cannot be empty',
      })
      if (!name) return
      try {
        await client.savePattern(name.trim())
        patternProvider.refresh()
        vscode.window.showInformationMessage(`Conductor: Saved "${name.trim()}".`)
      } catch (err) {
        vscode.window.showErrorMessage(`Conductor: ${String(err)}`)
      }
    }),

    vscode.commands.registerCommand('conductor.loadPattern', async (arg?: string | PatternItem) => {
      let name: string | undefined
      if (typeof arg === 'string') {
        name = arg
      } else if (arg instanceof PatternItem) {
        name = arg.name
      } else {
        try {
          const patterns = await client.listPatterns()
          if (!patterns.length) { vscode.window.showInformationMessage('No saved patterns.'); return }
          name = await vscode.window.showQuickPick(patterns.sort(), { placeHolder: 'Select a pattern' })
        } catch (err) {
          vscode.window.showErrorMessage(`Conductor: ${String(err)}`); return
        }
      }
      if (!name) return
      try {
        await client.loadPattern(name)
      } catch (err) {
        vscode.window.showErrorMessage(`Conductor: ${String(err)}`)
      }
    }),

    vscode.commands.registerCommand('conductor.deletePattern', async (arg?: PatternItem) => {
      const name = arg?.name ?? await vscode.window.showInputBox({ prompt: 'Pattern name to delete' })
      if (!name) return
      const confirm = await vscode.window.showWarningMessage(
        `Delete pattern "${name}"?`, { modal: true }, 'Delete'
      )
      if (confirm !== 'Delete') return
      try {
        await client.deletePattern(name)
        patternProvider.refresh()
      } catch (err) {
        vscode.window.showErrorMessage(`Conductor: ${String(err)}`)
      }
    }),

    vscode.commands.registerCommand('conductor.refreshPatterns', () => patternProvider.refresh()),

    vscode.commands.registerCommand('conductor.initMcp', async () => {
      const folders = vscode.workspace.workspaceFolders
      if (!folders?.length) {
        vscode.window.showWarningMessage('Conductor: No workspace folder open.')
        return
      }
      const mcpPath = path.join(folders[0].uri.fsPath, '.mcp.json')
      const content = JSON.stringify(
        { mcpServers: { conductor: { type: 'http', url: `${serverUrl()}/mcp` } } },
        null, 2
      ) + '\n'
      try {
        if (fs.existsSync(mcpPath)) {
          const overwrite = await vscode.window.showWarningMessage(
            '.mcp.json already exists. Overwrite?', { modal: true }, 'Overwrite'
          )
          if (overwrite !== 'Overwrite') return
        }
        fs.writeFileSync(mcpPath, content, 'utf8')
        const doc = await vscode.workspace.openTextDocument(mcpPath)
        await vscode.window.showTextDocument(doc)
        vscode.window.showInformationMessage(
          'Conductor: .mcp.json created. Reload your AI IDE to activate.'
        )
      } catch (err) {
        vscode.window.showErrorMessage(`Conductor: ${String(err)}`)
      }
    }),

  )

  // Nudge after a short delay so we don't flash during the initial WS connect attempt.
  setTimeout(maybeOfflineNudge, 2500)
}

export function deactivate(): void {
  client?.dispose()
  daemonProcess?.kill()
}
