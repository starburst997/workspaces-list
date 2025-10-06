# Workspaces List

> Manage multiple VSCode/Cursor workspaces with Claude Code status monitoring

A powerful workspace management extension for macOS that displays all your open VSCode and Cursor windows in a convenient sidebar, with real-time Claude Code session monitoring.

## Features

### 🪟 Multi-Window Management

- **See all open workspaces** in a single sidebar view
- **Quick switching** between VSCode and Cursor windows with a single click
- **Automatic discovery** of all running editor instances

### 🤖 Claude Code Integration

- **Real-time status monitoring** of Claude Code sessions
- **Three status states**:
  - ⚠️ **Needs Attention**: Claude is waiting for your input or permission
  - 🔄 **Running**: Claude is actively processing a task
  - ✓ **Idle**: Claude is ready for your next prompt
- **Smart monitoring**: Only active when your window is focused (performance optimized)

### 🎨 Customizable Workspace Appearance

Personalize each workspace with a `.workspaces-list.json` config file:

```json
{
  "icon": "🚀",
  "color": "#FF6B6B",
  "displayName": "My Awesome Project"
}
```

**Icon Options:**

- **Emojis**: `"🚀"`, `"📦"`, `"💻"`
- **Codicons**: `"folder"`, `"file"`, `"git-branch"`
- **SVG Content**: `"<svg>...</svg>"`
- **File Paths**: `"./assets/icon.png"`, `"/absolute/path/icon.svg"`
- **URLs**: `"https://example.com/icon.png"`

## Requirements

- **macOS** (uses AppleScript for window management)
- **VSCode** 1.85.0 or later, or **Cursor** (any recent version)
- No additional software installation required!

## Installation

### From Marketplace

1. Open VSCode/Cursor
2. Go to Extensions (⌘+Shift+X)
3. Search for "Workspaces List"
4. Click Install

### From Source

```bash
git clone https://github.com/your-username/workspaces-list.git
cd workspaces-list
npm install
npm run compile
```

Then press F5 in VSCode to launch the extension in debug mode.

## Usage

### Basic Usage

1. **Open the Workspaces panel** from the Activity Bar (left sidebar)
2. **View all your open workspaces** - each entry shows:
   - Workspace name
   - Custom icon (if configured)
   - Claude Code status (if active)
3. **Click any workspace** to switch focus to that window
4. **Click the refresh button** to manually update the list

### Customizing a Workspace

Create a `.workspaces-list.json` file in your workspace root:

```json
{
  "icon": "🎨",
  "color": "#4ECDC4",
  "displayName": "Design System"
}
```

The extension will automatically detect changes to this file and update the display.

### Monitoring Claude Code

The extension automatically monitors Claude Code sessions in all your workspaces:

- **Running state**: Updates every 5 seconds while the window is focused
- **Status icons** show in the workspace description
- **Priority system**: "Needs Attention" takes precedence over "Running"

Perfect for managing multiple AI-assisted projects simultaneously!

## Commands

| Command                            | Description                  | Shortcut   |
| ---------------------------------- | ---------------------------- | ---------- |
| `Workspaces List: Refresh`         | Refresh the workspace list   | -          |
| `Workspaces List: Focus Workspace` | Switch to selected workspace | Click item |

## Extension Settings

This extension currently works out-of-the-box with no configuration needed. All customization is done per-workspace via `.workspaces-list.json` files.

## Performance

The extension is designed to be lightweight and efficient:

- **Focus-aware monitoring**: Only monitors Claude Code status when the window is focused
- **Efficient polling**: Updates every 5 seconds (status) and 2 seconds (focus detection)
- **Smart caching**: Configuration and status information is cached
- **Minimal AppleScript calls**: Window detection is optimized

## How It Works

### Window Detection

Uses macOS AppleScript to enumerate all VSCode and Cursor windows via System Events, without requiring a compiled binary.

### Workspace Identification

Extracts workspace paths from window titles using pattern matching for common formats.

### Claude Code Monitoring

Monitors Claude Code's conversation cache directories for recent activity:

- `~/.claude-code`
- `~/.config/claude-code`
- `~/Library/Application Support/claude-code`

Status is determined by analyzing conversation metadata and message timestamps.

## Known Limitations

- **macOS only**: Uses AppleScript for window management (Windows/Linux support planned)
- **Heuristic-based Claude monitoring**: Status detection uses file system monitoring and may not be 100% accurate in all scenarios
- **Requires window titles**: Workspace detection relies on VSCode/Cursor window title format

## Troubleshooting

### Workspaces not showing up?

- Ensure VSCode/Cursor windows are open
- Try clicking the refresh button
- Check that window titles include workspace names/paths

### Claude Code status not updating?

- Verify Claude Code cache directories exist
- Check that conversations are associated with the correct workspace
- Ensure the extension window is focused (monitoring pauses when unfocused)

### Icon not displaying?

- Verify `.workspaces-list.json` is in the workspace root
- Check JSON syntax is valid
- For file paths, ensure the icon file exists
- For URLs, ensure the image is accessible

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

```bash
git clone https://github.com/your-username/workspaces-list.git
cd workspaces-list
npm install
npm run compile
```

Press F5 to launch the extension in debug mode.

### Running Tests

```bash
npm test
```

## Roadmap

- [ ] Cross-platform support (Windows, Linux)
- [ ] Keyboard shortcuts for workspace switching
- [ ] Workspace grouping and categorization
- [ ] Git status integration
- [ ] Quick actions (open terminal, etc.)
- [ ] Configurable polling intervals
- [ ] Workspace search/filter

## License

MIT License - see [LICENSE](LICENSE) file for details

## Credits

Built with:

- [VSCode Extension API](https://code.visualstudio.com/api)
- AppleScript for macOS integration
- TypeScript

---

**Enjoy managing your workspaces!** If you find this extension helpful, please consider starring the repository and leaving a review.

## Support

- 🐛 [Report a bug](https://github.com/your-username/workspaces-list/issues)
- 💡 [Request a feature](https://github.com/your-username/workspaces-list/issues)
- 📖 [Read the documentation](CLAUDE.md)
