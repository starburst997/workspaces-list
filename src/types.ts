export enum ClaudeCodeStatus {
  NoSession, // No conversations exist for this workspace (no badge shown)
  NotRunning, // Has conversations but Claude process is not running (○)
  Running, // Claude process running but idle (●)
  Executing, // Claude is actively working RIGHT NOW (▶)
  WaitingForInput, // Claude is waiting for user permission/approval (⚠️)
  RecentlyFinished, // Task finished recently, waiting for next prompt (✓ gradient)
}

export interface ClaudeCodeStatusInfo {
  status: ClaudeCodeStatus
  lastMessageTime?: number // For gradient calculation
  conversationCount?: number // Number of active conversations
}
