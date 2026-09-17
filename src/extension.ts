import * as vscode from "vscode";
import { MockSessionsApi } from "./api/MockSessionsApi";
import type { SessionsApi } from "./api/SessionsApi";
import { workspaceCwd } from "./panel/PanelHost";
import { SidebarViewProvider } from "./panel/SidebarViewProvider";
import { WidePanel } from "./panel/WidePanel";

export function activate(context: vscode.ExtensionContext): void {
  // Swap this for the real backend once it exists. Nothing else changes.
  const api: SessionsApi = new MockSessionsApi(workspaceCwd());
  context.subscriptions.push({ dispose: () => api.dispose() });

  const openWide = () => WidePanel.show(context.extensionUri, api);
  const sidebar = new SidebarViewProvider(context.extensionUri, api, openWide);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("aiSessions.openAsTab", openWide),
    vscode.commands.registerCommand("aiSessions.newSession", async () => {
      await api.createSession({ provider: "claude", model: "claude-opus-5", effort: "high", mode: "code" }, workspaceCwd());
      sidebar.reveal();
    }),
    vscode.commands.registerCommand("aiSessions.showTodos", async () => {
      const todos = await api.listTodos();
      const picked = await vscode.window.showQuickPick(
        todos.map((t) => ({ label: `${t.done ? "$(check)" : "$(circle-large-outline)"} ${t.text}`, id: t.id })),
        { placeHolder: "Toggle a todo" },
      );
      if (picked) await api.toggleTodo(picked.id);
    }),
  );
}

export function deactivate(): void {}
