import * as vscode from "vscode"
import { WorkspacesProvider, WorkspaceItem } from "./workspacesProvider"
import { ClaudeCodeDecorator } from "./claudeCodeDecorator"

export async function activate(context: vscode.ExtensionContext) {
  console.log("Workspaces List extension is now active")

  // Create the decorator
  const decorator = new ClaudeCodeDecorator()

  // Register the file decoration provider
  const decorationProvider = vscode.window.registerFileDecorationProvider(
    decorator,
  )

  // Create the tree data provider
  const workspacesProvider = new WorkspacesProvider(context, decorator)

  // Register the tree view
  const treeView = vscode.window.createTreeView("workspacesList", {
    treeDataProvider: workspacesProvider,
    showCollapseAll: true,
  })

  // Register refresh command
  const refreshCommand = vscode.commands.registerCommand(
    "workspacesList.refresh",
    () => {
      workspacesProvider.refresh()
    },
  )

  // Register focus workspace command
  const focusCommand = vscode.commands.registerCommand(
    "workspacesList.focusWorkspace",
    (item: WorkspaceItem) => {
      workspacesProvider.focusWorkspace(item)
    },
  )

  context.subscriptions.push(
    treeView,
    refreshCommand,
    focusCommand,
    decorationProvider,
    decorator,
  )

  // Initial refresh - wait for it to complete before continuing
  await workspacesProvider.refresh()
}

export function deactivate() {
  console.log("Workspaces List extension is now deactivated")
}
