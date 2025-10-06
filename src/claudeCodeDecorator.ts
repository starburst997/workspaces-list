import * as vscode from "vscode"
import { ClaudeCodeMonitor } from "./claudeCodeMonitor"
import { ClaudeCodeStatus } from "./types"

export class ClaudeCodeDecorator implements vscode.FileDecorationProvider {
  private _onDidChangeFileDecorations: vscode.EventEmitter<
    vscode.Uri | vscode.Uri[]
  > = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>()
  readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[]> =
    this._onDidChangeFileDecorations.event

  private statusCache = new Map<string, ClaudeCodeStatus | undefined>()
  private claudeMonitor: ClaudeCodeMonitor

  constructor() {
    this.claudeMonitor = new ClaudeCodeMonitor()
  }

  provideFileDecoration(
    uri: vscode.Uri,
  ): vscode.ProviderResult<vscode.FileDecoration> {
    const workspacePath = uri.fsPath
    const status = this.statusCache.get(workspacePath)

    if (status === ClaudeCodeStatus.WaitingForInput) {
      return {
        badge: "⚠️",
        tooltip: "Claude Code: Waiting for Input",
      }
    }
    if (status === ClaudeCodeStatus.Running) {
      return {
        badge: "▶",
        tooltip: "Claude Code: Running",
      }
    }
    if (status === ClaudeCodeStatus.Idle) {
      return {
        badge: "⏸",
        tooltip: "Claude Code: Idle",
      }
    }
    // No Claude Code session
    return {
      badge: "○",
      tooltip: "Claude Code: No Session",
    }
  }

  async updateStatus(workspacePath: string): Promise<void> {
    const status = await this.claudeMonitor.getStatus(workspacePath)
    const oldStatus = this.statusCache.get(workspacePath)

    if (status !== oldStatus) {
      this.statusCache.set(workspacePath, status)
      // Trigger decoration update
      this._onDidChangeFileDecorations.fire(vscode.Uri.file(workspacePath))
    }
  }

  async updateAllStatuses(workspacePaths: string[]): Promise<void> {
    await Promise.all(workspacePaths.map((path) => this.updateStatus(path)))
    // Fire event for all changed paths
    const changedUris = workspacePaths.map((path) => vscode.Uri.file(path))
    this._onDidChangeFileDecorations.fire(changedUris)
  }

  dispose(): void {
    this.claudeMonitor.dispose()
    this._onDidChangeFileDecorations.dispose()
  }
}
