import { exec } from "child_process"
import * as fs from "fs/promises"
import * as path from "path"
import { promisify } from "util"
import * as vscode from "vscode"
import { ClaudeCodeStatus, ClaudeCodeStatusInfo } from "./types"

const execAsync = promisify(exec)

const DEBUG = false // Enable debug logging - set to true for debugging

function log(...args: unknown[]): void {
  if (!DEBUG) {
    return
  }
  console.log("[ClaudeCodeMonitor]", ...args)
}

// Log only important events (always shown)
function logEvent(...args: unknown[]): void {
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

interface ClaudeProcess {
  pid: string
  cwd: string
}

export class ClaudeCodeMonitor {
  // Singleton instance
  private static instance: ClaudeCodeMonitor | null = null

  // Claude Code stores projects in ~/.claude/projects
  private static readonly CLAUDE_PROJECTS_DIR = path.join(
    process.env.HOME || "",
    ".claude",
    "projects",
  )

  private watchers: Map<string, vscode.FileSystemWatcher> = new Map()
  private conversationCache: Map<string, ConversationMetadata[]> = new Map()
  private conversationFileCache: Map<string, ConversationMetadata> = new Map() // Cache individual file metadata
  private workingDirectoryCache: Map<string, string> = new Map() // Static cache for workingDirectory by file path
  private projectDirExistsCache: Map<string, boolean> = new Map() // Cache for fs.access checks
  private projectFilesCache: Map<string, string[]> = new Map() // Cache for fs.readdir results

  // Process monitoring cache
  private claudeProcessCache: Map<string, ClaudeProcess> = new Map() // pid -> process info
  private processMonitorInterval: NodeJS.Timeout | undefined
  private readonly PROCESS_MONITOR_INTERVAL = 30000 // 30 seconds

  /**
   * Get the singleton instance
   */
  static getInstance(): ClaudeCodeMonitor {
    if (!ClaudeCodeMonitor.instance) {
      ClaudeCodeMonitor.instance = new ClaudeCodeMonitor()
      logEvent("✓ ClaudeCodeMonitor singleton instance created")
    }
    return ClaudeCodeMonitor.instance
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    // Private constructor
  }

  /**
   * Start periodic process monitoring
   * Returns a promise that resolves when the initial scan is complete
   */
  async startProcessMonitoring(): Promise<void> {
    if (this.processMonitorInterval) {
      return // Already running
    }

    // Initial scan (await it to ensure cache is populated before returning)
    try {
      await this.updateClaudeProcessCache()
      logEvent(
        `✓ Process monitoring started (${this.claudeProcessCache.size} Claude process(es) found)`,
      )
    } catch (err) {
      logEvent("✗ Failed to start process monitoring:", err)
    }

    // Periodic updates
    this.processMonitorInterval = setInterval(() => {
      this.updateClaudeProcessCache().catch((err) =>
        log("Failed to update process cache:", err),
      )
    }, this.PROCESS_MONITOR_INTERVAL)
  }

  /**
   * Stop periodic process monitoring
   */
  stopProcessMonitoring(): void {
    if (this.processMonitorInterval) {
      clearInterval(this.processMonitorInterval)
      this.processMonitorInterval = undefined
      logEvent("⏸ Process monitoring stopped (window lost focus)")
    }
  }

  /**
   * Update the cache of running Claude processes
   * Only performs lsof on new processes
   */
  private async updateClaudeProcessCache(): Promise<void> {
    try {
      // Get all Claude processes (using || true to avoid error when no processes found)
      const { stdout } = await execAsync(
        "ps aux | grep -i claude | grep -v grep || true",
      )

      if (!stdout.trim()) {
        log("No Claude processes found")
        // Clear cache if no processes running
        this.claudeProcessCache.clear()
        return
      }

      const lines = stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim())

      const currentPids = new Set<string>()

      log(`Scanning ${lines.length} Claude process(es)`)

      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        const pid = parts[1]

        if (!pid) {
          continue
        }

        currentPids.add(pid)

        // Skip if we already have this process cached
        if (this.claudeProcessCache.has(pid)) {
          continue
        }

        // New process - get its working directory
        try {
          const { stdout: cwdOutput } = await execAsync(
            `lsof -a -p ${pid} -d cwd 2>/dev/null | tail -1`,
          )
          const cwdParts = cwdOutput.trim().split(/\s+/)
          const cwd = cwdParts[cwdParts.length - 1]

          const normalizedCwd = path.normalize(cwd)

          this.claudeProcessCache.set(pid, { pid, cwd: normalizedCwd })
          log(`  ✓ Cached new process ${pid}: ${normalizedCwd}`)
        } catch (err) {
          log(`  ✗ Failed to get cwd for process ${pid}`)
        }
      }

      // Remove processes that are no longer running
      const stoppedPids: string[] = []
      for (const pid of this.claudeProcessCache.keys()) {
        if (!currentPids.has(pid)) {
          stoppedPids.push(pid)
        }
      }

      for (const pid of stoppedPids) {
        this.claudeProcessCache.delete(pid)
        log(`  ✗ Removed stopped process ${pid}`)
      }

      log(
        `Process cache updated: ${this.claudeProcessCache.size} active process(es)`,
      )
    } catch (err) {
      log("Error updating process cache:", err)
    }
  }

  /**
   * Encode workspace path to match Claude's directory naming
   * e.g., /Users/jdboivin/Projects/workspaces-list -> -Users-jdboivin-Projects-workspaces-list
   */
  private encodeWorkspacePath(workspacePath: string): string {
    return workspacePath.replace(/\//g, "-")
  }

  /**
   * Check if Claude Code process is running for a workspace
   * Uses cached process data for efficiency
   */
  private isClaudeProcessRunning(workspacePath: string): boolean {
    const normalizedWorkspace = path.normalize(workspacePath)

    for (const process of this.claudeProcessCache.values()) {
      if (
        process.cwd === normalizedWorkspace ||
        process.cwd.startsWith(normalizedWorkspace + path.sep)
      ) {
        log(`✓ Found running Claude process for ${workspacePath}`)
        return true
      }
    }

    log(`No running Claude process for ${workspacePath}`)
    return false
  }

  /**
   * Get the Claude Code status for a workspace
   */
  async getStatus(
    workspacePath: string,
  ): Promise<ClaudeCodeStatusInfo | undefined> {
    // Testing performance
    /*return {
      status: Object.values(ClaudeCodeStatus)[
        Math.floor(Math.random() * Object.values(ClaudeCodeStatus).length)
      ] as ClaudeCodeStatus,
      lastMessageTime: Date.now(),
      conversationCount: Math.floor(Math.random() * 10) + 1,
    }*/

    try {
      log(`Getting status for workspace: ${workspacePath}`)

      // First check if Claude process is actually running (using cache)
      const isProcessRunning = this.isClaudeProcessRunning(workspacePath)

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
        const timestamp = waitingInfo.lastMessageTime
          ? new Date(waitingInfo.lastMessageTime).toLocaleTimeString()
          : "unknown"
        logEvent(`→ Status: WaitingForInput @ ${timestamp}`)
        return {
          status: ClaudeCodeStatus.WaitingForInput,
          lastMessageTime: waitingInfo.lastMessageTime,
          conversationCount: conversations.length,
        }
      }

      // Check for active execution (recent file activity = Claude is working)
      const executingInfo = await this.checkForExecuting(conversations)
      if (executingInfo.isExecuting) {
        const timestamp = executingInfo.lastMessageTime
          ? new Date(executingInfo.lastMessageTime).toLocaleTimeString()
          : "unknown"
        logEvent(`→ Status: Executing @ ${timestamp}`)
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
        const timestamp = recentlyFinishedInfo.lastMessageTime
          ? new Date(recentlyFinishedInfo.lastMessageTime).toLocaleTimeString()
          : "unknown"
        const minutesAgo = recentlyFinishedInfo.lastMessageTime
          ? Math.round(
              (Date.now() - recentlyFinishedInfo.lastMessageTime) / 1000 / 60,
            )
          : 0
        logEvent(
          `→ Status: RecentlyFinished @ ${timestamp} (${minutesAgo}min ago)`,
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
   * Uses smart caching with file watchers for invalidation
   */
  private async getWorkspaceConversations(
    workspacePath: string,
  ): Promise<ConversationMetadata[]> {
    // Check if we have cached workspace conversations
    const cached = this.conversationCache.get(workspacePath)
    if (cached) {
      log(`Cache hit: ${cached.length} conversations for ${workspacePath}`)
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

      // Check if project directory exists (with cache)
      let dirExists = this.projectDirExistsCache.get(projectDir)
      if (dirExists === undefined) {
        try {
          await fs.access(projectDir)
          dirExists = true
          this.projectDirExistsCache.set(projectDir, true)
        } catch {
          dirExists = false
          this.projectDirExistsCache.set(projectDir, false)
        }
      }

      if (!dirExists) {
        this.conversationCache.set(workspacePath, conversations)
        return conversations
      }

      // Get list of .jsonl files (with cache)
      let jsonlFiles = this.projectFilesCache.get(projectDir)
      if (!jsonlFiles) {
        const entries = await fs.readdir(projectDir, { withFileTypes: true })
        jsonlFiles = entries
          .filter((e) => e.isFile() && e.name.endsWith(".jsonl"))
          .map((e) => path.join(projectDir, e.name))
        this.projectFilesCache.set(projectDir, jsonlFiles)
      }

      for (const filePath of jsonlFiles) {
        try {
          // Check if we have this file cached
          let metadata = this.conversationFileCache.get(filePath)
          if (!metadata) {
            // Not cached - read the file
            metadata = await this.readConversationFile(filePath)
            this.conversationFileCache.set(filePath, metadata)

            // Log when we actually read from file
            const timestamp = metadata.lastModified
              ? new Date(metadata.lastModified).toLocaleTimeString()
              : "unknown"
            const minutesAgo = metadata.lastModified
              ? Math.round((Date.now() - metadata.lastModified) / 1000 / 60)
              : 0
            logEvent(
              `  📖 Read from file: ${path.basename(filePath)} - last msg ${minutesAgo}min ago @ ${timestamp} (${metadata.lastMessage?.role || "N/A"})`,
            )
          }

          conversations.push(metadata)
        } catch (err) {
          log(`Failed to read ${path.basename(filePath)}:`, err)
        }
      }
    } catch (error: unknown) {
      log(`Error accessing project directory:`, error)
    }

    // Cache the result (will be invalidated by file watchers)
    this.conversationCache.set(workspacePath, conversations)
    return conversations
  }

  /**
   * Read a conversation .jsonl file and extract metadata
   * Optimized to only read the last portion of the file for performance
   * Uses static caching for workingDirectory (never changes for a file)
   */
  private async readConversationFile(
    filePath: string,
  ): Promise<ConversationMetadata> {
    const stats = await fs.stat(filePath)
    const fileSize = stats.size

    // Check if workingDirectory is cached (static, never changes)
    let workingDirectory = this.workingDirectoryCache.get(filePath)

    if (!workingDirectory) {
      // Read first 1KB for workspace directory (only first time)
      const firstChunkSize = Math.min(1024, fileSize)
      const handle = await fs.open(filePath, "r")
      const firstBuffer = Buffer.alloc(firstChunkSize)
      await handle.read(firstBuffer, 0, firstChunkSize, 0)
      await handle.close()

      const firstChunk = firstBuffer.toString("utf-8")
      const firstLines = firstChunk.split("\n")

      // Extract cwd from first few lines
      for (const line of firstLines.slice(0, 5)) {
        try {
          const entry = JSON.parse(line)
          if (entry.cwd) {
            workingDirectory = entry.cwd as string
            break
          }
        } catch {
          continue
        }
      }

      if (!workingDirectory) {
        workingDirectory = ""
      }

      // Cache permanently (working directory never changes)
      this.workingDirectoryCache.set(filePath, workingDirectory)
    }

    // Read last 2KB for last message and timestamp (much more efficient)
    const lastChunkSize = Math.min(2048, fileSize)
    const handle = await fs.open(filePath, "r")
    const lastBuffer = Buffer.alloc(lastChunkSize)
    const readPosition = Math.max(0, fileSize - lastChunkSize)
    await handle.read(lastBuffer, 0, lastChunkSize, readPosition)
    await handle.close()

    const lastChunk = lastBuffer.toString("utf-8")
    const allLines = lastChunk
      .split("\n")
      .filter((line) => line.trim().length > 0)

    // Skip the first line as it might be incomplete (we read from middle of file)
    const lastLines =
      readPosition > 0 ? allLines.slice(1).reverse() : allLines.reverse()

    let lastMessage: ClaudeMessage | undefined
    let lastMessageTimestamp = 0
    let foundFirstMessage = false

    log(`Parsing ${lastLines.length} lines from ${path.basename(filePath)}`)

    // Parse last few lines to find the most recent message
    // Optimize: Assuming messages are ordered, exit early when we find older messages
    for (const line of lastLines.slice(0, 20)) {
      try {
        const entry = JSON.parse(line)

        // Skip file-history-snapshot and summary entries
        if (
          entry.type === "file-history-snapshot" ||
          entry.type === "summary"
        ) {
          continue
        }

        // Track last actual message (user or assistant) with timestamp
        if (entry.message && entry.timestamp) {
          const timestamp =
            typeof entry.timestamp === "string"
              ? new Date(entry.timestamp).getTime()
              : entry.timestamp

          if (!foundFirstMessage) {
            // First valid message we find (from end of file)
            lastMessageTimestamp = timestamp
            lastMessage = {
              role: entry.message.role || entry.type,
              content: entry.message.content,
              cwd: entry.cwd,
            }
            foundFirstMessage = true
            log(
              `  Found message @ ${new Date(timestamp).toLocaleTimeString()} (${entry.message.role})`,
            )
          } else if (timestamp < lastMessageTimestamp) {
            // Found older message, messages are ordered - can exit early
            log(`  Found older message - stopping scan`)
            break
          } else if (timestamp > lastMessageTimestamp) {
            // Found newer message (shouldn't happen if ordered, but handle it)
            log(
              `  Found NEWER message @ ${new Date(timestamp).toLocaleTimeString()} (${entry.message.role})`,
            )
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
            //content.includes("permission") ||
            //content.includes("approve") ||
            //content.includes("confirm") ||
            //content.includes("user-prompt-submit-hook")
            content.includes("tool_use")
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

    log(
      `Checking for executing... (now: ${now}, threshold: ${thirtySecondsAgo})`,
    )

    for (const convo of conversations) {
      const ageSeconds = Math.round((now - convo.lastModified) / 1000)
      log(
        `  Conversation modified ${ageSeconds}s ago (${convo.lastModified} vs ${now})`,
      )

      if (convo.lastModified > thirtySecondsAgo) {
        log(`✓ Detected executing conversation (modified ${ageSeconds}s ago)`)
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
   * Implements smart caching with file-level invalidation
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

      watcher.onDidChange((uri) => {
        const fileName = path.basename(uri.fsPath)
        logEvent(
          `📝 Conversation updated: ${fileName} in ${path.basename(workspacePath)}`,
        )

        // /Users/jdboivin/.claude/projects/-Users-jdboivin-Projects-s3-mirror-sample-app/966ca583-91b8-4fb6-b800-246aaabf1e2c.jsonl
        // /Users/jdboivin/.claude/projects/-Users-jdboivin-Projects-workspaces-list/648ea6fb-7295-4d3d-b541-f0abac560fa7.jsonl

        // Invalidate only this specific file's cache
        this.conversationFileCache.delete(`${uri.fsPath}`)
        // Clear workspace conversation list cache
        this.conversationCache.delete(workspacePath)

        onChange()
      })

      watcher.onDidCreate((uri) => {
        const fileName = path.basename(uri.fsPath)
        logEvent(
          `✨ New conversation: ${fileName} in ${path.basename(workspacePath)}`,
        )
        // New file - invalidate file list cache and workspace cache
        this.projectFilesCache.delete(projectDir)
        this.conversationCache.delete(workspacePath)
        onChange()
      })

      watcher.onDidDelete((uri) => {
        const fileName = path.basename(uri.fsPath)
        logEvent(
          `🗑️  Conversation deleted: ${fileName} in ${path.basename(workspacePath)}`,
        )
        // Remove from all caches
        this.conversationFileCache.delete(uri.fsPath)
        this.projectFilesCache.delete(projectDir)
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
    this.conversationFileCache.clear()
    this.projectDirExistsCache.clear()
    this.projectFilesCache.clear()
    // Note: workingDirectoryCache is static and never cleared
  }

  /**
   * Clear cache for a specific workspace
   */
  clearWorkspaceCache(workspacePath: string): void {
    this.conversationCache.delete(workspacePath)
    // Note: Individual file caches are cleared by file watchers
  }

  /**
   * Dispose all watchers and stop monitoring
   */
  dispose(): void {
    this.stopProcessMonitoring()
    for (const watcher of this.watchers.values()) {
      watcher.dispose()
    }
    this.watchers.clear()
  }
}
