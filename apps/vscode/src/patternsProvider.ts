import * as vscode from 'vscode'
import type { ConductorClient } from './client'

export class PatternItem extends vscode.TreeItem {
  readonly contextValue = 'pattern'

  constructor(public readonly name: string) {
    super(name, vscode.TreeItemCollapsibleState.None)
    this.iconPath = new vscode.ThemeIcon('music')
    this.command = {
      command: 'conductor.loadPattern',
      title: 'Load Pattern',
      arguments: [name],
    }
  }
}

class MessageItem extends vscode.TreeItem {
  constructor(label: string, icon: string) {
    super(label, vscode.TreeItemCollapsibleState.None)
    this.iconPath = new vscode.ThemeIcon(icon)
    this.contextValue = 'message'
  }
}

export class PatternProvider implements vscode.TreeDataProvider<PatternItem | MessageItem> {
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<PatternItem | MessageItem | undefined | null | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  constructor(private readonly client: ConductorClient) {}

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: PatternItem | MessageItem): vscode.TreeItem {
    return element
  }

  async getChildren(): Promise<Array<PatternItem | MessageItem>> {
    if (!this.client.isConnected()) {
      return [new MessageItem('Daemon not running — start pnpm dev:server', 'circle-slash')]
    }
    try {
      const names = await this.client.listPatterns()
      if (!names.length) {
        return [new MessageItem('No saved patterns — use Conductor: Save Pattern', 'info')]
      }
      return names.sort().map((n) => new PatternItem(n))
    } catch {
      return [new MessageItem('Could not load patterns', 'warning')]
    }
  }
}
