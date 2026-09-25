import * as vscode from "vscode";
import { createMockSessionsApi } from "./api/MockSessionsApi";
import type { SessionsApi } from "./api/SessionsApi";
import { ClaudeAdapter } from "./backend/claude";
import { KeepAwake } from "./backend/keepAwake";
import { RealSessionsApi } from "./backend/RealSessionsApi";
import { SessionStore } from "./backend/store";
import { keepAwakeEnabled, workspaceCwd } from "./panel/PanelHost";
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

  watchKeepAwake(context, api);

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

/** Holds the computer awake while any session is running, unless turned off. */
function watchKeepAwake(context: vscode.ExtensionContext, api: SessionsApi): void {
  const keepAwake = new KeepAwake();
  let queued = false;
  // Changes fire on every streamed token; checking twice a second is plenty.
  const update = () => {
    if (queued) return;
    queued = true;
    setTimeout(async () => {
      queued = false;
      const running = (await api.listSessions()).some((s) => s.status === "running");
      keepAwake.set(running && keepAwakeEnabled());
    }, 500);
  };
  const unsubscribe = api.onDidChange(update);
  context.subscriptions.push(
    keepAwake,
    { dispose: unsubscribe },
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("aiSessions.keepAwake")) update();
    }),
  );
}

export function deactivate(): void {}
