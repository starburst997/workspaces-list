# Development Log - Workspaces List Extension

This document tracks the development process of the Workspaces List VSCode/Cursor extension.

## Project Overview

A VSCode/Cursor extension that displays all currently opened workspace windows in a sidebar tree view with:
- Native macOS window detection and switching
- Customizable workspace icons and colors
- Claude Code session status monitoring
- Focus-aware monitoring for performance optimization

## Architecture

### Core Components

#### 1. Extension Entry Point (`src/extension.ts`)
- Activates on startup
- Registers tree view and commands
- Manages extension lifecycle

#### 2. Workspaces Provider (`src/workspacesProvider.ts`)
- Implements `TreeDataProvider` interface
- Orchestrates all components
- Manages workspace items and tree view updates
- Handles monitoring intervals and focus detection

#### 3. macOS Window Manager (`src/macosWindowManager.ts`)
- Uses AppleScript to interact with macOS window system
- Lists all open VSCode/Cursor windows
- Extracts workspace paths from window titles
- Switches focus to specific windows
- Detects if current window has focus

**Key AppleScript Operations:**
- `System Events` process enumeration for window listing
- Window title extraction via `name of window`
- Window focusing via `activate` and `AXRaise` action
- Frontmost application detection for focus monitoring

#### 4. Config Reader (`src/configReader.ts`)
- Reads `.workspaces-list.json` from workspace root
- Caches configurations for performance
- Watches config files for changes
- Validates and sanitizes config data

**Configuration Schema:**
```json
{
  "icon": "folder|emoji|<svg>...</svg>|./path/to/icon.png|https://...",
  "color": "CSS color value",
  "displayName": "Custom workspace name"
}
```

#### 5. Icon Renderer (`src/iconRenderer.ts`)
- Supports multiple icon formats:
  - **Codicons**: VSCode's built-in icon library (e.g., "folder", "file")
  - **Emojis**: Single emoji characters
  - **SVG Content**: Inline SVG strings
  - **File Paths**: Relative or absolute paths to image files
  - **URLs**: Web addresses to icons
- Creates temporary SVG files for inline SVG content
- Handles emoji display as label prefix

#### 6. Claude Code Monitor (`src/claudeCodeMonitor.ts`)
- Monitors Claude Code conversation cache directories
- Detects three states:
  - **Waiting for Input**: Last message indicates need for permission/approval
  - **Running**: Recent activity (within 30 seconds)
  - **Idle**: No recent activity but conversations exist
- Searches multiple potential cache locations:
  - `~/.claude-code`
  - `~/.config/claude-code`
  - `~/Library/Application Support/claude-code`
- Reads conversation metadata and message files
- Implements workspace path matching with normalization

## Development Process

### Phase 1: Project Setup ✓
- Initialized TypeScript extension project
- Configured package.json with extension metadata
- Set up build system and linting
- Created project structure

### Phase 2: Basic Tree View ✓
- Implemented tree view provider with dummy data
- Created sidebar container and view
- Added refresh command
- Established workspace item structure

### Phase 3: macOS Integration ✓
- Implemented AppleScript-based window detection
- Added window title parsing for workspace paths
- Implemented window focus switching
- Added support for both VSCode and Cursor applications

### Phase 4: Workspace Customization ✓
- Created config file reader with caching
- Implemented icon rendering system
- Added support for multiple icon formats
- Implemented emoji prefix handling
- Added color customization support

### Phase 5: Claude Code Monitoring ✓
- Researched Claude Code cache structure
- Implemented conversation discovery
- Added status detection logic
- Implemented workspace matching algorithm

### Phase 6: Performance Optimization ✓
- Added focus-aware monitoring
- Implemented efficient polling intervals:
  - Claude status: every 5 seconds (when focused)
  - Focus detection: every 2 seconds
- Added caching throughout
- Optimized file system operations

## Technical Challenges & Solutions

### Challenge 1: Window Detection Without VSCode API
**Problem:** VSCode extension API doesn't provide window enumeration or focus switching.

**Solution:** Used macOS AppleScript via `System Events` to:
- Enumerate all windows of target applications
- Extract window titles and metadata
- Control window focus and activation

### Challenge 2: Workspace Path Extraction
**Problem:** Window titles have varying formats and don't always include full paths.

**Solution:** Implemented pattern matching for common formats:
- "workspace-name — /path/to/workspace"
- "/path/to/workspace"
- "file.txt — workspace-name"

### Challenge 3: Claude Code Status Detection
**Problem:** No official API to query Claude Code session status.

**Solution:** Implemented file-system based monitoring:
- Scan known cache directories
- Parse conversation metadata and message files
- Use heuristics based on:
  - File modification times
  - Last message content
  - Message patterns (permission requests, etc.)

### Challenge 4: Performance with Multiple Windows
**Problem:** Continuous monitoring could impact performance with many windows.

**Solution:** Implemented focus-aware monitoring:
- Only monitor when extension window has focus
- Use efficient polling intervals
- Cache all expensive operations
- Batch status updates

### Challenge 5: Icon Format Flexibility
**Problem:** Supporting multiple icon formats while maintaining type safety.

**Solution:** Created smart icon renderer with format detection:
- Auto-detect format from content
- Generate temporary files for SVG content
- Support emoji as label prefix
- Fallback to Codicons for simple strings

## File Structure

```
workspaces-list/
├── src/
│   ├── extension.ts              # Entry point
│   ├── workspacesProvider.ts     # Tree view provider
│   ├── macosWindowManager.ts     # macOS AppleScript integration
│   ├── configReader.ts           # Workspace config reading
│   ├── iconRenderer.ts           # Icon format handling
│   └── claudeCodeMonitor.ts      # Claude Code status monitoring
├── package.json                   # Extension manifest
├── tsconfig.json                  # TypeScript config
├── .eslintrc.json                # Linting config
├── README.md                      # User documentation
└── CLAUDE.md                      # This file

out/                               # Compiled JavaScript (git-ignored)
node_modules/                      # Dependencies (git-ignored)
```

## Testing Strategy

### Manual Testing Checklist
- [ ] Extension activates on startup
- [ ] Tree view appears in activity bar
- [ ] All open VSCode/Cursor windows are listed
- [ ] Clicking workspace switches focus correctly
- [ ] Custom icons display correctly (all formats)
- [ ] Custom colors apply to workspace names
- [ ] Claude Code status updates appear
- [ ] Status changes from Running → Idle → Waiting
- [ ] Monitoring pauses when window loses focus
- [ ] Config changes trigger updates
- [ ] Refresh command works

### Edge Cases to Test
- Workspaces with special characters in paths
- Workspaces without config files
- Invalid JSON in config files
- Multiple Claude Code sessions per workspace
- Very long workspace names
- Missing Claude Code cache directories

## Future Enhancements

### Potential Features
- [ ] Cross-platform support (Windows, Linux)
- [ ] Keyboard shortcuts for workspace switching
- [ ] Recently accessed workspaces
- [ ] Workspace grouping/categorization
- [ ] Quick actions (open terminal, etc.)
- [ ] Status bar integration
- [ ] Notification on Claude Code status changes
- [ ] Git status integration
- [ ] Workspace search/filter

### Code Improvements
- [ ] Add comprehensive unit tests
- [ ] Add integration tests
- [ ] Improve error handling and logging
- [ ] Add performance metrics
- [ ] Optimize AppleScript calls
- [ ] Add telemetry (opt-in)

## Dependencies

### Runtime Dependencies
- `lucide`: Icon library (currently in package.json but may not be needed with Codicons)

### Development Dependencies
- `@types/vscode`: VSCode API type definitions
- `@types/node`: Node.js type definitions
- `typescript`: TypeScript compiler
- `eslint`: Code linting
- `@vscode/vsce`: Extension packaging tool

## Platform Requirements

- **OS**: macOS (Darwin) - uses AppleScript
- **VSCode**: 1.85.0 or later
- **Cursor**: Any recent version
- **Node.js**: 20.x or later

## Notes

- The extension is designed for personal use and prioritizes macOS support
- AppleScript is used to avoid compiling native binaries
- Claude Code monitoring is heuristic-based and may need adjustments
- Config file watching uses VSCode's FileSystemWatcher
- All file operations handle ~ expansion for home directory
- Path normalization ensures consistent workspace matching
