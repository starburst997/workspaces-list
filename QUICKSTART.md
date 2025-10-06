# Quick Start Guide

Get up and running with Workspaces List in under 5 minutes!

## Installation

### Development Mode (For Testing)

1. **Clone and install**

   ```bash
   cd /Users/jdboivin/Projects/workspaces-list
   npm install
   npm run compile
   ```

2. **Launch the extension**

   - Open the project in VSCode/Cursor
   - Press `F5` to launch Extension Development Host
   - A new window will open with the extension loaded

3. **View your workspaces**
   - Look for the "Workspaces" icon in the Activity Bar (left sidebar)
   - Click it to see all your open workspaces

### Production Installation (After Publishing)

1. Open VSCode/Cursor
2. Press `Cmd+Shift+X` to open Extensions
3. Search for "Workspaces List"
4. Click Install

## First Steps

### 1. Open Multiple Workspaces

Open several VSCode or Cursor windows with different projects:

```bash
code /path/to/project1
code /path/to/project2
code /path/to/project3
```

### 2. View Workspaces List

1. Click the Workspaces icon in the Activity Bar
2. You should see all your open workspaces listed
3. Click any workspace to switch focus to that window

### 3. Customize a Workspace (Optional)

Create a `.workspaces-list.json` file in any workspace root:

```json
{
  "icon": "🚀",
  "color": "#FF6B6B",
  "displayName": "My Awesome Project"
}
```

Save the file and the workspace list will automatically update!

## Testing Claude Code Integration

### 1. Start Claude Code in a Workspace

```bash
cd /path/to/your/project
claude-code
```

### 2. Give Claude a Task

In the Claude Code session:

```
Please create a new function that calculates fibonacci numbers
```

### 3. Watch the Status Update

Switch back to your workspace list - you should see:

- 🔄 **Running** while Claude is working
- ⚠️ **Needs Attention** if Claude needs permission
- ✓ **Idle** when Claude is done

## Icon Examples

Try different icon types in your `.workspaces-list.json`:

### Emoji

```json
{
  "icon": "🚀"
}
```

### Codicon

```json
{
  "icon": "folder-active"
}
```

### SVG Content

```json
{
  "icon": "<svg width='16' height='16'><circle cx='8' cy='8' r='8' fill='red'/></svg>"
}
```

### File Path

```json
{
  "icon": "./assets/my-icon.png"
}
```

### URL

```json
{
  "icon": "https://example.com/icon.png"
}
```

## Common Commands

| Action                 | Command                                   |
| ---------------------- | ----------------------------------------- |
| Refresh workspace list | Click the refresh button in the tree view |
| Switch to workspace    | Click the workspace in the list           |
| Open Developer Console | `Cmd+Opt+I` (to see logs)                 |

## Troubleshooting

### No workspaces showing?

- Make sure you have VSCode/Cursor windows open
- Click the refresh button
- Check the Developer Console for errors

### Claude Code status not updating?

- Ensure Claude Code is actually running in a workspace
- Check that the extension window is focused (monitoring pauses when unfocused)
- Wait a few seconds for the polling cycle

### Icons not working?

- Verify your JSON syntax is valid
- Make sure file paths are correct
- Check Developer Console for errors

## Next Steps

- Read the full [README.md](README.md) for detailed features
- Check [CLAUDE.md](CLAUDE.md) for technical architecture
- See [CONTRIBUTING.md](CONTRIBUTING.md) if you want to contribute

## Need Help?

- 🐛 [Report a bug](https://github.com/your-username/workspaces-list/issues)
- 💡 [Request a feature](https://github.com/your-username/workspaces-list/issues)
- 📖 [Read the docs](README.md)

---

**Happy workspace managing!** 🚀
