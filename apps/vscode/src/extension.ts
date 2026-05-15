import * as vscode from 'vscode'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { ConductorClient } from './client'
import { PatternProvider, PatternItem } from './patternsProvider'
import { StrudelPanel } from './panel'
import type { WebviewInbound } from './panel'

let client: ConductorClient
let statusBar: vscode.StatusBarItem

function serverUrl(): string {
  return vscode.workspace.getConfiguration('conductor').get<string>('serverUrl', 'http://localhost:7777')
}

function renderStatusBar(): void {
  const s = client.getState()
  if (!client.isConnected()) {
    statusBar.text = '$(circle-slash) Conductor'
    statusBar.tooltip = `Cannot connect to ${serverUrl()}`
    statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
  } else if (s.error) {
    statusBar.text = '$(warning) Conductor'
    statusBar.tooltip = `Eval error: ${s.error}\n\nClick to stop`
    statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
  } else if (s.playing) {
    statusBar.text = '$(play) Conductor'
    statusBar.tooltip = 'Playing — click to stop'
    statusBar.backgroundColor = undefined
  } else {
    statusBar.text = '$(debug-pause) Conductor'
    statusBar.tooltip = 'Stopped — click to play'
    statusBar.backgroundColor = undefined
  }
}

// Messages from the Strudel webview → relay to daemon + update local state
function handleWebviewMessage(msg: WebviewInbound): void {
  client.send(msg)
  if (msg.type === 'state')   client.updateState({ playing: msg.playing })
  if (msg.type === 'error')   client.updateState({ error: msg.message })
  if (msg.type === 'cleared') client.updateState({ error: null })
  renderStatusBar()
}

export function activate(context: vscode.ExtensionContext): void {
  client = new ConductorClient(serverUrl())

  // ── Status bar ────────────────────────────────────────────────────────────
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  statusBar.command = 'conductor.togglePlay'
  statusBar.show()
  context.subscriptions.push(statusBar)

  // ── Pattern tree view ─────────────────────────────────────────────────────
  const patternProvider = new PatternProvider(client)
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('conductorPatterns', patternProvider)
  )

  // ── Daemon WS events → status bar + webview bridge ────────────────────────
  client.on('connected', () => {
    renderStatusBar()
    patternProvider.refresh()
    // Fetch authoritative state on (re)connect
    void client.fetchState().then(renderStatusBar).catch(() => {})
  })

  client.on('disconnected', renderStatusBar)

  client.on('message', (msg) => {
    // Forward broadcasts that the webview needs to act on
    if (msg.type === 'pattern' || msg.type === 'play' || msg.type === 'stop') {
      StrudelPanel.instance?.post(msg)
    }
    renderStatusBar()
  })

  renderStatusBar()

  // ── Commands ──────────────────────────────────────────────────────────────
  context.subscriptions.push(

    vscode.commands.registerCommand('conductor.openPanel', () => {
      StrudelPanel.createOrShow(context.extensionUri, handleWebviewMessage)
    }),

    vscode.commands.registerCommand('conductor.play', async () => {
      try {
        await client.play()
        client.updateState({ playing: true, error: null })
        renderStatusBar()
        // Ensure panel plays even when WS broadcast hasn't arrived yet
        StrudelPanel.instance?.post({ type: 'play' })
      } catch (err) {
        vscode.window.showErrorMessage(`Conductor: ${String(err)}`)
      }
    }),

    vscode.commands.registerCommand('conductor.stop', async () => {
      try {
        await client.stop()
        client.updateState({ playing: false })
        renderStatusBar()
        StrudelPanel.instance?.post({ type: 'stop' })
      } catch (err) {
        vscode.window.showErrorMessage(`Conductor: ${String(err)}`)
      }
    }),

    vscode.commands.registerCommand('conductor.togglePlay', async () => {
      await vscode.commands.executeCommand(
        client.getState().playing ? 'conductor.stop' : 'conductor.play'
      )
    }),

    vscode.commands.registerCommand('conductor.pushPattern', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) { vscode.window.showWarningMessage('Conductor: No active editor.'); return }
      const code = editor.document.getText().trim()
      if (!code) { vscode.window.showWarningMessage('Conductor: Active file is empty.'); return }
      try {
        await client.setPattern(code)
        // If panel isn't open, offer to open it
        if (!StrudelPanel.instance) {
          const choice = await vscode.window.showInformationMessage(
            'Conductor: Pattern pushed.', 'Open Panel'
          )
          if (choice === 'Open Panel') {
            StrudelPanel.createOrShow(context.extensionUri, handleWebviewMessage)
          }
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Conductor: ${String(err)}`)
      }
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
        if (!StrudelPanel.instance) {
          StrudelPanel.createOrShow(context.extensionUri, handleWebviewMessage)
        }
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
}

export function deactivate(): void {
  client?.dispose()
  StrudelPanel.instance?.dispose()
}
