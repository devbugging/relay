import * as vscode from "vscode";
import type { SessionsApi } from "../api/SessionsApi";
import { buildHtml } from "./html";
import { PanelHost } from "./PanelHost";

/** The wide, three-column layout opened as an editor tab. One at a time. */
export class WidePanel {
  private static current: WidePanel | undefined;

  static show(extensionUri: vscode.Uri, api: SessionsApi): void {
    if (WidePanel.current) {
      WidePanel.current.panel.reveal(vscode.ViewColumn.One);
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

  private readonly host: PanelHost;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    api: SessionsApi,
  ) {
    panel.webview.html = buildHtml(panel.webview, extensionUri, "wide");
    this.host = new PanelHost(panel.webview, api, "wide", () => panel.reveal());
    panel.onDidDispose(() => {
      this.host.dispose();
      WidePanel.current = undefined;
    });
  }
}
