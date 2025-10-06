import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"

export interface WorkspaceConfig {
  /**
   * Icon configuration
   * - String: icon name from Codicons (VSCode's icon library)
   * - Emoji: any emoji character
   * - SVG content: string starting with '<svg'
   * - File path: relative path to icon file (png, svg, etc.)
   * - URL: web address to icon
   */
  icon?: string

  /**
   * Color for the workspace name
   * Can be any CSS color value
   */
  color?: string

  /**
   * Optional display name override
   */
  displayName?: string
}

export class ConfigReader {
  private static readonly CONFIG_FILENAME = ".workspaces-list.json"
  private configCache = new Map<string, WorkspaceConfig | null>()

  /**
   * Read workspace configuration from the workspace root
   */
  async readConfig(workspacePath: string): Promise<WorkspaceConfig | null> {
    // Check cache first
    if (this.configCache.has(workspacePath)) {
      return this.configCache.get(workspacePath) || null
    }

    try {
      // Expand ~ to home directory
      const expandedPath = workspacePath.startsWith("~")
        ? path.join(process.env.HOME || "", workspacePath.slice(1))
        : workspacePath

      const configPath = path.join(expandedPath, ConfigReader.CONFIG_FILENAME)

      // Check if file exists
      try {
        await fs.access(configPath)
      } catch {
        // File doesn't exist
        this.configCache.set(workspacePath, null)
        return null
      }

      // Read and parse config file
      const content = await fs.readFile(configPath, "utf-8")
      const config = JSON.parse(content) as WorkspaceConfig

      // Validate config
      const validatedConfig = this.validateConfig(config)

      this.configCache.set(workspacePath, validatedConfig)
      return validatedConfig
    } catch (error) {
      console.error(`Failed to read config for ${workspacePath}:`, error)
      this.configCache.set(workspacePath, null)
      return null
    }
  }

  /**
   * Validate and sanitize config
   */
  private validateConfig(config: unknown): WorkspaceConfig {
    const validated: WorkspaceConfig = {}

    if (!config || typeof config !== "object") {
      return validated
    }

    if ("icon" in config && typeof config.icon === "string") {
      validated.icon = config.icon
    }

    if ("color" in config && typeof config.color === "string") {
      validated.color = config.color
    }

    if ("displayName" in config && typeof config.displayName === "string") {
      validated.displayName = config.displayName
    }

    return validated
  }

  /**
   * Clear config cache
   */
  clearCache(): void {
    this.configCache.clear()
  }

  /**
   * Watch a workspace config file for changes
   */
  watchConfig(
    workspacePath: string,
    onChange: () => void,
  ): vscode.Disposable | null {
    try {
      const expandedPath = workspacePath.startsWith("~")
        ? path.join(process.env.HOME || "", workspacePath.slice(1))
        : workspacePath

      const configPath = path.join(expandedPath, ConfigReader.CONFIG_FILENAME)

      const watcher = vscode.workspace.createFileSystemWatcher(configPath)

      watcher.onDidChange(() => {
        this.configCache.delete(workspacePath)
        onChange()
      })

      watcher.onDidCreate(() => {
        this.configCache.delete(workspacePath)
        onChange()
      })

      watcher.onDidDelete(() => {
        this.configCache.delete(workspacePath)
        onChange()
      })

      return watcher
    } catch (error) {
      console.error(`Failed to watch config for ${workspacePath}:`, error)
      return null
    }
  }
}
