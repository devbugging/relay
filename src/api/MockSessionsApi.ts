import type { SessionsApi, Unsubscribe } from "./SessionsApi";
import { isActive, type ApprovalDecision, type Message, type ProviderInfo, type Session, type SessionOptions, type ToolEvent } from "./types";

const MIN = 60_000;

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}`;
}

const PROVIDERS: ProviderInfo[] = [
  {
    id: "claude",
    label: "Claude",
    models: [
      { id: "claude-opus-5", label: "Opus 5" },
      { id: "claude-sonnet-5", label: "Sonnet 5" },
      { id: "claude-haiku-4-5", label: "Haiku 4.5" },
    ],
    efforts: ["low", "medium", "high", "xhigh", "max"],
  },
  {
    id: "codex",
    label: "Codex",
    models: [
      { id: "gpt-5.5", label: "gpt-5.5" },
      { id: "gpt-5.5-mini", label: "gpt-5.5-mini" },
    ],
    efforts: ["low", "medium", "high", "xhigh"],
  },
];

const STREAM_TEXT =
  "Looking at how sections are declared in the schema. The nested validator needs to walk each section recursively and collect unknown keys with their full path, so the error message points at the exact location.";

/**
 * In-memory backend with a handful of sessions in every state. Running
 * sessions stream text word by word and finish on their own, so the UI can be
 * exercised without any real agent.
 */
export class MockSessionsApi implements SessionsApi {
  private sessions = new Map<string, Session>();
  private messages = new Map<string, Message[]>();
  private listeners = new Set<() => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private disposed = false;

  constructor(private readonly cwd: string) {
    this.seed();
  }

  // -- reads ---------------------------------------------------------------

  async listProviders(): Promise<ProviderInfo[]> {
    return PROVIDERS;
  }

  async listSessions(): Promise<Session[]> {
    return [...this.sessions.values()].map((s) => ({ ...s }));
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    return (this.messages.get(sessionId) || []).map((m) => ({ ...m }));
  }

  // -- writes --------------------------------------------------------------

  async createSession(options: SessionOptions, cwd: string): Promise<Session> {
    const now = Date.now();
    const session: Session = {
      id: nextId("s"),
      title: "New session",
      status: "done",
      options,
      cwd,
      folder: cwd.split("/").pop() || cwd,
      createdAt: now,
      lastActivityAt: now,
      unread: false,
      archived: false,
      transcriptPath: `${cwd}/.ai/sessions/${now}.jsonl`,
    };
    this.sessions.set(session.id, session);
    this.messages.set(session.id, []);
    this.emit();
    return session;
  }

  async sendMessage(sessionId: string, text: string, options?: Partial<SessionOptions>): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const list = this.messages.get(sessionId) || [];
    if (options) session.options = { ...session.options, ...options };
    session.unread = false;
    if (list.length === 0) session.title = text.length > 48 ? text.slice(0, 45) + "…" : text;
    list.push({ id: nextId("m"), role: "user", text, createdAt: Date.now() });
    this.messages.set(sessionId, list);
    for (let s: Session | undefined = session; s; s = s.parentId ? this.sessions.get(s.parentId) : undefined) {
      s.archived = false;
    }
    this.touch(session, "running");
    this.streamReply(sessionId, STREAM_TEXT);
  }

  async forkSession(sessionId: string, fromMessageId?: string): Promise<Session> {
    const parent = this.sessions.get(sessionId);
    if (!parent) throw new Error(`No session ${sessionId}`);
    const parentMessages = this.messages.get(sessionId) || [];
    const cut = fromMessageId ? parentMessages.findIndex((m) => m.id === fromMessageId) : parentMessages.length - 1;
    const kept = parentMessages.slice(0, cut + 1).map((m) => ({ ...m, streaming: false }));
    const now = Date.now();
    const fork: Session = {
      ...parent,
      id: nextId("s"),
      title: `Fork of ${parent.title}`,
      status: "done",
      createdAt: now,
      lastActivityAt: now,
      unread: false,
      archived: false,
      parentId: parent.id,
      forkedFromMessageId: kept.length ? kept[kept.length - 1].id : undefined,
      forkedFromIndex: kept.length,
      pendingApproval: undefined,
      transcriptPath: `${parent.cwd}/.ai/sessions/${now}.jsonl`,
    };
    this.sessions.set(fork.id, fork);
    this.messages.set(fork.id, kept);
    this.emit();
    return fork;
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.pendingApproval = undefined;
    const list = this.messages.get(sessionId) || [];
    const last = list[list.length - 1];
    if (last && last.streaming) last.streaming = false;
    this.touch(session, "done");
  }

  async respondToApproval(sessionId: string, decision: ApprovalDecision): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.pendingApproval) return;
    const approval = session.pendingApproval;
    session.pendingApproval = undefined;
    const list = this.messages.get(sessionId) || [];
    if (decision === "deny") {
      list.push({ id: nextId("m"), role: "assistant", text: "Understood, skipping that command.", createdAt: Date.now() });
      this.touch(session, "done");
      return;
    }
    const tool: ToolEvent = { id: nextId("t"), kind: "run", label: "Ran", target: approval.detail, detail: "exit 0", ok: true };
    list.push({ id: nextId("m"), role: "assistant", text: "", createdAt: Date.now(), tools: [tool] });
    this.touch(session, "running");
    this.streamReply(sessionId, "Migration applied. Running the test suite against the new schema now.");
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.title = title;
    this.emit();
  }

  async markSeen(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.unread) return;
    session.unread = false;
    session.seenAt = Date.now();
    this.emit();
  }

  async archiveSession(sessionId: string): Promise<void> {
    const archive = (id: string) => {
      const s = this.sessions.get(id);
      if (!s) return;
      if (!isActive(s)) {
        s.archived = true;
        s.unread = false;
      }
      for (const child of this.sessions.values()) if (child.parentId === id) archive(child.id);
    };
    archive(sessionId);
    this.emit();
  }

  onDidChange(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.listeners.clear();
  }

  // -- internals -----------------------------------------------------------

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private touch(session: Session, status: Session["status"]): void {
    const wasActive = isActive(session);
    const nowFinished = status === "done" || status === "failed";
    if (wasActive && nowFinished) session.unread = true;
    session.status = status;
    session.lastActivityAt = Date.now();
    this.emit();
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.disposed) fn();
    }, ms);
    this.timers.add(t);
  }

  /** Appends an assistant message and reveals it a few words at a time. */
  private streamReply(sessionId: string, fullText: string, stepMs = 180): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const list = this.messages.get(sessionId) || [];
    const msg: Message = { id: nextId("m"), role: "assistant", text: "", createdAt: Date.now(), streaming: true };
    list.push(msg);
    const words = fullText.split(" ");
    let i = 0;
    const step = () => {
      const s = this.sessions.get(sessionId);
      if (!s || s.status !== "running") return;
      i += 2;
      msg.text = words.slice(0, i).join(" ");
      s.lastActivityAt = Date.now();
      if (i >= words.length) {
        msg.text = fullText;
        msg.streaming = false;
        this.touch(s, "done");
        return;
      }
      this.emit();
      this.later(stepMs + Math.random() * 140, step);
    };
    this.later(400, step);
  }

  private seed(): void {
    const now = Date.now();
    const cwd = this.cwd;
    const folder = cwd.split("/").pop() || cwd;
    const base = (id: string, provider: Session["options"]["provider"], model: string) => ({
      id,
      options: { provider, model, effort: "medium" as const },
      cwd,
      folder,
      unread: false,
      archived: false,
      transcriptPath: `${cwd}/.ai/sessions/${id}.jsonl`,
    });
    const put = (s: Session, msgs: Message[]) => {
      this.sessions.set(s.id, s);
      this.messages.set(s.id, msgs);
      return s;
    };

    // Working: a running session with a running fork, and one waiting for approval.
    const parse = put(
      {
        ...base("s-parse", "claude", "claude-opus-5"),
        title: "Refactor parseConfig to throw on unknown keys",
        status: "running",
        createdAt: now - 2 * MIN - 14_000,
        lastActivityAt: now,
      },
      [
        { id: "m-p1", role: "user", text: "Implement parseConfig() in src/config.ts. Unknown keys should throw, not warn.", createdAt: now - 2 * MIN },
        {
          id: "m-p2",
          role: "assistant",
          text: "I'll add a strict parser. Reading the current file first.",
          createdAt: now - 2 * MIN + 5000,
          tools: [
            { id: "t1", kind: "read", label: "Read", target: "src/config.ts" },
            { id: "t2", kind: "edit", label: "Edited", target: "src/config.ts", added: 42, removed: 3 },
            { id: "t3", kind: "run", label: "Ran", target: "npm test", detail: "12 passed", ok: true },
          ],
        },
        {
          id: "m-p3",
          role: "assistant",
          text: "Done. parseConfig now throws ConfigError listing every unknown key, and the tests cover nested sections.",
          createdAt: now - MIN - 20_000,
        },
        { id: "m-p4", role: "user", text: "Good. Now handle the nested sections validation you skipped.", createdAt: now - 30_000 },
      ],
    );
    this.streamReply(parse.id, STREAM_TEXT, 600);

    const loadenv = put(
      {
        ...base("s-loadenv", "codex", "gpt-5.5"),
        title: "Change loadEnv to use parseConfig",
        status: "running",
        createdAt: now - 41_000,
        lastActivityAt: now,
        parentId: parse.id,
        forkedFromMessageId: "m-p3",
        forkedFromIndex: 3,
      },
      [
        { id: "m-l1", role: "user", text: "Now also make loadEnv() go through parseConfig so both paths validate the same way.", createdAt: now - 41_000 },
        {
          id: "m-l2",
          role: "assistant",
          text: "Reading loadEnv and its callers.",
          createdAt: now - 35_000,
          tools: [
            { id: "t4", kind: "read", label: "Read", target: "src/env.ts" },
            { id: "t5", kind: "read", label: "Read", target: "src/index.ts" },
          ],
        },
      ],
    );
    this.streamReply(loadenv.id, "loadEnv now builds a raw object from process.env and hands it to parseConfig, so unknown keys fail the same way in both paths.", 350);

    put(
      {
        ...base("s-migrate", "codex", "gpt-5.5"),
        title: "Migrate rollouts to sqlite",
        status: "waiting",
        createdAt: now - 6 * MIN,
        lastActivityAt: now - 40_000,
        pendingApproval: { kind: "bash", summary: "wants to run a command", detail: "npm run db:migrate -- --to latest" },
      },
      [
        { id: "m-g1", role: "user", text: "Move rollout state from the JSON file into sqlite.", createdAt: now - 6 * MIN },
        {
          id: "m-g2",
          role: "assistant",
          text: "Schema and migration are written. I need to run the migration to check it applies cleanly.",
          createdAt: now - 40_000,
          tools: [{ id: "t6", kind: "write", label: "Wrote", target: "migrations/004_rollouts.sql", added: 31, removed: 0 }],
        },
      ],
    );

    // Ready to review: finished, not opened yet. One has a fork that was already read.
    const mock = put(
      {
        ...base("s-mock", "claude", "claude-sonnet-5"),
        title: "Session panel mock in HTML",
        status: "done",
        unread: true,
        createdAt: now - 25 * MIN,
        lastActivityAt: now - 4 * MIN,
      },
      [
        { id: "m-m1", role: "user", text: "Make a simple mock of the sessions panel in HTML and CSS.", createdAt: now - 25 * MIN },
        { id: "m-m2", role: "assistant", text: "Two artboards: the sidebar with chat, and the sidebar with past sessions expanded.", createdAt: now - 4 * MIN },
      ],
    );
    put(
      {
        ...base("s-mock-grid", "claude", "claude-sonnet-5"),
        title: "Try alternative with grid layout",
        status: "done",
        createdAt: now - 9 * MIN,
        lastActivityAt: now - 6 * MIN,
        parentId: mock.id,
        forkedFromMessageId: "m-m2",
        forkedFromIndex: 2,
      },
      [
        { id: "m-mg1", role: "user", text: "Same thing but with a CSS grid instead of flex.", createdAt: now - 9 * MIN },
        { id: "m-mg2", role: "assistant", text: "Grid version done, it lines up the fork tree columns better.", createdAt: now - 6 * MIN },
      ],
    );
    put(
      {
        ...base("s-lint", "codex", "gpt-5.5-mini"),
        title: "Fix eslint warnings in webview",
        status: "failed",
        unread: true,
        createdAt: now - 18 * MIN,
        lastActivityAt: now - 11 * MIN,
      },
      [
        { id: "m-e1", role: "user", text: "Clear the eslint warnings under src/webview.", createdAt: now - 18 * MIN },
        { id: "m-e2", role: "assistant", text: "Stopped: eslint is not installed in this project, and I was told not to add dependencies.", createdAt: now - 11 * MIN },
      ],
    );

    // Past: opened, not completed. Two inside the 2 hour window, the rest older.
    const past: Array<[string, string, Session["options"]["provider"], number, Session["status"], boolean]> = [
      ["s-rtsp", "Fix RTSP camera timeout", "codex", 38, "done", false],
      ["s-readme", "Rewrite README intro", "claude", 95, "done", false],
      ["s-adr", "Write ADR for session storage", "claude", 50, "done", true],
      ["s-o1", "Plan: instagram comment feed", "claude", 3 * 60, "done", false],
      ["s-o2", "Replace Nacrt with Projektni Pogoji", "codex", 27 * 60, "done", false],
      ["s-o3", "Talk: agent0 architecture options", "claude", 2 * 24 * 60, "done", true],
      ["s-o4", "Lighthouse fixes for landing", "claude", 3 * 24 * 60, "failed", false],
    ];
    for (const [id, title, provider, minutesAgo, status, archived] of past) {
      put(
        {
          ...base(id, provider, provider === "claude" ? "claude-sonnet-5" : "gpt-5.5"),
          title,
          status,
          archived,
          createdAt: now - minutesAgo * MIN - 10 * MIN,
          lastActivityAt: now - minutesAgo * MIN,
        },
        [
          { id: `${id}-u`, role: "user", text: title, createdAt: now - minutesAgo * MIN - 10 * MIN },
          { id: `${id}-a`, role: "assistant", text: status === "failed" ? "Stopped: the build failed before the audit could run." : "Done.", createdAt: now - minutesAgo * MIN },
        ],
      );
    }
  }
}
