import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
import { ClaudeCodeStatus } from "./types"

interface ClaudeMessage {
  role: string
  content: unknown
  cwd?: string
  workingDirectory?: string
}

interface ConversationMetadata {
  workingDirectory: string
  lastModified: number
  messageCount: number
  lastMessage?: ClaudeMessage
}

export class ClaudeCodeMonitor {
  private static readonly CACHE_DIRS = [
    path.join(process.env.HOME || "", ".claude-code"),
    path.join(process.env.HOME || "", ".config", "claude-code"),
    path.join(
      process.env.HOME || "",
      "Library",
      "Application Support",
      "claude-code",
    ),
  ]

  private watchers: Map<string, vscode.FileSystemWatcher> = new Map()
  private conversationCache: Map<string, ConversationMetadata[]> = new Map()

  /**
   * Get the Claude Code status for a workspace
   */
  async getStatus(
    workspacePath: string,
  ): Promise<ClaudeCodeStatus | undefined> {
    try {
      const conversations = await this.getWorkspaceConversations(workspacePath)

      if (conversations.length === 0) {
        return undefined // No conversations for this workspace
      }

      // Check for any conversation waiting for input (highest priority)
      const hasWaitingForInput = await this.checkForWaitingInput(conversations)
      if (hasWaitingForInput) {
        return ClaudeCodeStatus.WaitingForInput
      }

      // Check for any running conversation
      const hasRunning = await this.checkForRunningConversation(conversations)
      if (hasRunning) {
        return ClaudeCodeStatus.Running
      }

      // All conversations are idle
      return ClaudeCodeStatus.Idle
    } catch (error) {
      console.error("Failed to get Claude Code status:", error)
      return undefined
    }
  }

  /**
   * Find all conversations for a workspace
   */
  private async getWorkspaceConversations(
    workspacePath: string,
  ): Promise<ConversationMetadata[]> {
    const cacheKey = workspacePath

    // Check cache first
    if (this.conversationCache.has(cacheKey)) {
      return this.conversationCache.get(cacheKey) || []
    }

    const conversations: ConversationMetadata[] = []

    // Search all possible cache directories
    for (const cacheDir of ClaudeCodeMonitor.CACHE_DIRS) {
      try {
        const convos = await this.findConversationsInDir(
          cacheDir,
          workspacePath,
        )
        conversations.push(...convos)
      } catch {
        // Directory might not exist, continue
        continue
      }
    }

    this.conversationCache.set(cacheKey, conversations)
    return conversations
  }

  /**
   * Find conversations in a specific cache directory
   */
  private async findConversationsInDir(
    cacheDir: string,
    workspacePath: string,
  ): Promise<ConversationMetadata[]> {
    const conversations: ConversationMetadata[] = []

    try {
      // Check if cache directory exists
      await fs.access(cacheDir)

      // Look for conversation directories or files
      const entries = await fs.readdir(cacheDir, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Check for conversation metadata
          const metadataPath = path.join(cacheDir, entry.name, "metadata.json")
          try {
            const metadata = await this.readConversationMetadata(metadataPath)
            if (
              this.matchesWorkspace(metadata.workingDirectory, workspacePath)
            ) {
              conversations.push(metadata)
            }
          } catch {
            // Try looking for messages.jsonl or similar
            const messagesPath = path.join(
              cacheDir,
              entry.name,
              "messages.jsonl",
            )
            try {
              const metadata =
                await this.inferMetadataFromMessages(messagesPath)
              if (
                metadata &&
                this.matchesWorkspace(metadata.workingDirectory, workspacePath)
              ) {
                conversations.push(metadata)
              }
            } catch {
              // Not a conversation directory
              continue
            }
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
    }

    return conversations
  }

  /**
   * Read conversation metadata file
   */
  private async readConversationMetadata(
    metadataPath: string,
  ): Promise<ConversationMetadata> {
    const content = await fs.readFile(metadataPath, "utf-8")
    const metadata = JSON.parse(content)

    const stats = await fs.stat(metadataPath)

    return {
      workingDirectory: metadata.workingDirectory || metadata.cwd || "",
      lastModified: stats.mtimeMs,
      messageCount: metadata.messageCount || 0,
      lastMessage: metadata.lastMessage,
    }
  }

  /**
   * Infer metadata from messages file
   */
  private async inferMetadataFromMessages(
    messagesPath: string,
  ): Promise<ConversationMetadata | null> {
    try {
      const content = await fs.readFile(messagesPath, "utf-8")
      const lines = content.trim().split("\n")

      if (lines.length === 0) {
        return null
      }

      const stats = await fs.stat(messagesPath)

      // Try to find working directory from first message
      let workingDirectory = ""
      for (const line of lines) {
        try {
          const message = JSON.parse(line)
          if (message.cwd || message.workingDirectory) {
            workingDirectory = message.cwd || message.workingDirectory
            break
          }
        } catch {
          continue
        }
      }

      const lastLine = lines[lines.length - 1]
      let lastMessage
      try {
        lastMessage = JSON.parse(lastLine)
      } catch {
        lastMessage = undefined
      }

      return {
        workingDirectory,
        lastModified: stats.mtimeMs,
        messageCount: lines.length,
        lastMessage,
      }
    } catch {
      return null
    }
  }

  /**
   * Check if a conversation matches a workspace
   */
  private matchesWorkspace(
    conversationWorkspace: string,
    targetWorkspace: string,
  ): boolean {
    if (!conversationWorkspace) {
      return false
    }

    // Expand ~ in paths
    const expandPath = (p: string) =>
      p.startsWith("~") ? path.join(process.env.HOME || "", p.slice(1)) : p

    const convPath = expandPath(conversationWorkspace)
    const targetPath = expandPath(targetWorkspace)

    // Normalize paths
    const normalizedConv = path.normalize(convPath)
    const normalizedTarget = path.normalize(targetPath)

    return (
      normalizedConv === normalizedTarget ||
      normalizedConv.startsWith(normalizedTarget + path.sep)
    )
  }

  /**
   * Check if any conversation is waiting for user input
   * This is indicated by the last message being from the assistant with a tool use or question
   */
  private async checkForWaitingInput(
    conversations: ConversationMetadata[],
  ): Promise<boolean> {
    // Check recent activity (within last 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000

    for (const convo of conversations) {
      if (convo.lastModified > fiveMinutesAgo && convo.lastMessage) {
        const msg = convo.lastMessage

        // Check if last message indicates waiting for input
        // This is heuristic and may need adjustment based on actual Claude Code message format
        if (msg.role === "assistant" && msg.content) {
          // Look for signs of waiting for permission or input
          const content = JSON.stringify(msg.content).toLowerCase()
          if (
            content.includes("permission") ||
            content.includes("approve") ||
            content.includes("confirm") ||
            content.includes("user-prompt-submit-hook")
          ) {
            return true
          }
        }
      }
    }

    return false
  }

  /**
   * Check if any conversation is currently running
   * This is indicated by very recent activity (within last 30 seconds)
   */
  private async checkForRunningConversation(
    conversations: ConversationMetadata[],
  ): Promise<boolean> {
    const thirtySecondsAgo = Date.now() - 30 * 1000

    for (const convo of conversations) {
      if (convo.lastModified > thirtySecondsAgo) {
        return true
      }
    }

    return false
  }

  /**
   * Watch a workspace for Claude Code activity
   */
  watchWorkspace(
    workspacePath: string,
    onChange: () => void,
  ): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = []

    // Watch all possible cache directories
    for (const cacheDir of ClaudeCodeMonitor.CACHE_DIRS) {
      try {
        const pattern = new vscode.RelativePattern(
          cacheDir,
          "**/*.{json,jsonl}",
        )
        const watcher = vscode.workspace.createFileSystemWatcher(pattern)

        watcher.onDidChange(() => {
          this.conversationCache.delete(workspacePath)
          onChange()
        })

        watcher.onDidCreate(() => {
          this.conversationCache.delete(workspacePath)
          onChange()
        })

        watcher.onDidDelete(() => {
          this.conversationCache.delete(workspacePath)
          onChange()
        })

        disposables.push(watcher)
      } catch {
        // Can't watch this directory
        continue
      }
    }

    return disposables
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.conversationCache.clear()
  }

  /**
   * Dispose all watchers
   */
  dispose(): void {
    for (const watcher of this.watchers.values()) {
      watcher.dispose()
    }
    this.watchers.clear()
  }
}
