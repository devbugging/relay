import * as vscode from "vscode";
import type { SessionsApi } from "../api/SessionsApi";
import type { SessionOptions } from "../api/types";
import type { FromWebview, Layout, ToWebview, UiState } from "./protocol";

const OLDER_THRESHOLD_MS = 60 * 60 * 1000;

/**
 * Glue between one webview and the SessionsApi. The sidebar view and the
 * editor-tab panel each own one of these; the API is shared.
 */
export class PanelHost implements vscode.Disposable {
  private selectedSessionId: string | undefined;
  private showOlder = false;
  private disposables: vscode.Disposable[] = [];
  private pushQueued = false;

  constructor(
    private readonly webview: vscode.Webview,
    private readonly api: SessionsApi,
    private readonly layout: Layout,
    private readonly onOpenWide: () => void,
  ) {
    this.disposables.push(webview.onDidReceiveMessage((m: FromWebview) => void this.handle(m)));
    const unsubscribe = api.onDidChange(() => this.schedulePush());
    this.disposables.push({ dispose: unsubscribe });
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
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
    const [providers, sessions, todos] = await Promise.all([this.api.listProviders(), this.api.listSessions(), this.api.listTodos()]);
    if (!this.selectedSessionId || !sessions.some((s) => s.id === this.selectedSessionId)) {
      const first = [...sessions].sort((a, b) => rank(a.status) - rank(b.status) || b.lastActivityAt - a.lastActivityAt)[0];
      this.selectedSessionId = first ? first.id : undefined;
    }
    const [messages, plan] = this.selectedSessionId
      ? await Promise.all([this.api.getMessages(this.selectedSessionId), this.api.getPlan(this.selectedSessionId)])
      : [[], undefined];
    const state: UiState = {
      layout: this.layout,
      providers,
      sessions,
      selectedSessionId: this.selectedSessionId,
      messages,
      plan,
      todos,
      olderThresholdMs: OLDER_THRESHOLD_MS,
      showOlder: this.showOlder,
      now: Date.now(),
    };
    const msg: ToWebview = { type: "state", state };
    await this.webview.postMessage(msg);
  }

  private async handle(m: FromWebview): Promise<void> {
    switch (m.type) {
      case "ready":
        await this.push();
        return;
      case "selectSession":
        this.selectedSessionId = m.sessionId;
        await this.push();
        return;
      case "send": {
        let id = m.sessionId;
        if (!id) {
          const cwd = workspaceCwd();
          const created = await this.api.createSession(m.options, cwd);
          id = created.id;
          this.selectedSessionId = id;
        }
        await this.api.sendMessage(id, m.text, m.options);
        return;
      }
      case "newSession": {
        const options: SessionOptions = { provider: "claude", model: "claude-opus-5", effort: "high", mode: "code" };
        const created = await this.api.createSession(options, workspaceCwd());
        this.selectedSessionId = created.id;
        await this.push();
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
      case "toggleOlder":
        this.showOlder = !this.showOlder;
        await this.push();
        return;
      case "openWide":
        this.onOpenWide();
        return;
      case "openTranscript": {
        const sessions = await this.api.listSessions();
        const s = sessions.find((x) => x.id === m.sessionId);
        void vscode.window.showInformationMessage(s ? `Transcript: ${s.transcriptPath}` : "No transcript yet.");
        return;
      }
      case "openPlan": {
        const plan = await this.api.getPlan(m.sessionId);
        void vscode.window.showInformationMessage(plan ? `Plan: ${plan.path}` : "No plan for this session.");
        return;
      }
      case "addTodo":
        await this.api.addTodo(m.text, m.sourceSessionId);
        return;
      case "toggleTodo":
        await this.api.toggleTodo(m.todoId);
        return;
      case "removeTodo":
        await this.api.removeTodo(m.todoId);
        return;
    }
  }
}

function rank(status: string): number {
  switch (status) {
    case "waiting":
      return 0;
    case "running":
      return 1;
    default:
      return 2;
  }
}

export function workspaceCwd(): string {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length ? folders[0].uri.fsPath : process.cwd();
}
