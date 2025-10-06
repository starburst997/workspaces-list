import * as vscode from 'vscode';
import { MacOSWindowManager, WindowInfo } from './macosWindowManager';
import { ConfigReader, WorkspaceConfig } from './configReader';
import { IconRenderer } from './iconRenderer';
import { ClaudeCodeMonitor } from './claudeCodeMonitor';

export enum ClaudeCodeStatus {
	Idle,
	Running,
	WaitingForInput
}

export class WorkspaceItem extends vscode.TreeItem {
	constructor(
		label: string,
		public readonly path: string,
		public readonly windowInfo: WindowInfo,
		public readonly context: vscode.ExtensionContext,
		public readonly config?: WorkspaceConfig,
		public readonly claudeStatus?: ClaudeCodeStatus,
		public readonly iconPath?: vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri },
		public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
	) {
		super(label, collapsibleState);

		this.tooltip = `${path}\n${windowInfo.appName}`;
		this.description = this.getDescription();
		this.contextValue = 'workspace';

		// Apply color if configured
		if (config?.color) {
			this.resourceUri = vscode.Uri.parse(`workspace:${path}`);
		}

		// Make items clickable
		this.command = {
			command: 'workspacesList.focusWorkspace',
			title: 'Focus Workspace',
			arguments: [this]
		};
	}

	private getDescription(): string {
		if (this.claudeStatus === ClaudeCodeStatus.WaitingForInput) {
			return '⚠️ Needs attention';
		}
		if (this.claudeStatus === ClaudeCodeStatus.Running) {
			return '🔄 Running';
		}
		if (this.claudeStatus === ClaudeCodeStatus.Idle) {
			return '✓ Idle';
		}
		return '';
	}
}

export class WorkspacesProvider implements vscode.TreeDataProvider<WorkspaceItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<WorkspaceItem | undefined | null | void> = new vscode.EventEmitter<WorkspaceItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<WorkspaceItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private workspaces: WorkspaceItem[] = [];
	private windowManager: MacOSWindowManager;
	private configReader: ConfigReader;
	private iconRenderer: IconRenderer;
	private claudeMonitor: ClaudeCodeMonitor;
	private monitoringInterval: NodeJS.Timeout | undefined;
	private isWindowFocused: boolean = true;
	private disposables: vscode.Disposable[] = [];

	constructor(private context: vscode.ExtensionContext) {
		this.windowManager = new MacOSWindowManager();
		this.configReader = new ConfigReader();
		this.iconRenderer = new IconRenderer();
		this.claudeMonitor = new ClaudeCodeMonitor();

		this.loadWorkspaces();
		this.startMonitoring();
		this.setupFocusDetection();
	}

	refresh(): void {
		this.loadWorkspaces();
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: WorkspaceItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: WorkspaceItem): Thenable<WorkspaceItem[]> {
		if (element) {
			return Promise.resolve([]);
		}
		return Promise.resolve(this.workspaces);
	}

	private async loadWorkspaces(): Promise<void> {
		try {
			const windows = await this.windowManager.getOpenWindows();

			this.workspaces = await Promise.all(
				windows.map(async (windowInfo) => {
					const name = this.windowManager.getWorkspaceName(windowInfo);
					const workspacePath = windowInfo.workspacePath || windowInfo.windowTitle;

					// Load config if available
					const config = await this.configReader.readConfig(workspacePath) || undefined;

					// Get Claude Code status
					const claudeStatus = await this.claudeMonitor.getStatus(workspacePath);

					// Render icon
					const iconPath = await this.iconRenderer.renderIcon(
						config?.icon,
						workspacePath,
						this.context
					);

					// Get display name (from config or default)
					const emojiPrefix = this.iconRenderer.getEmojiPrefix(config?.icon);
					const displayName = config?.displayName || name;
					const label = emojiPrefix + displayName;

					return new WorkspaceItem(
						label,
						workspacePath,
						windowInfo,
						this.context,
						config,
						claudeStatus,
						iconPath
					);
				})
			);
		} catch (error) {
			console.error('Failed to load workspaces:', error);
			this.workspaces = [];
		}
	}

	async focusWorkspace(item: WorkspaceItem): Promise<void> {
		const success = await this.windowManager.focusWindow(
			item.windowInfo.appName,
			item.windowInfo.windowIndex
		);

		if (!success) {
			vscode.window.showErrorMessage(`Failed to focus workspace: ${item.label}`);
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
				return; // Skip monitoring when window is not focused
			}

			await this.updateClaudeCodeStatus();
		}, 5000);
	}

	/**
	 * Update Claude Code status for all workspaces
	 */
	private async updateClaudeCodeStatus(): Promise<void> {
		let hasChanges = false;

		for (const workspace of this.workspaces) {
			const newStatus = await this.claudeMonitor.getStatus(workspace.path);

			if (newStatus !== workspace.claudeStatus) {
				hasChanges = true;
			}
		}

		if (hasChanges) {
			// Reload workspaces to update status
			await this.loadWorkspaces();
			this._onDidChangeTreeData.fire();
		}
	}

	/**
	 * Setup window focus detection
	 */
	private setupFocusDetection(): void {
		// Check focus every 2 seconds
		const focusCheckInterval = setInterval(async () => {
			const focused = await this.windowManager.isCurrentWindowFocused();

			if (focused !== this.isWindowFocused) {
				this.isWindowFocused = focused;

				// If window just gained focus, immediately update
				if (focused) {
					await this.updateClaudeCodeStatus();
				}
			}
		}, 2000);

		// Add to disposables for cleanup
		this.disposables.push({
			dispose: () => clearInterval(focusCheckInterval)
		});
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this.monitoringInterval) {
			clearInterval(this.monitoringInterval);
		}

		this.claudeMonitor.dispose();

		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}
