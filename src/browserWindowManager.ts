import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

export interface BrowserWindowInfo {
  app: string
  title: string
  windowIndex: number
}

export class BrowserWindowManager {
  /**
   * Get all open Safari and Chrome windows using AppleScript
   */
  async getBrowserWindows(): Promise<BrowserWindowInfo[]> {
    try {
      const script = this.getAppleScript()
      const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`)

      const windows = JSON.parse(stdout.trim())
      return windows as BrowserWindowInfo[]
    } catch (error: unknown) {
      console.error("[BrowserWindowManager] Error getting browser windows:", error)
      return []
    }
  }

  /**
   * Focus a specific browser window
   */
  async focusWindow(appName: string, windowIndex: number): Promise<boolean> {
    try {
      const script = this.getFocusScript(appName, windowIndex)
      await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`)
      return true
    } catch (error: unknown) {
      console.error("[BrowserWindowManager] Error focusing window:", error)
      return false
    }
  }

  /**
   * AppleScript to get all windows from Safari and Chrome
   * Uses native application interfaces for better window detection
   */
  private getAppleScript(): string {
    return `
    set output to "["
    set needsComma to false

    -- Get Safari windows
    try
      tell application "Safari"
        if it is running then
          set safariWindows to windows
          repeat with i from 1 to count of safariWindows
            set w to item i of safariWindows
            set windowName to name of w
            if windowName is not "" and windowName is not missing value then
              -- Escape quotes and backslashes in title
              set escapedTitle to windowName
              set tid to AppleScript's text item delimiters

              -- Escape backslashes first
              set AppleScript's text item delimiters to "\\\\\\\\"
              set escapedTitle to text items of escapedTitle as text

              -- Then escape quotes
              set AppleScript's text item delimiters to "\\\\\\""
              set escapedTitle to text items of escapedTitle as text

              set AppleScript's text item delimiters to tid

              if needsComma then
                set output to output & ","
              end if
              set output to output & "{" & quote & "app" & quote & ":" & quote & "Safari" & quote & "," & quote & "title" & quote & ":" & quote & escapedTitle & quote & "," & quote & "windowIndex" & quote & ":" & i & "}"
              set needsComma to true
            end if
          end repeat
        end if
      end tell
    end try

    -- Get Chrome windows
    try
      tell application "Google Chrome"
        if it is running then
          set chromeWindows to windows
          repeat with i from 1 to count of chromeWindows
            set w to item i of chromeWindows
            set windowName to name of w
            if windowName is not "" and windowName is not missing value then
              -- Escape quotes and backslashes in title
              set escapedTitle to windowName
              set tid to AppleScript's text item delimiters

              -- Escape backslashes first
              set AppleScript's text item delimiters to "\\\\\\\\"
              set escapedTitle to text items of escapedTitle as text

              -- Then escape quotes
              set AppleScript's text item delimiters to "\\\\\\""
              set escapedTitle to text items of escapedTitle as text

              set AppleScript's text item delimiters to tid

              if needsComma then
                set output to output & ","
              end if
              set output to output & "{" & quote & "app" & quote & ":" & quote & "Google Chrome" & quote & "," & quote & "title" & quote & ":" & quote & escapedTitle & quote & "," & quote & "windowIndex" & quote & ":" & i & "}"
              set needsComma to true
            end if
          end repeat
        end if
      end tell
    end try

    set output to output & "]"
    return output
  `
  }

  /**
   * AppleScript to focus a specific browser window
   */
  private getFocusScript(appName: string, windowIndex: number): string {
    return `
    tell application "${appName}"
      activate
      set index of window ${windowIndex} to 1
    end tell
  `
  }
}
