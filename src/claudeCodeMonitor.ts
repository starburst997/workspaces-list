import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
import { exec } from "child_process"
import { promisify } from "util"
import { ClaudeCodeStatus, ClaudeCodeStatusInfo } from "./types"

const execAsync = promisify(exec)

const DEBUG = false // Enable debug logging - set to true for debugging

function log(...args: unknown[]): void {
  if (!DEBUG) return
  console.log("[ClaudeCodeMonitor]", ...args)
}

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
  // Claude Code stores projects in ~/.claude/projects
  private static readonly CLAUDE_PROJECTS_DIR = path.join(
    process.env.HOME || "",
    ".claude",
    "projects",
  )

  private watchers: Map<string, vscode.FileSystemWatcher> = new Map()
  private conversationCache: Map<string, ConversationMetadata[]> = new Map()

  /**
   * Encode workspace path to match Claude's directory naming
   * e.g., /Users/jdboivin/Projects/workspaces-list -> -Users-jdboivin-Projects-workspaces-list
   */
  private encodeWorkspacePath(workspacePath: string): string {
    return workspacePath.replace(/\//g, "-")
  }

  /**
   * Check if Claude Code process is running for a workspace
   */
  private async isClaudeProcessRunning(
    workspacePath: string,
  ): Promise<boolean> {
    try {
      // Get all Claude processes
      const { stdout } = await execAsync("ps aux | grep -i claude | grep -v grep")
      const lines = stdout.trim().split("\n")

      log(`Found ${lines.length} Claude process(es)`)

      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        const pid = parts[1]

        if (pid) {
          try {
            // Get working directory for this process
            const { stdout: cwdOutput } = await execAsync(
              `lsof -a -p ${pid} -d cwd 2>/dev/null | tail -1`,
            )
            const cwdParts = cwdOutput.trim().split(/\s+/)
            const cwd = cwdParts[cwdParts.length - 1]

            log(`  Process ${pid} cwd: ${cwd}`)

            // Normalize and compare paths
            const normalizedCwd = path.normalize(cwd)
            const normalizedWorkspace = path.normalize(workspacePath)

            if (
              normalizedCwd === normalizedWorkspace ||
              normalizedCwd.startsWith(normalizedWorkspace + path.sep)
            ) {
              log(`✓ Found running Claude process for ${workspacePath}`)
              return true
            }
          } catch (err) {
            // Process might have ended or no permission
            log(`  Failed to get cwd for process ${pid}`)
          }
        }
      }

      log(`✗ No running Claude process for ${workspacePath}`)
      return false
    } catch (err) {
      log(`Error checking Claude processes:`, err)
      return false
    }
  }

  /**
   * Get the Claude Code status for a workspace
   */
  async getStatus(
    workspacePath: string,
  ): Promise<ClaudeCodeStatusInfo | undefined> {
    try {
      log(`Getting status for workspace: ${workspacePath}`)

      // First check if Claude process is actually running
      const isProcessRunning = await this.isClaudeProcessRunning(workspacePath)

      const conversations = await this.getWorkspaceConversations(workspacePath)

      log(`Found ${conversations.length} conversations for ${workspacePath}`)

      if (conversations.length === 0) {
        log(`No sessions for ${workspacePath} - will show no badge`)
        return {
          status: ClaudeCodeStatus.NoSession,
          conversationCount: 0,
        }
      }

      // Check for any conversation waiting for input (highest priority)
      const waitingInfo = await this.checkForWaitingInput(conversations)
      if (waitingInfo.isWaiting) {
        log(`Status: WaitingForInput for ${workspacePath}`)
        return {
          status: ClaudeCodeStatus.WaitingForInput,
          lastMessageTime: waitingInfo.lastMessageTime,
          conversationCount: conversations.length,
        }
      }

      // Check for active execution (recent file activity = Claude is working)
      const executingInfo = await this.checkForExecuting(conversations)
      if (executingInfo.isExecuting) {
        log(`Status: Executing (active file writes) for ${workspacePath}`)
        return {
          status: ClaudeCodeStatus.Executing,
          lastMessageTime: executingInfo.lastMessageTime,
          conversationCount: conversations.length,
        }
      }

      // Check for recently finished (last message from assistant, < 30 min)
      // This means Claude finished but user hasn't started a new task yet
      const recentlyFinishedInfo =
        await this.checkForRecentlyFinished(conversations)
      if (recentlyFinishedInfo.isRecentlyFinished) {
        log(
          `Status: RecentlyFinished for ${workspacePath} (${Math.round((Date.now() - (recentlyFinishedInfo.lastMessageTime || 0)) / 1000 / 60)}min ago)`,
        )
        return {
          status: ClaudeCodeStatus.RecentlyFinished,
          lastMessageTime: recentlyFinishedInfo.lastMessageTime,
          conversationCount: conversations.length,
        }
      }

      // Distinguish between process running (idle) vs not running
      if (isProcessRunning) {
        log(`Status: Running (process idle) for ${workspacePath}`)
        return {
          status: ClaudeCodeStatus.Running,
          conversationCount: conversations.length,
        }
      } else {
        log(`Status: NotRunning (no process) for ${workspacePath}`)
        return {
          status: ClaudeCodeStatus.NotRunning,
          conversationCount: conversations.length,
        }
      }
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
      const cached = this.conversationCache.get(cacheKey) || []
      log(`Using cached conversations (${cached.length}) for ${workspacePath}`)
      return cached
    }

    const conversations: ConversationMetadata[] = []

    try {
      // Encode workspace path to match Claude's directory structure
      const encodedPath = this.encodeWorkspacePath(workspacePath)
      const projectDir = path.join(
        ClaudeCodeMonitor.CLAUDE_PROJECTS_DIR,
        encodedPath,
      )

      log(`Looking for conversations in: ${projectDir}`)

      // Check if project directory exists
      await fs.access(projectDir)
      log(`✓ Project directory exists`)

      // Read all .jsonl files
      const entries = await fs.readdir(projectDir, { withFileTypes: true })
      const jsonlFiles = entries.filter(
        (e) => e.isFile() && e.name.endsWith(".jsonl"),
      )

      log(`Found ${jsonlFiles.length} conversation files`)

      for (const file of jsonlFiles) {
        try {
          const filePath = path.join(projectDir, file.name)
          const metadata = await this.readConversationFile(filePath)
          conversations.push(metadata)

          const ageSeconds = Math.round(
            (Date.now() - metadata.lastModified) / 1000,
          )
          const ageMinutes = Math.round(ageSeconds / 60)

          log(
            `✓ Loaded conversation: ${file.name} (${metadata.messageCount} messages, ${ageSeconds}s/${ageMinutes}min old, last: ${metadata.lastMessage?.role || "N/A"})`,
          )
        } catch (err) {
          log(`✗ Failed to read conversation ${file.name}:`, err)
        }
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        log(`Project directory does not exist for ${workspacePath}`)
      } else {
        log(`Error accessing project directory:`, error)
      }
    }

    log(
      `Total conversations found for ${workspacePath}: ${conversations.length}`,
    )
    this.conversationCache.set(cacheKey, conversations)
    return conversations
  }

  /**
   * Read a conversation .jsonl file and extract metadata
   * Optimized to only read the last portion of the file for performance
   */
  private async readConversationFile(
    filePath: string,
  ): Promise<ConversationMetadata> {
    const stats = await fs.stat(filePath)
    const fileSize = stats.size

    // Read first 1KB for workspace directory
    const firstChunkSize = Math.min(1024, fileSize)
    const handle = await fs.open(filePath, "r")
    const firstBuffer = Buffer.alloc(firstChunkSize)
    await handle.read(firstBuffer, 0, firstChunkSize, 0)

    let workingDirectory = ""
    const firstChunk = firstBuffer.toString("utf-8")
    const firstLines = firstChunk.split("\n")

    // Extract cwd from first few lines
    for (const line of firstLines.slice(0, 5)) {
      try {
        const entry = JSON.parse(line)
        if (entry.cwd) {
          workingDirectory = entry.cwd
          break
        }
      } catch {
        continue
      }
    }

    // Read last 2KB for last message and timestamp (much more efficient)
    const lastChunkSize = Math.min(2048, fileSize)
    const lastBuffer = Buffer.alloc(lastChunkSize)
    const readPosition = Math.max(0, fileSize - lastChunkSize)
    await handle.read(lastBuffer, 0, lastChunkSize, readPosition)
    await handle.close()

    const lastChunk = lastBuffer.toString("utf-8")
    const lastLines = lastChunk
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .reverse() // Start from the end

    let lastMessage: ClaudeMessage | undefined
    let lastMessageTimestamp = 0

    // Parse last few lines to find the most recent message
    for (const line of lastLines.slice(0, 20)) {
      try {
        const entry = JSON.parse(line)

        // Skip file-history-snapshot and summary entries
        if (entry.type === "file-history-snapshot" || entry.type === "summary") {
          continue
        }

        // Track last actual message (user or assistant) with timestamp
        if (entry.message && entry.timestamp) {
          const timestamp =
            typeof entry.timestamp === "string"
              ? new Date(entry.timestamp).getTime()
              : entry.timestamp

          // Only update if this message is newer
          if (timestamp > lastMessageTimestamp) {
            lastMessageTimestamp = timestamp
            lastMessage = {
              role: entry.message.role || entry.type,
              content: entry.message.content,
              cwd: entry.cwd,
            }
          }
        }
      } catch {
        // Skip invalid lines
        continue
      }
    }

    // Use the last message timestamp if available, otherwise fall back to file mtime
    const lastModified = lastMessageTimestamp || stats.mtimeMs

    // Approximate message count by line breaks in last chunk
    const approximateMessageCount = lastChunk.split("\n").length

    return {
      workingDirectory,
      lastModified,
      messageCount: approximateMessageCount,
      lastMessage,
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
  ): Promise<{ isWaiting: boolean; lastMessageTime?: number }> {
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
            log(`Detected waiting for input in conversation`)
            return { isWaiting: true, lastMessageTime: convo.lastModified }
          }
        }
      }
    }

    return { isWaiting: false }
  }

  /**
   * Check if any conversation is currently executing a task
   * This is indicated by very recent activity (within last 30 seconds)
   */
  private async checkForExecuting(
    conversations: ConversationMetadata[],
  ): Promise<{ isExecuting: boolean; lastMessageTime?: number }> {
    const now = Date.now()
    const thirtySecondsAgo = now - 30 * 1000

    log(`Checking for executing... (now: ${now}, threshold: ${thirtySecondsAgo})`)

    for (const convo of conversations) {
      const ageSeconds = Math.round((now - convo.lastModified) / 1000)
      log(
        `  Conversation modified ${ageSeconds}s ago (${convo.lastModified} vs ${now})`,
      )

      if (convo.lastModified > thirtySecondsAgo) {
        log(
          `✓ Detected executing conversation (modified ${ageSeconds}s ago)`,
        )
        return { isExecuting: true, lastMessageTime: convo.lastModified }
      }
    }

    log(`✗ No executing conversations found`)
    return { isExecuting: false }
  }

  /**
   * Check if any conversation recently finished a task
   * Last message from assistant within 30 minutes
   */
  private async checkForRecentlyFinished(
    conversations: ConversationMetadata[],
  ): Promise<{ isRecentlyFinished: boolean; lastMessageTime?: number }> {
    const now = Date.now()
    const thirtyMinutesAgo = now - 30 * 60 * 1000

    log(`Checking for recently finished... (threshold: 30min ago)`)

    // Find most recent conversation
    let mostRecentTime = 0
    let mostRecentConvo: ConversationMetadata | undefined

    for (const convo of conversations) {
      if (convo.lastModified > mostRecentTime) {
        mostRecentTime = convo.lastModified
        mostRecentConvo = convo
      }
    }

    if (mostRecentConvo) {
      const ageMinutes = Math.round(
        (now - mostRecentConvo.lastModified) / 1000 / 60,
      )
      log(
        `  Most recent conversation: ${ageMinutes}min ago, last message role: ${mostRecentConvo.lastMessage?.role || "N/A"}`,
      )

      if (
        mostRecentConvo.lastModified > thirtyMinutesAgo &&
        mostRecentConvo.lastMessage
      ) {
        const msg = mostRecentConvo.lastMessage

        // Check if last message is from assistant (task completed)
        if (msg.role === "assistant") {
          log(
            `✓ Detected recently finished task (${ageMinutes}min ago, assistant message)`,
          )
          return {
            isRecentlyFinished: true,
            lastMessageTime: mostRecentConvo.lastModified,
          }
        } else {
          log(`✗ Last message not from assistant (role: ${msg.role})`)
        }
      } else {
        log(`✗ Most recent conversation too old (${ageMinutes}min ago)`)
      }
    }

    log(`✗ No recently finished conversations`)
    return { isRecentlyFinished: false }
  }

  /**
   * Watch a workspace for Claude Code activity
   */
  watchWorkspace(
    workspacePath: string,
    onChange: () => void,
  ): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = []

    try {
      const encodedPath = this.encodeWorkspacePath(workspacePath)
      const projectDir = path.join(
        ClaudeCodeMonitor.CLAUDE_PROJECTS_DIR,
        encodedPath,
      )

      const pattern = new vscode.RelativePattern(projectDir, "*.jsonl")
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
      log(`Failed to create watcher for ${workspacePath}`)
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
