import * as vscode from "vscode"
import { ClaudeCodeMonitor } from "./claudeCodeMonitor"
import { ClaudeCodeStatus, ClaudeCodeStatusInfo } from "./types"

const DEBUG = false // Enable debug logging - set to true for debugging

function log(...args: unknown[]): void {
  if (!DEBUG) {
    return
  }
  console.log("[ClaudeCodeDecorator]", ...args)
}

export class ClaudeCodeDecorator implements vscode.FileDecorationProvider {
  private _onDidChangeFileDecorations: vscode.EventEmitter<
    vscode.Uri | vscode.Uri[]
  > = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>()
  readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[]> =
    this._onDidChangeFileDecorations.event

  private statusCache = new Map<string, ClaudeCodeStatusInfo | undefined>()
  private claudeMonitor: ClaudeCodeMonitor
  private acknowledgedTimestamps = new Map<string, number>() // Track acknowledged message timestamps
  private uriCache = new Map<string, vscode.Uri[]>() // Track all URIs for each workspace path

  constructor() {
    this.claudeMonitor = ClaudeCodeMonitor.getInstance()
    // Note: Process monitoring is started/stopped by workspacesProvider based on focus
  }

  provideFileDecoration(
    uri: vscode.Uri,
  ): vscode.ProviderResult<vscode.FileDecoration> {
    log(
      `provideFileDecoration called for URI: ${uri.toString()}, scheme: ${uri.scheme}, path: ${uri.fsPath}`,
    )

    // Only provide decorations for our custom scheme
    if (uri.scheme !== "workspace-list") {
      log(`Wrong scheme: ${uri.scheme}, expected: workspace-list`)
      return undefined
    }

    const workspacePath = uri.fsPath

    // Cache this URI for later use when firing change events
    if (!this.uriCache.has(workspacePath)) {
      this.uriCache.set(workspacePath, [])
    }
    const cachedUris = this.uriCache.get(workspacePath)!
    if (!cachedUris.some((u) => u.toString() === uri.toString())) {
      cachedUris.push(uri)
      log(`Cached URI for ${workspacePath}: ${uri.toString()}`)
    }

    const statusInfo = this.statusCache.get(workspacePath)

    if (!statusInfo) {
      log(`No status info for ${workspacePath}`)
      return undefined
    }

    let status = statusInfo.status

    // Check if user has acknowledged this message timestamp
    const acknowledgedTime = this.acknowledgedTimestamps.get(workspacePath)
    if (
      acknowledgedTime &&
      statusInfo.lastMessageTime &&
      statusInfo.lastMessageTime <= acknowledgedTime
    ) {
      // User has seen this message, show Running instead of RecentlyFinished or Executing
      if (
        status === ClaudeCodeStatus.RecentlyFinished ||
        status === ClaudeCodeStatus.Executing
      ) {
        log(
          `Message acknowledged for ${workspacePath}, showing Running instead of ${ClaudeCodeStatus[status]}`,
        )
        status = ClaudeCodeStatus.Running
      }
    }

    log(
      `Providing decoration for ${workspacePath}: ${ClaudeCodeStatus[status]} (enum value: ${status})`,
    )

    if (status === ClaudeCodeStatus.WaitingForInput) {
      const decoration = {
        badge: "⚠️",
        tooltip: `Claude Code: Waiting for Input (${statusInfo.conversationCount || 0} session${(statusInfo.conversationCount || 0) > 1 ? "s" : ""})`,
        color: new vscode.ThemeColor("errorForeground"),
      }
      log(`Returning WaitingForInput decoration:`, decoration)
      return decoration
    }

    if (status === ClaudeCodeStatus.Executing) {
      const decoration = {
        badge: "▶",
        tooltip: `Claude Code: Executing Task (${statusInfo.conversationCount || 0} session${(statusInfo.conversationCount || 0) > 1 ? "s" : ""})`,
        color: new vscode.ThemeColor("workspacesList.claudeOrange"),
      }
      log(`Returning Executing decoration:`, decoration)
      return decoration
    }

    if (status === ClaudeCodeStatus.RecentlyFinished) {
      // Calculate gradient color based on time (0-30 minutes)
      const minutesAgo = statusInfo.lastMessageTime
        ? Math.round((Date.now() - statusInfo.lastMessageTime) / 1000 / 60)
        : 0

      // Calculate gradient color from green to blue over 30 minutes
      const gradientColor = this.calculateGradientColor(
        statusInfo.lastMessageTime,
      )

      // Use a simpler badge character that VSCode can render
      const decoration = {
        badge: "◉",
        tooltip: `Claude Code: Task Finished ${minutesAgo}m ago (${statusInfo.conversationCount || 0} session${(statusInfo.conversationCount || 0) > 1 ? "s" : ""})`,
        color: gradientColor,
      }
      log(`Returning RecentlyFinished decoration:`, decoration)
      return decoration
    }

    if (status === ClaudeCodeStatus.Running) {
      const decoration = {
        badge: "●",
        tooltip: `Claude Code: Running (idle) (${statusInfo.conversationCount || 0} session${(statusInfo.conversationCount || 0) > 1 ? "s" : ""})`,
        color: new vscode.ThemeColor("terminal.ansiBlue"),
      }
      log(`Returning Running decoration:`, decoration)
      return decoration
    }

    if (status === ClaudeCodeStatus.NotRunning) {
      const decoration = {
        badge: "○",
        tooltip: `Claude Code: Not Running (${statusInfo.conversationCount || 0} session${(statusInfo.conversationCount || 0) > 1 ? "s" : ""})`,
        color: new vscode.ThemeColor("descriptionForeground"),
      }
      log(`Returning NotRunning decoration:`, decoration)
      return decoration
    }

    // NoSession - show nothing
    log(`NoSession status - returning undefined (no badge)`)
    return undefined
  }

  /**
   * Calculate gradient color for recently finished tasks
   * Returns color that smoothly transitions from green to blue over 30 minutes
   * Uses predefined theme colors for smooth gradient steps
   */
  private calculateGradientColor(lastMessageTime?: number): vscode.ThemeColor {
    if (!lastMessageTime) {
      return new vscode.ThemeColor("workspacesList.gradientGreen")
    }

    const minutesAgo = (Date.now() - lastMessageTime) / 1000 / 60
    const maxMinutes = 30

    // Clamp between 0 and maxMinutes
    const clamped = Math.max(0, Math.min(minutesAgo, maxMinutes))

    // Calculate transition progress (0.0 at 0 min, 1.0 at 30 min)
    const progress = clamped / maxMinutes

    // Map to gradient color steps (7 steps for smooth transition)
    if (progress < 0.14) {
      // 0-4.2 min: green
      return new vscode.ThemeColor("workspacesList.gradientGreen")
    } else if (progress < 0.28) {
      // 4.2-8.4 min: cyan 1
      return new vscode.ThemeColor("workspacesList.gradientCyan1")
    } else if (progress < 0.43) {
      // 8.4-12.9 min: cyan 2
      return new vscode.ThemeColor("workspacesList.gradientCyan2")
    } else if (progress < 0.57) {
      // 12.9-17.1 min: cyan 3
      return new vscode.ThemeColor("workspacesList.gradientCyan3")
    } else if (progress < 0.71) {
      // 17.1-21.3 min: blue 1
      return new vscode.ThemeColor("workspacesList.gradientBlue1")
    } else if (progress < 0.86) {
      // 21.3-25.8 min: blue 2
      return new vscode.ThemeColor("workspacesList.gradientBlue2")
    } else {
      // 25.8-30 min: blue 3
      return new vscode.ThemeColor("workspacesList.gradientBlue3")
    }
  }

  /**
   * Mark a workspace as acknowledged - user has seen the current message
   */
  markAsAcknowledged(workspacePath: string): void {
    const statusInfo = this.statusCache.get(workspacePath)
    if (statusInfo?.lastMessageTime) {
      log(
        `Acknowledging message for ${workspacePath} at timestamp ${statusInfo.lastMessageTime}`,
      )
      this.acknowledgedTimestamps.set(workspacePath, statusInfo.lastMessageTime)

      // Force immediate refresh of decoration using cached URIs
      const cachedUris = this.uriCache.get(workspacePath) || []
      if (cachedUris.length > 0) {
        this._onDidChangeFileDecorations.fire(cachedUris)
      } else {
        // Fallback if no cached URI
        this._onDidChangeFileDecorations.fire(
          vscode.Uri.from({ scheme: "workspace-list", path: workspacePath }),
        )
      }

      // Also trigger an immediate status update to ensure consistency
      setTimeout(() => this.updateStatus(workspacePath), 100)
    }
  }

  /**
   * Update status and clear acknowledgment if there's a new message
   */
  async updateStatus(workspacePath: string): Promise<boolean> {
    log(`Updating status for ${workspacePath}`)
    const status = await this.claudeMonitor.getStatus(workspacePath)
    const oldStatus = this.statusCache.get(workspacePath)

    log(`Status for ${workspacePath}:`, status)

    // If there's a new message (newer timestamp), clear the acknowledgment
    const acknowledgedTime = this.acknowledgedTimestamps.get(workspacePath)
    if (
      acknowledgedTime &&
      status?.lastMessageTime &&
      status.lastMessageTime > acknowledgedTime
    ) {
      log(`New message detected for ${workspacePath}, clearing acknowledgment`)
      this.acknowledgedTimestamps.delete(workspacePath)
    }

    // Compare status objects
    const statusChanged =
      !oldStatus ||
      oldStatus.status !== status?.status ||
      oldStatus.lastMessageTime !== status?.lastMessageTime

    if (statusChanged) {
      log(`Status changed for ${workspacePath}, updating decoration`)
      this.statusCache.set(workspacePath, status)
      // Trigger decoration update using cached URIs
      const cachedUris = this.uriCache.get(workspacePath) || []
      if (cachedUris.length > 0) {
        log(
          `Firing change for ${cachedUris.length} cached URI(s) for ${workspacePath}`,
        )
        this._onDidChangeFileDecorations.fire(cachedUris)
      } else {
        // Fallback if no cached URI
        log(`No cached URIs for ${workspacePath}, using fallback`)
        this._onDidChangeFileDecorations.fire(
          vscode.Uri.from({ scheme: "workspace-list", path: workspacePath }),
        )
      }
      return true // Status changed
    }
    return false // No change
  }

  async updateAllStatuses(workspacePaths: string[]): Promise<string[]> {
    log(`Updating statuses for ${workspacePaths.length} workspaces`)

    // Update all statuses in parallel and track which ones changed
    const results = await Promise.all(
      workspacePaths.map(async (path) => ({
        path,
        changed: await this.updateStatus(path),
      })),
    )

    // Return paths that actually changed
    const changedPaths = results.filter((r) => r.changed).map((r) => r.path)

    if (changedPaths.length > 0) {
      log(`${changedPaths.length} workspace(s) had status changes`)

      // Also fire a batch update for all changed URIs
      const allChangedUris: vscode.Uri[] = []
      for (const path of changedPaths) {
        const cachedUris = this.uriCache.get(path) || []
        if (cachedUris.length > 0) {
          allChangedUris.push(...cachedUris)
        } else {
          allChangedUris.push(
            vscode.Uri.from({ scheme: "workspace-list", path }),
          )
        }
      }

      if (allChangedUris.length > 0) {
        log(`Firing batch change for ${allChangedUris.length} URI(s)`)
        this._onDidChangeFileDecorations.fire(allChangedUris)
      }
    } else {
      log(`No status changes detected`)
    }

    return changedPaths
  }

  dispose(): void {
    this.claudeMonitor.dispose()
    this._onDidChangeFileDecorations.dispose()
  }
}
