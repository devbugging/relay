import * as vscode from "vscode";
import { createMockSessionsApi } from "./api/MockSessionsApi";
import type { SessionsApi } from "./api/SessionsApi";
import { ClaudeAdapter } from "./backend/claude";
import { RealSessionsApi } from "./backend/RealSessionsApi";
import { SessionStore } from "./backend/store";
import { workspaceCwd } from "./panel/PanelHost";
import { SidebarViewProvider } from "./panel/SidebarViewProvider";
import { WidePanel } from "./panel/WidePanel";

function setting(key: string): string | undefined {
  const value = vscode.workspace.getConfiguration("aiSessions").get<string>(key);
  return value ? value : undefined;
}

async function createApi(context: vscode.ExtensionContext): Promise<SessionsApi> {
  if (setting("backend") === "mock") return createMockSessionsApi(workspaceCwd());
  const store = new SessionStore(vscode.Uri.joinPath(context.globalStorageUri, "sessions.json").fsPath);
  await store.load();
  return new RealSessionsApi(store, [new ClaudeAdapter(() => setting("claudePath"))]);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const api = await createApi(context);
  context.subscriptions.push({ dispose: () => api.dispose() });

  const sidebar = new SidebarViewProvider(context.extensionUri, api);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("aiSessions.openAsTab", () => WidePanel.show(context.extensionUri, api)),
    vscode.commands.registerCommand("aiSessions.newSession", () => {
      if (!WidePanel.startNew()) sidebar.startNew();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("aiSessions.backend")) {
        void vscode.window.showInformationMessage("Reload the window to switch the AI Sessions backend.", "Reload").then((pick) => {
          if (pick) void vscode.commands.executeCommand("workbench.action.reloadWindow");
        });
      }
    }),
  );
}

export function deactivate(): void {}
