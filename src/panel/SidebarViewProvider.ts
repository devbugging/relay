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
    private readonly onOpenWide: () => void,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist")] };
    view.webview.html = buildHtml(view.webview, this.extensionUri, "sidebar");
    this.host = new PanelHost(view.webview, this.api, "sidebar", this.onOpenWide);
    view.onDidDispose(() => {
      if (this.host) this.host.dispose();
      this.host = undefined;
      this.view = undefined;
    });
  }

  reveal(): void {
    if (this.view) this.view.show(true);
  }
}
