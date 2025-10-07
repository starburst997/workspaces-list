import { exec } from "child_process"
import * as fs from "fs/promises"
import * as path from "path"
import { promisify } from "util"
import { outputChannel } from "./extension"

const execAsync = promisify(exec)

export interface WindowInfo {
  appName: string
  windowTitle: string
  windowIndex: number
  windowId?: string
  workspacePath?: string
}

export class MacOSWindowManager {
  /**
   * Get all open Cursor/VSCode windows by reading workspace storage
   * from the main processes
   */
  async getOpenWindows(): Promise<WindowInfo[]> {
    outputChannel.appendLine("[WorkspacesList] Starting window detection...")

    const allWindows: WindowInfo[] = []

    // Check both Cursor and VSCode
    const apps = [
      {
        name: "Cursor",
        processPath: "Cursor.app/Contents/MacOS/Cursor",
        storagePath: "Library/Application Support/Cursor/User/workspaceStorage",
      },
      {
        name: "Code",
        processPath: "Visual Studio Code.app/Contents/MacOS/Electron",
        storagePath:
          "Library/Application Support/Code/User/workspaceStorage",
      },
    ]

    for (const app of apps) {
      try {
        const windows = await this.getWindowsForApp(app.name, app.processPath, app.storagePath)
        allWindows.push(...windows)
      } catch (error: unknown) {
        outputChannel.appendLine(
          `[WorkspacesList] Error getting ${app.name} windows: ${error}`,
        )
      }
    }

    outputChannel.appendLine(`[WorkspacesList] Found ${allWindows.length} total workspaces`)
    return allWindows
  }

  /**
   * Get windows for a specific app
   */
  private async getWindowsForApp(
    appName: string,
    processPath: string,
    storagePath: string,
  ): Promise<WindowInfo[]> {
    try {
      // Find main process
      const { stdout: psOut } = await execAsync(
        `ps aux | grep "${processPath}" | grep -v grep | grep -v Helper`,
      )
      const lines = psOut.trim().split("\n").filter(line => line.trim())

      if (lines.length === 0) {
        outputChannel.appendLine(`[WorkspacesList] ${appName} process not found`)
        return []
      }

      // Extract PID
      const pidMatch = lines[0].match(/^\S+\s+(\d+)/)
      if (!pidMatch) {
        outputChannel.appendLine(`[WorkspacesList] Could not extract ${appName} PID`)
        return []
      }

      const mainPid = pidMatch[1]
      outputChannel.appendLine(`[WorkspacesList] ${appName} PID: ${mainPid}`)

      // Get workspace storage files opened by main process
      const { stdout: lsofOut } = await execAsync(
        `lsof -p ${mainPid} 2>/dev/null | grep "workspaceStorage.*state.vscdb"`,
      )

      const storageHashes = lsofOut
        .trim()
        .split("\n")
        .filter(line => line.trim())
        .map((line) => {
          const match = line.match(/workspaceStorage\/([a-f0-9]+)\//)
          return match ? match[1] : null
        })
        .filter((h) => h !== null) as string[]

      outputChannel.appendLine(
        `[WorkspacesList] Found ${storageHashes.length} ${appName} workspace storage hashes`,
      )

      // Read workspace path for each hash
      const windows: WindowInfo[] = []
      for (let i = 0; i < storageHashes.length; i++) {
        const workspacePath = await this.getWorkspaceFromHash(
          storageHashes[i],
          storagePath,
        )
        if (workspacePath) {
          windows.push({
            appName,
            windowTitle: path.basename(workspacePath),
            windowIndex: i + 1,
            windowId: storageHashes[i],
            workspacePath: workspacePath,
          })
        }
      }

      outputChannel.appendLine(`[WorkspacesList] Found ${windows.length} ${appName} workspaces`)
      return windows
    } catch (error: unknown) {
      outputChannel.appendLine(`[WorkspacesList] Error getting ${appName} windows: ${error}`)
      return []
    }
  }

  /**
   * Get workspace path from storage hash
   */
  private async getWorkspaceFromHash(
    hash: string,
    storagePath: string,
  ): Promise<string | null> {
    try {
      const workspaceJsonPath = path.join(
        process.env.HOME || "",
        storagePath,
        hash,
        "workspace.json",
      )

      const content = await fs.readFile(workspaceJsonPath, "utf-8")
      const data = JSON.parse(content)

      if (data.folder) {
        let folderPath = data.folder
        if (folderPath.startsWith("file://")) {
          folderPath = decodeURIComponent(folderPath.replace("file://", ""))
        }
        return folderPath
      }
    } catch (error) {
      // Skip invalid workspaces
    }
    return null
  }

  /**
   * Focus a specific window by workspace path
   * Uses VSCode's openFolder command which is more reliable than AppleScript
   */
  async focusWindow(): Promise<boolean> {
    // This method is called from the extension context,
    // so the actual switching is handled by vscode.commands.executeCommand
    // We return true here, and the provider will handle the command
    return true
  }

  /**
   * Get the friendly workspace name
   */
  getWorkspaceName(windowInfo: WindowInfo): string {
    return windowInfo.windowTitle
  }

  /**
   * @deprecated No longer needed - use vscode.window.state.focused instead
   * This method is kept for backwards compatibility but should not be used
   */
  async isCurrentWindowFocused(): Promise<boolean> {
    return true
  }
}
