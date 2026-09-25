import * as vscode from "vscode";
import type { SessionsApi } from "../api/SessionsApi";
import { buildHtml } from "./html";
import { PanelHost } from "./PanelHost";

/** Sessions on the left, the open session on the right, as an editor tab. One at a time. */
export class WidePanel {
  private static current: WidePanel | undefined;

  static show(extensionUri: vscode.Uri, api: SessionsApi): void {
    if (WidePanel.current) {
      WidePanel.current.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel("aiSessions.wide", "AI Sessions", vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist")],
    });
    panel.iconPath = vscode.Uri.joinPath(extensionUri, "media", "activity.svg");
    WidePanel.current = new WidePanel(panel, extensionUri, api);
  }

  static startNew(): boolean {
    if (!WidePanel.current || !WidePanel.current.panel.visible) return false;
    WidePanel.current.host.startNew();
    return true;
  }

  private readonly host: PanelHost;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    api: SessionsApi,
  ) {
    panel.webview.html = buildHtml(panel.webview, extensionUri, "wide");
    this.host = new PanelHost(panel.webview, api, "wide", () => panel.visible);
    // A session that finished while the tab was in the background is marked seen once it shows again.
    panel.onDidChangeViewState(() => {
      if (panel.visible) this.host.refresh();
    });
    panel.onDidDispose(() => {
      this.host.dispose();
      WidePanel.current = undefined;
    });
  }
}
