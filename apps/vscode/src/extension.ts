import * as vscode from 'vscode'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { ConductorClient } from './client'
import { PatternProvider, PatternItem } from './patternsProvider'
import { StrudelPanel } from './panel'
import type { WebviewInbound } from './panel'

let client: ConductorClient
let statusBar: vscode.StatusBarItem

let currentPatternName: string | undefined
let lastPushedUri: vscode.Uri | undefined
let lastPatternMessage: { type: 'pattern'; code: string; name?: string } | undefined

function serverUrl(): string {
  return vscode.workspace.getConfiguration('conductor').get<string>('serverUrl', 'http://localhost:7777')
}

function syncPanelState(): void {
  const s = client.getState()
  StrudelPanel.instance?.post({
    type: 'ui_state',
    playing: s.playing,
    connected: client.isConnected(),
    patternName: currentPatternName,
    error: s.error,
  })
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
  syncPanelState()
}

function handleWebviewMessage(msg: WebviewInbound): void {
  if (msg.type === 'ready') {
    syncPanelState()
    if (lastPatternMessage) StrudelPanel.instance?.post(lastPatternMessage)
    void client.fetchState().then(() => syncPanelState()).catch(() => {})
    return
  }
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

  // ── Daemon WS events ──────────────────────────────────────────────────────
  client.on('connected', () => {
    renderStatusBar()
    patternProvider.refresh()
    void client.fetchState().then(renderStatusBar).catch(() => {})
  })

  client.on('disconnected', renderStatusBar)

  client.on('message', (msg) => {
    if (msg.type === 'pattern') {
      if (msg.name) currentPatternName = msg.name
      lastPatternMessage = msg
      StrudelPanel.instance?.post(msg)
    } else if (msg.type === 'play' || msg.type === 'stop') {
      StrudelPanel.instance?.post(msg)
    }
    renderStatusBar()
  })

  renderStatusBar()

  // ── Auto-push on save of last-pushed file ─────────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (!lastPushedUri) return
      if (doc.uri.toString() !== lastPushedUri.toString()) return
      const code = doc.getText().trim()
      if (!code) return
      try {
        await client.setPattern(code)
      } catch { /* status bar already shows disconnected */ }
    })
  )

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
        currentPatternName = path.basename(editor.document.fileName, path.extname(editor.document.fileName))
        await client.setPattern(code)
        lastPushedUri = editor.document.uri
        StrudelPanel.createOrShow(context.extensionUri, handleWebviewMessage)
      } catch (err) {
        vscode.window.showErrorMessage(`Conductor: ${String(err)}`)
      }
    }),

    vscode.commands.registerCommand('conductor.newPattern', async () => {
      const folders = vscode.workspace.workspaceFolders
      if (!folders?.length) {
        vscode.window.showWarningMessage('Conductor: No workspace folder open.')
        return
      }
      const name = await vscode.window.showInputBox({
        prompt: 'Pattern file name (without .js)',
        placeHolder: 'my-groove',
        validateInput: (v) => /^[a-z0-9][a-z0-9\-_]*$/i.test(v.trim()) ? undefined : 'Use letters, numbers, hyphens, underscores',
      })
      if (!name) return

      const fileUri = vscode.Uri.joinPath(folders[0].uri, `${name.trim()}.js`)
      const starter = [
        'stack(',
        '  sound("bd*4, ~ sd ~ sd").gain(0.8),',
        '  sound("hh*8").gain(0.3)',
        ')',
      ].join('\n') + '\n'

      try {
        await vscode.workspace.fs.stat(fileUri)
        const overwrite = await vscode.window.showWarningMessage(
          `${name.trim()}.js already exists. Overwrite?`, { modal: true }, 'Overwrite'
        )
        if (overwrite !== 'Overwrite') return
      } catch { /* file does not exist — good */ }

      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(starter, 'utf8'))
      const doc = await vscode.workspace.openTextDocument(fileUri)
      await vscode.window.showTextDocument(doc, { preview: false })
      currentPatternName = name.trim()
      await client.setPattern(starter.trim())
      lastPushedUri = fileUri
      StrudelPanel.createOrShow(context.extensionUri, handleWebviewMessage)
    }),

    vscode.commands.registerCommand('conductor.openPatternFile', async () => {
      const configured = vscode.workspace.getConfiguration('conductor').get<string>('patternFile', '')
      let fileUri: vscode.Uri | undefined

      if (configured) {
        fileUri = vscode.Uri.file(configured)
      } else {
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
          const candidate = vscode.Uri.joinPath(folder.uri, 'pattern.js')
          try {
            await vscode.workspace.fs.stat(candidate)
            fileUri = candidate
            break
          } catch { /* not found in this folder */ }
        }
      }

      if (!fileUri) {
        vscode.window.showWarningMessage(
          'Conductor: pattern.js not found in workspace. Set conductor.patternFile in settings.'
        )
        return
      }

      const doc = await vscode.workspace.openTextDocument(fileUri)
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false })
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
        currentPatternName = name
        StrudelPanel.createOrShow(context.extensionUri, handleWebviewMessage)
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
