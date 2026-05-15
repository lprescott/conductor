import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { randomBytes } from 'node:crypto'

export type WebviewInbound =
  | { type: 'state'; playing: boolean }
  | { type: 'error'; message: string }
  | { type: 'cleared' }
  | { type: 'code_changed'; code: string }

export class StrudelPanel {
  static instance: StrudelPanel | undefined

  private readonly panel: vscode.WebviewPanel
  private disposables: vscode.Disposable[] = []

  static createOrShow(
    extensionUri: vscode.Uri,
    onMessage: (msg: WebviewInbound) => void
  ): StrudelPanel {
    const col = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One

    if (StrudelPanel.instance) {
      StrudelPanel.instance.panel.reveal(col)
      return StrudelPanel.instance
    }

    const panel = vscode.window.createWebviewPanel(
      'conductorStrudel',
      'Conductor',
      col,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      }
    )

    StrudelPanel.instance = new StrudelPanel(panel, extensionUri, onMessage)
    return StrudelPanel.instance
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    onMessage: (msg: WebviewInbound) => void
  ) {
    this.panel = panel
    this.panel.webview.html = this.buildHtml(extensionUri)
    this.panel.webview.onDidReceiveMessage(onMessage, undefined, this.disposables)
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables)
  }

  post(message: object): void {
    void this.panel.webview.postMessage(message)
  }

  private buildHtml(extensionUri: vscode.Uri): string {
    const strudelUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'strudel.js')
    )
    const n = randomBytes(16).toString('hex')
    const templatePath = path.join(extensionUri.fsPath, 'media', 'index.html')
    return fs.readFileSync(templatePath, 'utf8')
      .replace(/\{\{NONCE\}\}/g, n)
      .replace('{{STRUDEL_URI}}', strudelUri.toString())
  }

  dispose(): void {
    StrudelPanel.instance = undefined
    this.panel.dispose()
    for (const d of this.disposables) d.dispose()
    this.disposables = []
  }
}
