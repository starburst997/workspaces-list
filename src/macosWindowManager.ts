import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

export interface WindowInfo {
	appName: string;
	windowTitle: string;
	windowIndex: number;
	workspacePath?: string;
}

export class MacOSWindowManager {
	private readonly supportedApps = ['Visual Studio Code', 'Code', 'Cursor'];

	/**
	 * Get all open VSCode and Cursor windows
	 */
	async getOpenWindows(): Promise<WindowInfo[]> {
		const windows: WindowInfo[] = [];

		for (const appName of this.supportedApps) {
			try {
				const appWindows = await this.getWindowsForApp(appName);
				windows.push(...appWindows);
			} catch (error) {
				// App might not be running, continue to next
				continue;
			}
		}

		return windows;
	}

	/**
	 * Get all windows for a specific application
	 */
	private async getWindowsForApp(appName: string): Promise<WindowInfo[]> {
		const script = `
			tell application "System Events"
				if not (exists process "${appName}") then
					error "Application not running"
				end if

				tell process "${appName}"
					set windowList to every window
					set windowCount to count of windowList
					set windowTitles to {}

					repeat with i from 1 to windowCount
						set windowTitle to name of window i
						set end of windowTitles to windowTitle
					end repeat

					return windowTitles
				end tell
			end tell
		`;

		try {
			const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);

			// Parse the AppleScript output (comma-separated list)
			const titles = stdout.trim().split(', ').filter(t => t.length > 0);

			return titles.map((title, index) => ({
				appName,
				windowTitle: title,
				windowIndex: index + 1, // AppleScript uses 1-based indexing
				workspacePath: this.extractWorkspacePathFromTitle(title)
			}));
		} catch (error) {
			return [];
		}
	}

	/**
	 * Focus a specific window
	 */
	async focusWindow(appName: string, windowIndex: number): Promise<boolean> {
		const script = `
			tell application "${appName}"
				activate
			end tell

			tell application "System Events"
				tell process "${appName}"
					try
						set frontmost to true
						perform action "AXRaise" of window ${windowIndex}
					end try
				end tell
			end tell
		`;

		try {
			await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
			return true;
		} catch (error) {
			console.error('Failed to focus window:', error);
			return false;
		}
	}

	/**
	 * Extract workspace path from window title
	 * VSCode/Cursor window titles typically follow patterns like:
	 * - "workspace-name — /path/to/workspace"
	 * - "file.txt — workspace-name"
	 * - "/path/to/workspace"
	 */
	private extractWorkspacePathFromTitle(title: string): string | undefined {
		// Try to extract path from title
		// Pattern 1: "name — /path/to/workspace"
		const pathMatch = title.match(/— (.+)$/);
		if (pathMatch) {
			const potentialPath = pathMatch[1];
			// Check if it looks like a path (starts with / or ~)
			if (potentialPath.startsWith('/') || potentialPath.startsWith('~')) {
				return potentialPath;
			}
		}

		// Pattern 2: Title is just a path
		if (title.startsWith('/') || title.startsWith('~')) {
			return title;
		}

		// Pattern 3: Extract workspace name as fallback
		const workspaceMatch = title.match(/^([^—]+)/);
		if (workspaceMatch) {
			return workspaceMatch[1].trim();
		}

		return undefined;
	}

	/**
	 * Get the friendly workspace name from a path or title
	 */
	getWorkspaceName(windowInfo: WindowInfo): string {
		if (windowInfo.workspacePath) {
			// If it's a path, return the last component
			if (windowInfo.workspacePath.startsWith('/') || windowInfo.workspacePath.startsWith('~')) {
				return path.basename(windowInfo.workspacePath);
			}
			return windowInfo.workspacePath;
		}
		return windowInfo.windowTitle;
	}

	/**
	 * Check if the current window is focused
	 */
	async isCurrentWindowFocused(): Promise<boolean> {
		// Check if VSCode or Cursor is the frontmost application
		const script = `
			tell application "System Events"
				set frontApp to name of first application process whose frontmost is true
				return frontApp
			end tell
		`;

		try {
			const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
			const frontApp = stdout.trim();
			return this.supportedApps.some(app => frontApp.includes(app));
		} catch (error) {
			return false;
		}
	}
}
