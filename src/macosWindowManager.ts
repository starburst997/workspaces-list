import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

export interface WindowInfo {
	appName: string;
	windowTitle: string;
	windowIndex: number;
	windowId?: string;
	workspacePath?: string;
}

export class MacOSWindowManager {
	/**
	 * Get all open Cursor/VSCode windows by reading workspace storage
	 * from the main Cursor process
	 */
	async getOpenWindows(): Promise<WindowInfo[]> {
		console.log('[WorkspacesList] Starting window detection...');

		try {
			// Find main Cursor process
			const { stdout: psOut } = await execAsync(
				'ps aux | grep "Cursor.app/Contents/MacOS/Cursor" | grep -v grep | grep -v Helper'
			);
			const lines = psOut.trim().split('\n');

			if (lines.length === 0) {
				console.log('[WorkspacesList] Main Cursor process not found');
				return [];
			}

			// Extract PID
			const pidMatch = lines[0].match(/^\S+\s+(\d+)/);
			if (!pidMatch) {
				console.log('[WorkspacesList] Could not extract PID');
				return [];
			}

			const mainPid = pidMatch[1];
			console.log(`[WorkspacesList] Main Cursor PID: ${mainPid}`);

			// Get workspace storage files opened by main process
			const { stdout: lsofOut } = await execAsync(
				`lsof -p ${mainPid} 2>/dev/null | grep "workspaceStorage.*state.vscdb"`
			);

			const storageHashes = lsofOut.trim().split('\n').map(line => {
				const match = line.match(/workspaceStorage\/([a-f0-9]+)\//);
				return match ? match[1] : null;
			}).filter(h => h !== null) as string[];

			console.log(`[WorkspacesList] Found ${storageHashes.length} workspace storage hashes`);

			// Read workspace path for each hash
			const windows: WindowInfo[] = [];
			for (let i = 0; i < storageHashes.length; i++) {
				const workspacePath = await this.getWorkspaceFromHash(storageHashes[i]);
				if (workspacePath) {
					windows.push({
						appName: 'Cursor',
						windowTitle: path.basename(workspacePath),
						windowIndex: i + 1,
						windowId: storageHashes[i],
						workspacePath: workspacePath
					});
				}
			}

			console.log(`[WorkspacesList] Found ${windows.length} workspaces`);
			return windows;
		} catch (error: any) {
			console.error('[WorkspacesList] Error getting windows:', error);
			return [];
		}
	}

	/**
	 * Get workspace path from storage hash
	 */
	private async getWorkspaceFromHash(hash: string): Promise<string | null> {
		try {
			const workspaceJsonPath = path.join(
				process.env.HOME || '',
				'Library/Application Support/Cursor/User/workspaceStorage',
				hash,
				'workspace.json'
			);

			const content = await fs.readFile(workspaceJsonPath, 'utf-8');
			const data = JSON.parse(content);

			if (data.folder) {
				let folderPath = data.folder;
				if (folderPath.startsWith('file://')) {
					folderPath = decodeURIComponent(folderPath.replace('file://', ''));
				}
				return folderPath;
			}
		} catch (error) {
			// Skip invalid workspaces
		}
		return null;
	}

	/**
	 * Focus a specific window by workspace path
	 * Uses VSCode's openFolder command which is more reliable than AppleScript
	 */
	async focusWindow(workspacePath: string): Promise<boolean> {
		// This method is called from the extension context,
		// so the actual switching is handled by vscode.commands.executeCommand
		// We return true here, and the provider will handle the command
		return true;
	}

	/**
	 * Get the friendly workspace name
	 */
	getWorkspaceName(windowInfo: WindowInfo): string {
		return windowInfo.windowTitle;
	}

	/**
	 * Check if the current window is focused
	 */
	async isCurrentWindowFocused(): Promise<boolean> {
		const script = `
			tell application "System Events"
				set frontApp to name of first application process whose frontmost is true
				return frontApp
			end tell
		`;

		try {
			const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
			const frontApp = stdout.trim();
			return frontApp.includes('Cursor') || frontApp.includes('Code');
		} catch (error) {
			return false;
		}
	}
}
