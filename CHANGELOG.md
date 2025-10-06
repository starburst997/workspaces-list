# Changelog

All notable changes to the "Workspaces List" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release
- Multi-window workspace management for VSCode and Cursor
- macOS window detection via AppleScript
- Window focus switching
- Claude Code session status monitoring
- Customizable workspace icons (emoji, Codicons, SVG, file paths, URLs)
- Customizable workspace colors
- Custom workspace display names
- Focus-aware monitoring for performance optimization
- Real-time config file watching
- Automatic workspace discovery
- Tree view in sidebar
- Refresh command

### Features
- **Window Management**: Detects all open VSCode and Cursor windows
- **Claude Code Integration**: Monitors session status (Idle, Running, Waiting for Input)
- **Icon System**: Supports multiple icon formats for workspace customization
- **Performance**: Only monitors when window is focused
- **Configuration**: Per-workspace `.workspaces-list.json` config files

### Technical
- Written in TypeScript
- Uses VSCode Extension API
- AppleScript for macOS integration
- File system monitoring for Claude Code status
- Efficient caching system

## [0.1.0] - TBD

### Added
- Initial beta release

---

## Release Notes Format

### Added
New features that have been added.

### Changed
Changes in existing functionality.

### Deprecated
Features that will be removed in upcoming releases.

### Removed
Features that have been removed.

### Fixed
Bug fixes.

### Security
Security improvements or vulnerability fixes.
