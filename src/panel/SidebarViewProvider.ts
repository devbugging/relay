import * as vscode from "vscode";
import type { SessionsApi } from "../api/SessionsApi";
import { buildHtml } from "./html";
import { PanelHost } from "./PanelHost";

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "aiSessions.sidebar";
  private host: PanelHost | undefined;
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly api: SessionsApi,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist")] };
    view.webview.html = buildHtml(view.webview, this.extensionUri, "sidebar");
    const host = new PanelHost(view.webview, this.api, "sidebar", () => view.visible);
    this.host = host;
    // A session that finished while hidden is marked seen once the view shows again.
    const visibility = view.onDidChangeVisibility(() => {
      if (view.visible) host.refresh();
    });
    view.onDidDispose(() => {
      visibility.dispose();
      host.dispose();
      this.host = undefined;
      this.view = undefined;
    });
  }

  startNew(): void {
    if (this.view) this.view.show(true);
    if (this.host) this.host.startNew();
  }
}
