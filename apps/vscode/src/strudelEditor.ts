import * as vscode from 'vscode'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomBytes } from 'node:crypto'

export type WebviewInbound =
  | { type: 'ready' }
  | { type: 'state'; playing: boolean }
  | { type: 'error'; message: string }
  | { type: 'cleared' }
  | { type: 'code_changed'; code: string }

export interface StrudelEditorHooks {
  onWebviewMessage: (msg: WebviewInbound) => void
  onDocumentActive: (document: vscode.TextDocument) => void
}

export class StrudelEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'conductor.strudelEditor'
  public static activePanel: vscode.WebviewPanel | undefined

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly hooks: StrudelEditorHooks,
  ) {}

  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
  ): void {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    }
    panel.webview.html = this.buildHtml(panel.webview)

    const name = path.basename(document.fileName, path.extname(document.fileName))
    const postPattern = () => {
      void panel.webview.postMessage({
        type: 'pattern',
        code: document.getText(),
        name,
      })
    }

    let suppressNextDocChange = false

    const docChangeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return
      if (suppressNextDocChange) {
        suppressNextDocChange = false
        return
      }
      postPattern()
    })

    // Save → re-evaluate. Typing in the codemirror only mirrors to the doc;
    // playback keeps the old pattern until save, which is how you avoid mid-edit
    // glitches.
    const saveSub = vscode.workspace.onDidSaveTextDocument((saved) => {
      if (saved.uri.toString() !== document.uri.toString()) return
      void panel.webview.postMessage({ type: 'evaluate' })
    })

    const msgSub = panel.webview.onDidReceiveMessage((msg: WebviewInbound) => {
      if (msg.type === 'ready') {
        postPattern()
        StrudelEditorProvider.activePanel = panel
        this.hooks.onDocumentActive(document)
        return
      }
      if (msg.type === 'code_changed') {
        if (msg.code === document.getText()) return
        suppressNextDocChange = true
        const edit = new vscode.WorkspaceEdit()
        edit.replace(
          document.uri,
          new vscode.Range(0, 0, document.lineCount, 0),
          msg.code,
        )
        void vscode.workspace.applyEdit(edit)
        return
      }
      this.hooks.onWebviewMessage(msg)
    })

    const viewStateSub = panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) {
        StrudelEditorProvider.activePanel = panel
        this.hooks.onDocumentActive(document)
      } else if (StrudelEditorProvider.activePanel === panel) {
        StrudelEditorProvider.activePanel = undefined
      }
    })

    panel.onDidDispose(() => {
      if (StrudelEditorProvider.activePanel === panel) {
        StrudelEditorProvider.activePanel = undefined
      }
      docChangeSub.dispose()
      saveSub.dispose()
      msgSub.dispose()
      viewStateSub.dispose()
    })
  }

  private buildHtml(webview: vscode.Webview): string {
    const strudelUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'strudel.js'),
    )
    const n = randomBytes(16).toString('hex')
    const templatePath = path.join(this.extensionUri.fsPath, 'media', 'index.html')
    return fs.readFileSync(templatePath, 'utf8')
      .replace(/\{\{NONCE\}\}/g, n)
      .replace('{{STRUDEL_URI}}', strudelUri.toString())
  }
}
