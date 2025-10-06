import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"

export class IconRenderer {
  /**
   * Convert icon configuration to VSCode icon path
   */
  async renderIcon(
    iconConfig: string | undefined,
    workspacePath: string,
    context: vscode.ExtensionContext,
  ): Promise<
    | vscode.ThemeIcon
    | vscode.Uri
    | { light: vscode.Uri; dark: vscode.Uri }
    | undefined
  > {
    if (!iconConfig) {
      // Default icon
      return new vscode.ThemeIcon("folder")
    }

    // Check if it's an emoji (single character or emoji sequence)
    if (this.isEmoji(iconConfig)) {
      // For emojis, we can use them directly as the label would include them
      // But VSCode doesn't support emoji as icons directly, so we'll use a text file
      // or just return a default icon and handle emoji in the label
      return new vscode.ThemeIcon("symbol-misc")
    }

    // Check if it's SVG content
    if (iconConfig.trim().startsWith("<svg")) {
      return this.createIconFromSvg(iconConfig, context)
    }

    // Check if it's a URL
    if (this.isUrl(iconConfig)) {
      return vscode.Uri.parse(iconConfig)
    }

    // Check if it's a file path
    if (this.isFilePath(iconConfig)) {
      return this.resolveIconPath(iconConfig, workspacePath)
    }

    // Assume it's a Codicon name
    return new vscode.ThemeIcon(iconConfig)
  }

  /**
   * Check if string is an emoji
   */
  private isEmoji(str: string): boolean {
    // Simple emoji detection - checks if it's a short string with emoji characters
    const emojiRegex =
      /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u
    return str.length <= 4 && emojiRegex.test(str)
  }

  /**
   * Check if string is a URL
   */
  private isUrl(str: string): boolean {
    return str.startsWith("http://") || str.startsWith("https://")
  }

  /**
   * Check if string is a file path
   */
  private isFilePath(str: string): boolean {
    return (
      str.startsWith("./") ||
      str.startsWith("../") ||
      str.startsWith("/") ||
      str.startsWith("~")
    )
  }

  /**
   * Resolve icon file path relative to workspace
   */
  private resolveIconPath(
    iconPath: string,
    workspacePath: string,
  ): vscode.Uri | undefined {
    try {
      let resolvedPath: string

      if (iconPath.startsWith("~")) {
        // Expand home directory
        resolvedPath = path.join(process.env.HOME || "", iconPath.slice(1))
      } else if (iconPath.startsWith("/")) {
        // Absolute path
        resolvedPath = iconPath
      } else {
        // Relative path - resolve relative to workspace
        const expandedWorkspace = workspacePath.startsWith("~")
          ? path.join(process.env.HOME || "", workspacePath.slice(1))
          : workspacePath
        resolvedPath = path.join(expandedWorkspace, iconPath)
      }

      return vscode.Uri.file(resolvedPath)
    } catch (error) {
      console.error("Failed to resolve icon path:", error)
      return undefined
    }
  }

  /**
   * Create icon from SVG content
   */
  private async createIconFromSvg(
    svgContent: string,
    context: vscode.ExtensionContext,
  ): Promise<vscode.Uri | undefined> {
    try {
      // Create a temporary file for the SVG
      const iconsDir = path.join(context.globalStorageUri.fsPath, "icons")
      await fs.mkdir(iconsDir, { recursive: true })

      // Generate a hash for the SVG content to use as filename
      const hash = this.simpleHash(svgContent)
      const iconPath = path.join(iconsDir, `${hash}.svg`)

      // Write SVG to file
      await fs.writeFile(iconPath, svgContent, "utf-8")

      return vscode.Uri.file(iconPath)
    } catch (error) {
      console.error("Failed to create icon from SVG:", error)
      return undefined
    }
  }

  /**
   * Simple hash function for SVG content
   */
  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * Get emoji to prepend to label if icon is emoji
   */
  getEmojiPrefix(iconConfig: string | undefined): string {
    if (iconConfig && this.isEmoji(iconConfig)) {
      return iconConfig + " "
    }
    return ""
  }
}
