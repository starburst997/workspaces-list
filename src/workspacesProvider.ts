import * as vscode from "vscode"
import { ClaudeCodeMonitor } from "./claudeCodeMonitor"
import { ConfigReader, WorkspaceConfig } from "./configReader"
import { IconRenderer } from "./iconRenderer"
import { MacOSWindowManager, WindowInfo } from "./macosWindowManager"

export enum ClaudeCodeStatus {
  Idle,
  Running,
  WaitingForInput,
}

export class WorkspaceItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly path: string,
    public readonly windowInfo: WindowInfo,
    public readonly context: vscode.ExtensionContext,
    public readonly config?: WorkspaceConfig,
    public readonly claudeStatus?: ClaudeCodeStatus,
    iconPath?:
      | vscode.ThemeIcon
      | vscode.Uri
      | { light: vscode.Uri; dark: vscode.Uri },
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode
      .TreeItemCollapsibleState.None,
  ) {
    super(label, collapsibleState)

    // Explicitly set iconPath (ensure it's never undefined)
    this.iconPath = iconPath || new vscode.ThemeIcon("folder")

    // Set resourceUri for decorations
    this.resourceUri = vscode.Uri.file(path)

    this.tooltip = `${path}\n${windowInfo.appName}`
    this.contextValue = "workspace"

    // Make items clickable
    this.command = {
      command: "workspacesList.focusWorkspace",
      title: "Focus Workspace",
      arguments: [this],
    }
  }
}

export class WorkspacesProvider
  implements vscode.TreeDataProvider<WorkspaceItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    WorkspaceItem | undefined | null | void
  > = new vscode.EventEmitter<WorkspaceItem | undefined | null | void>()
  readonly onDidChangeTreeData: vscode.Event<
    WorkspaceItem | undefined | null | void
  > = this._onDidChangeTreeData.event

  private workspaces: WorkspaceItem[] = []
  private windowManager: MacOSWindowManager
  private configReader: ConfigReader
  private iconRenderer: IconRenderer
  private claudeMonitor: ClaudeCodeMonitor
  private decorator: any // ClaudeCodeDecorator - using any to avoid circular import
  private monitoringInterval: NodeJS.Timeout | undefined
  private isWindowFocused: boolean = true
  private disposables: vscode.Disposable[] = []

  constructor(
    private context: vscode.ExtensionContext,
    decorator: any, // ClaudeCodeDecorator
  ) {
    this.windowManager = new MacOSWindowManager()
    this.configReader = new ConfigReader()
    this.iconRenderer = new IconRenderer()
    this.claudeMonitor = new ClaudeCodeMonitor()
    this.decorator = decorator

    // Don't load workspaces here - let extension.ts trigger initial refresh
    // this.loadWorkspaces()
    this.startMonitoring()
    this.setupFocusDetection()
  }

  async refresh(): Promise<void> {
    console.log("[WorkspacesList] Refresh triggered")
    await this.loadWorkspaces()
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: WorkspaceItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: WorkspaceItem): Thenable<WorkspaceItem[]> {
    if (element) {
      return Promise.resolve([])
    }
    return Promise.resolve(this.workspaces)
  }

  private async loadWorkspaces(): Promise<void> {
    console.log("[WorkspacesList] loadWorkspaces() called")
    try {
      const windows = await this.windowManager.getOpenWindows()
      console.log(`[WorkspacesList] Got ${windows.length} windows from manager`)

      this.workspaces = await Promise.all(
        windows.map(async (windowInfo) => {
          const name = this.windowManager.getWorkspaceName(windowInfo)
          const workspacePath =
            windowInfo.workspacePath || windowInfo.windowTitle
          console.log(
            `[WorkspacesList] Processing window: ${name} at ${workspacePath}`,
          )

          // Load config if available
          const config =
            (await this.configReader.readConfig(workspacePath)) || undefined

          // Get Claude Code status
          const claudeStatus = await this.claudeMonitor.getStatus(workspacePath)

          // Render icon
          const iconPath = await this.iconRenderer.renderIcon(
            config?.icon,
            workspacePath,
            this.context,
          )

          // Get display name (from config or default)
          const emojiPrefix = this.iconRenderer.getEmojiPrefix()
          const displayName = config?.displayName || name
          const label = emojiPrefix + displayName

          console.log(`[WorkspacesList] Created workspace item: ${label}`)

          return new WorkspaceItem(
            label,
            workspacePath,
            windowInfo,
            this.context,
            config,
            claudeStatus,
            iconPath,
          )
        }),
      )
      console.log(
        `[WorkspacesList] Total workspace items created: ${this.workspaces.length}`,
      )
    } catch (error: unknown) {
      console.error("[WorkspacesList] Failed to load workspaces:", error)
      this.workspaces = []
    }
  }

  async focusWorkspace(item: WorkspaceItem): Promise<void> {
    try {
      // Use VSCode's built-in command to switch to the workspace
      // This opens the folder in a new window or switches to existing window
      const uri = vscode.Uri.file(item.path)
      await vscode.commands.executeCommand("vscode.openFolder", uri, {
        forceReuseWindow: false,
      })
    } catch (error) {
      console.error("[WorkspacesList] Failed to focus workspace:", error)
      vscode.window.showErrorMessage(
        `Failed to switch to workspace: ${item.label}`,
      )
    }
  }

  /**
   * Start monitoring Claude Code status
   * Only monitors when window is focused (performance optimization)
   */
  private startMonitoring(): void {
    // Monitor every 5 seconds
    this.monitoringInterval = setInterval(async () => {
      if (!this.isWindowFocused) {
        return // Skip monitoring when window is not focused
      }

      await this.updateClaudeCodeStatus()
    }, 5000)
  }

  /**
   * Update Claude Code status for all workspaces
   */
  private async updateClaudeCodeStatus(): Promise<void> {
    const workspacePaths = this.workspaces.map((w) => w.path)
    if (workspacePaths.length > 0 && this.decorator) {
      await this.decorator.updateAllStatuses(workspacePaths)
    }
  }

  /**
   * Setup window focus detection
   */
  private setupFocusDetection(): void {
    // Check focus every 2 seconds
    const focusCheckInterval = setInterval(async () => {
      const focused = await this.windowManager.isCurrentWindowFocused()

      if (focused !== this.isWindowFocused) {
        this.isWindowFocused = focused

        // If window just gained focus, immediately update
        if (focused) {
          await this.updateClaudeCodeStatus()
        }
      }
    }, 2000)

    // Add to disposables for cleanup
    this.disposables.push({
      dispose: () => clearInterval(focusCheckInterval),
    })
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
    }

    this.claudeMonitor.dispose()

    for (const disposable of this.disposables) {
      disposable.dispose()
    }
  }
}
