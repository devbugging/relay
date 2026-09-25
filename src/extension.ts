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

  const sidebar = new SidebarViewProvider(context.extensionUri, api);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("aiSessions.openAsTab", () => WidePanel.show(context.extensionUri, api)),
    vscode.commands.registerCommand("aiSessions.newSession", () => {
      if (!WidePanel.startNew()) sidebar.startNew();
    }),
  );
}

export function deactivate(): void {}
