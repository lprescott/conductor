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

export class PatternProvider implements vscode.TreeDataProvider<PatternItem> {
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<PatternItem | undefined | null | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  constructor(private readonly client: ConductorClient) {}

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: PatternItem): vscode.TreeItem {
    return element
  }

  async getChildren(): Promise<PatternItem[]> {
    try {
      const names = await this.client.listPatterns()
      return names.sort().map((n) => new PatternItem(n))
    } catch {
      return []
    }
  }
}
