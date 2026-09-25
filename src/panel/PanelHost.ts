import * as vscode from "vscode";
import type { SessionsApi } from "../api/SessionsApi";
import { isActive } from "../api/types";
import type { FromWebview, Layout, ToWebview, UiState } from "./protocol";

const PAST_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Glue between one webview and the SessionsApi. The sidebar view and the
 * editor-tab panel each own one of these; the API is shared.
 */
export class PanelHost implements vscode.Disposable {
  private selectedSessionId: string | undefined;
  private showAllPast = false;
  private disposables: vscode.Disposable[] = [];
  private pushQueued = false;

  constructor(
    private readonly webview: vscode.Webview,
    private readonly api: SessionsApi,
    private readonly layout: Layout,
    private readonly isVisible: () => boolean,
  ) {
    this.disposables.push(webview.onDidReceiveMessage((m: FromWebview) => void this.handle(m)));
    const unsubscribe = api.onDidChange(() => this.schedulePush());
    this.disposables.push({ dispose: unsubscribe });
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  /** Clears the selection so the next message starts a new session. */
  startNew(): void {
    this.selectedSessionId = undefined;
    void this.push().then(() => this.post({ type: "focusInput" }));
  }

  refresh(): void {
    this.schedulePush();
  }

  private post(msg: ToWebview): Thenable<boolean> {
    return this.webview.postMessage(msg);
  }

  private schedulePush(): void {
    if (this.pushQueued) return;
    this.pushQueued = true;
    setTimeout(() => {
      this.pushQueued = false;
      void this.push();
    }, 40);
  }

  private async push(): Promise<void> {
    const [providers, sessions] = await Promise.all([this.api.listProviders(), this.api.listSessions()]);
    if (this.selectedSessionId && !sessions.some((s) => s.id === this.selectedSessionId)) {
      this.selectedSessionId = undefined;
    }
    const selected = sessions.find((s) => s.id === this.selectedSessionId);
    // Looking at a finished session counts as having checked its output.
    if (selected && selected.unread && !isActive(selected) && this.isVisible()) {
      selected.unread = false;
      await this.api.markSeen(selected.id);
    }
    const messages = this.selectedSessionId ? await this.api.getMessages(this.selectedSessionId) : [];
    const state: UiState = {
      layout: this.layout,
      providers,
      sessions,
      selectedSessionId: this.selectedSessionId,
      messages,
      pastWindowMs: PAST_WINDOW_MS,
      showAllPast: this.showAllPast,
      now: Date.now(),
    };
    await this.post({ type: "state", state });
  }

  private async handle(m: FromWebview): Promise<void> {
    switch (m.type) {
      case "ready": {
        // Open on the most recent working session, never on an unread one.
        const sessions = await this.api.listSessions();
        const working = sessions.filter(isActive).sort((a, b) => b.lastActivityAt - a.lastActivityAt)[0];
        if (!this.selectedSessionId && working) this.selectedSessionId = working.id;
        await this.push();
        return;
      }
      case "selectSession":
        this.selectedSessionId = m.sessionId;
        await this.push();
        return;
      case "newSession":
        this.startNew();
        return;
      case "send": {
        let id = m.sessionId;
        if (!id) {
          const created = await this.api.createSession(m.options, workspaceCwd());
          id = created.id;
          this.selectedSessionId = id;
        }
        await this.api.sendMessage(id, m.text, m.options);
        return;
      }
      case "fork": {
        const fork = await this.api.forkSession(m.sessionId, m.messageId);
        this.selectedSessionId = fork.id;
        await this.push();
        return;
      }
      case "stop":
        await this.api.stopSession(m.sessionId);
        return;
      case "approve":
        await this.api.respondToApproval(m.sessionId, m.decision);
        return;
      case "complete":
        await this.api.archiveSession(m.sessionId);
        return;
      case "toggleAllPast":
        this.showAllPast = !this.showAllPast;
        await this.push();
        return;
    }
  }
}

export function workspaceCwd(): string {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length ? folders[0].uri.fsPath : process.cwd();
}
