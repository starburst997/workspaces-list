# Contributing to Workspaces List

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

### Prerequisites
- macOS (required for development and testing)
- Node.js 20.x or later
- VSCode or Cursor
- Git

### Setup Development Environment

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/your-username/workspaces-list.git
   cd workspaces-list
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Compile the extension**
   ```bash
   npm run compile
   ```

4. **Start development**
   - Press `F5` in VSCode to launch the Extension Development Host
   - Or run `npm run watch` to automatically recompile on changes

## Development Workflow

### Running the Extension

1. Open the project in VSCode/Cursor
2. Press `F5` to start debugging
3. A new VSCode window will open with the extension loaded
4. Test your changes in the new window

### Making Changes

1. **Create a new branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Edit source files in `src/`
   - Follow the existing code style
   - Add comments for complex logic

3. **Test your changes**
   - Run the extension in debug mode (F5)
   - Test with multiple workspaces
   - Test Claude Code integration
   - Test different icon formats

4. **Lint your code**
   ```bash
   npm run lint
   ```

5. **Compile and check for errors**
   ```bash
   npm run compile
   ```

### Commit Guidelines

We follow conventional commits format:

```
type(scope): subject

body

footer
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding tests
- `chore`: Maintenance tasks

**Examples:**
```bash
git commit -m "feat(monitor): add support for custom cache directories"
git commit -m "fix(window): handle window titles with special characters"
git commit -m "docs(readme): add troubleshooting section"
```

## Code Style

### TypeScript Guidelines

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use meaningful variable names
- Add JSDoc comments for public methods
- Keep functions small and focused
- Use async/await over callbacks

### File Organization

```
src/
├── extension.ts              # Entry point
├── workspacesProvider.ts     # Main provider
├── macosWindowManager.ts     # Platform integration
├── configReader.ts           # Config handling
├── iconRenderer.ts           # Icon rendering
└── claudeCodeMonitor.ts      # Status monitoring
```

### Naming Conventions

- **Classes**: PascalCase (`MacOSWindowManager`)
- **Interfaces**: PascalCase with `I` prefix optional (`WorkspaceConfig`)
- **Functions**: camelCase (`getOpenWindows`)
- **Constants**: UPPER_SNAKE_CASE (`CACHE_DIRS`)
- **Private members**: Prefix with `_` (`_onDidChangeTreeData`)

## Testing

### Manual Testing Checklist

Before submitting a PR, please test:

- [ ] Extension activates without errors
- [ ] All workspaces are detected
- [ ] Window switching works correctly
- [ ] Custom icons display (all formats)
- [ ] Claude Code status updates
- [ ] Config file changes are detected
- [ ] Refresh button works
- [ ] No console errors

### Edge Cases to Test

- Workspaces with special characters
- Very long workspace names
- Missing config files
- Invalid JSON in config
- Multiple Claude Code sessions
- Rapid workspace switching

## Documentation

When adding new features:

1. **Update README.md** with user-facing changes
2. **Update CLAUDE.md** with technical details
3. **Add JSDoc comments** to new functions/classes
4. **Update configuration schema** if adding new config options

## Pull Request Process

1. **Update your branch**
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Push your changes**
   ```bash
   git push origin feature/your-feature-name
   ```

3. **Create a Pull Request**
   - Use a clear, descriptive title
   - Fill out the PR template completely
   - Link related issues
   - Add screenshots for UI changes
   - Request review from maintainers

4. **Address review feedback**
   - Make requested changes
   - Push updates to your branch
   - Respond to comments

5. **Merge**
   - Once approved, your PR will be merged
   - Delete your feature branch after merge

## Architecture Decisions

### Why AppleScript?
- No compiled binaries required
- Native macOS integration
- Simple window management
- Easy to maintain

### Why File-based Claude Monitoring?
- No official Claude Code API
- File system is reliable
- Minimal dependencies
- Works across all Claude Code versions

### Why Focus-aware Monitoring?
- Performance optimization
- Reduces system load
- Battery friendly
- Better user experience

## Common Tasks

### Adding a New Icon Format

1. Update `iconRenderer.ts`
2. Add detection logic
3. Add rendering logic
4. Update documentation
5. Add examples to README

### Adding a New Claude Code Status

1. Update `ClaudeCodeStatus` enum
2. Modify detection in `claudeCodeMonitor.ts`
3. Update status display in `workspacesProvider.ts`
4. Document in README

### Optimizing Performance

1. Profile with Chrome DevTools
2. Identify bottlenecks
3. Add caching where appropriate
4. Test with many workspaces
5. Document changes

## Release Process

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create a new release on GitHub
4. GitHub Actions will automatically publish

## Questions?

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones
- Join discussions in the Issues section
- Read the documentation in CLAUDE.md

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help others learn and grow

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Workspaces List!
