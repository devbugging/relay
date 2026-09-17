import type { SessionsApi, Unsubscribe } from "./SessionsApi";
import type {
  ApprovalDecision,
  Message,
  Plan,
  ProviderInfo,
  Session,
  SessionOptions,
  Todo,
  ToolEvent,
} from "./types";

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
  private plans = new Map<string, Plan>();
  private todos: Todo[] = [];
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

  async getPlan(sessionId: string): Promise<Plan | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const root = session.parentId && this.plans.has(session.parentId) ? session.parentId : sessionId;
    return this.plans.get(root);
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
    if (list.length === 0) session.title = text.length > 48 ? text.slice(0, 45) + "…" : text;
    list.push({ id: nextId("m"), role: "user", text, createdAt: Date.now() });
    this.messages.set(sessionId, list);
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
      parentId: parent.id,
      forkedFromMessageId: kept.length ? kept[kept.length - 1].id : undefined,
      forkedFromIndex: kept.length,
      pendingApproval: undefined,
      role: undefined,
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
    this.streamReply(sessionId, "Worktree created. Continuing with the spawn logic now that each worker has its own checkout.");
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.title = title;
    this.emit();
  }

  async listTodos(): Promise<Todo[]> {
    return this.todos.map((t) => ({ ...t }));
  }

  async addTodo(text: string, sourceSessionId?: string): Promise<Todo> {
    const todo: Todo = { id: nextId("todo"), text, done: false, createdAt: Date.now(), sourceSessionId };
    this.todos.unshift(todo);
    this.emit();
    return todo;
  }

  async toggleTodo(todoId: string): Promise<void> {
    const todo = this.todos.find((t) => t.id === todoId);
    if (!todo) return;
    todo.done = !todo.done;
    this.emit();
  }

  async removeTodo(todoId: string): Promise<void> {
    this.todos = this.todos.filter((t) => t.id !== todoId);
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
  private streamReply(sessionId: string, fullText: string): void {
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
      this.later(180 + Math.random() * 140, step);
    };
    this.later(400, step);
  }

  private seed(): void {
    const now = Date.now();
    const cwd = this.cwd;
    const folder = cwd.split("/").pop() || cwd;
    const put = (s: Session, msgs: Message[]) => {
      this.sessions.set(s.id, s);
      this.messages.set(s.id, msgs);
      return s;
    };

    // Running session with a fork.
    const running = put(
      {
        id: "s-parse",
        title: "Refactor parseConfig to throw on unknown keys",
        status: "running",
        options: { provider: "claude", model: "claude-opus-5", effort: "high", mode: "code" },
        cwd,
        folder,
        createdAt: now - 2 * MIN - 14_000,
        lastActivityAt: now,
        transcriptPath: `${cwd}/.ai/sessions/s-parse.jsonl`,
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
    this.streamReply(running.id, STREAM_TEXT);

    put(
      {
        id: "s-loadenv",
        title: "Change loadEnv to use parseConfig",
        status: "running",
        options: { provider: "codex", model: "gpt-5.5", effort: "medium", mode: "code" },
        cwd,
        folder,
        createdAt: now - 41_000,
        lastActivityAt: now,
        parentId: running.id,
        forkedFromMessageId: "m-p3",
        forkedFromIndex: 12,
        transcriptPath: `${cwd}/.ai/sessions/s-loadenv.jsonl`,
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
          streaming: true,
        },
      ],
    );

    // Feature-mode session waiting for approval, with workers.
    const feature = put(
      {
        id: "s-feature",
        title: "Feature: worktree per worker",
        status: "waiting",
        options: { provider: "codex", model: "gpt-5.5", effort: "high", mode: "feature" },
        cwd,
        folder,
        createdAt: now - 14 * MIN,
        lastActivityAt: now - 40_000,
        pendingApproval: {
          kind: "bash",
          summary: "worker 2 wants to run a command",
          detail: "git worktree add ../ai-dev-w2 -b feat/worker-2",
        },
        transcriptPath: `${cwd}/.ai/sessions/s-feature.jsonl`,
      },
      [
        {
          id: "m-f1",
          role: "user",
          text: "Each feature worker should run in its own git worktree so parallel edits don't collide. Plan it, then implement with workers.",
          createdAt: now - 14 * MIN,
        },
        {
          id: "m-f2",
          role: "assistant",
          text: "Plan written to .ai/plans/worktree-per-worker.md. Three tasks, two independent, one that depends on both.",
          createdAt: now - 12 * MIN,
          tools: [
            { id: "t6", kind: "write", label: "Wrote", target: ".ai/plans/worktree-per-worker.md" },
            { id: "t7", kind: "spawn", label: "Spawned", target: "worker 1, worker 2", detail: "parallel" },
            { id: "t8", kind: "finish", label: "worker 1 finished", target: "src/worktree.ts", added: 118, removed: 0, ok: true },
          ],
        },
        { id: "m-f3", role: "assistant", text: "Waiting for worker 2, then I'll queue the reviewer.", createdAt: now - 40_000, streaming: true },
      ],
    );
    this.plans.set(feature.id, {
      sessionId: feature.id,
      path: ".ai/plans/worktree-per-worker.md",
      tasks: [
        { id: "p1", index: 1, title: "Worktree helper module", status: "done", assignee: "worker 1", note: "Claude Sonnet 5 · 3m 12s" },
        { id: "p2", index: 2, title: "Spawn workers inside worktrees", status: "waiting", assignee: "worker 2", note: "Codex gpt-5.5 · waiting for approval" },
        { id: "p3", index: 3, title: "Merge back and clean up", status: "queued", note: "depends on 1, 2 · then reviewer", dependsOn: ["p1", "p2"] },
      ],
    });
    put(
      {
        id: "s-w1",
        title: "worker 1 · worktree helper",
        status: "done",
        options: { provider: "claude", model: "claude-sonnet-5", effort: "medium", mode: "code" },
        cwd,
        folder,
        createdAt: now - 11 * MIN,
        lastActivityAt: now - 8 * MIN,
        parentId: feature.id,
        role: "worker",
        transcriptPath: `${cwd}/.ai/sessions/s-w1.jsonl`,
      },
      [
        { id: "m-w1", role: "user", text: "Task 1 from the plan: implement a worktree helper module in src/worktree.ts.", createdAt: now - 11 * MIN },
        {
          id: "m-w2",
          role: "assistant",
          text: "Added createWorktree, removeWorktree and listWorktrees with tests.",
          createdAt: now - 8 * MIN,
          tools: [{ id: "t9", kind: "write", label: "Wrote", target: "src/worktree.ts", added: 118, removed: 0 }],
        },
      ],
    );
    put(
      {
        id: "s-w2",
        title: "worker 2 · spawn in worktree",
        status: "waiting",
        options: { provider: "codex", model: "gpt-5.5", effort: "high", mode: "code" },
        cwd,
        folder,
        createdAt: now - 11 * MIN,
        lastActivityAt: now - 40_000,
        parentId: feature.id,
        role: "worker",
        pendingApproval: { kind: "bash", summary: "wants to run a command", detail: "git worktree add ../ai-dev-w2 -b feat/worker-2" },
        transcriptPath: `${cwd}/.ai/sessions/s-w2.jsonl`,
      },
      [
        { id: "m-w3", role: "user", text: "Task 2 from the plan: spawn each worker inside its own worktree.", createdAt: now - 11 * MIN },
        { id: "m-w4", role: "assistant", text: "I need a worktree to test against.", createdAt: now - 40_000 },
      ],
    );
    put(
      {
        id: "s-rev",
        title: "reviewer · queued",
        status: "queued",
        options: { provider: "claude", model: "claude-opus-5", effort: "high", mode: "talk" },
        cwd,
        folder,
        createdAt: now - 11 * MIN,
        lastActivityAt: now - 11 * MIN,
        parentId: feature.id,
        role: "reviewer",
        transcriptPath: `${cwd}/.ai/sessions/s-rev.jsonl`,
      },
      [],
    );

    // Done sessions, one with a fork.
    const mock = put(
      {
        id: "s-mock",
        title: "Session panel mock in HTML",
        status: "done",
        options: { provider: "claude", model: "claude-sonnet-5", effort: "medium", mode: "talk" },
        cwd,
        folder,
        createdAt: now - 25 * MIN,
        lastActivityAt: now - 4 * MIN,
        transcriptPath: `${cwd}/.ai/sessions/s-mock.jsonl`,
      },
      [
        { id: "m-m1", role: "user", text: "Make a simple mock of the sessions panel in HTML and CSS.", createdAt: now - 25 * MIN },
        { id: "m-m2", role: "assistant", text: "Three artboards: sidebar with chat, sidebar with the older sessions expanded, and a wide editor-tab layout.", createdAt: now - 4 * MIN },
      ],
    );
    put(
      {
        id: "s-mock-grid",
        title: "Try alternative with grid layout",
        status: "done",
        options: { provider: "claude", model: "claude-sonnet-5", effort: "low", mode: "talk" },
        cwd,
        folder,
        createdAt: now - 9 * MIN,
        lastActivityAt: now - 6 * MIN,
        parentId: mock.id,
        forkedFromMessageId: "m-m2",
        forkedFromIndex: 2,
        transcriptPath: `${cwd}/.ai/sessions/s-mock-grid.jsonl`,
      },
      [
        { id: "m-g1", role: "user", text: "Same thing but with a CSS grid instead of flex.", createdAt: now - 9 * MIN },
        { id: "m-g2", role: "assistant", text: "Grid version done, it lines up the fork tree columns better.", createdAt: now - 6 * MIN },
      ],
    );
    put(
      {
        id: "s-rtsp",
        title: "Fix RTSP camera timeout",
        status: "done",
        options: { provider: "codex", model: "gpt-5.5", effort: "low", mode: "code" },
        cwd: "/Users/gregorg/Dev/arhipedija",
        folder: "arhipedija",
        createdAt: now - 60 * MIN,
        lastActivityAt: now - 38 * MIN,
        transcriptPath: "/Users/gregorg/Dev/arhipedija/.ai/sessions/s-rtsp.jsonl",
      },
      [
        { id: "m-r1", role: "user", text: "The RTSP stream drops after 30s, find out why.", createdAt: now - 60 * MIN },
        { id: "m-r2", role: "assistant", text: "The keepalive was never sent. Added a GET_PARAMETER ping every 20s.", createdAt: now - 38 * MIN },
      ],
    );

    // Older than an hour: collapsed by default.
    const older: Array<[string, string, Session["options"]["provider"], number, Session["status"], string]> = [
      ["s-o1", "Plan: instagram comment feed", "claude", 3 * 60, "done", "agent0"],
      ["s-o2", "Migrate rollouts to sqlite", "codex", 26 * 60, "failed", folder],
      ["s-o3", "Replace Nacrt with Projektni Pogoji", "codex", 27 * 60, "done", "arhipedija"],
      ["s-o4", "Talk: agent0 architecture options", "claude", 2 * 24 * 60, "done", "agent0"],
      ["s-o5", "Lighthouse fixes for landing", "claude", 3 * 24 * 60, "done", "landing"],
      ["s-o6", "Write ADR for session storage", "claude", 4 * 24 * 60, "done", folder],
    ];
    for (const [id, title, provider, minutesAgo, status, dir] of older) {
      put(
        {
          id,
          title,
          status,
          options: { provider, model: provider === "claude" ? "claude-sonnet-5" : "gpt-5.5", effort: "medium", mode: "code" },
          cwd: `/Users/gregorg/Dev/${dir}`,
          folder: dir,
          createdAt: now - minutesAgo * MIN - 10 * MIN,
          lastActivityAt: now - minutesAgo * MIN,
          transcriptPath: `/Users/gregorg/Dev/${dir}/.ai/sessions/${id}.jsonl`,
        },
        [
          { id: `${id}-u`, role: "user", text: title, createdAt: now - minutesAgo * MIN - 10 * MIN },
          { id: `${id}-a`, role: "assistant", text: status === "failed" ? "Stopped: the migration hit a locked database." : "Done.", createdAt: now - minutesAgo * MIN },
        ],
      );
    }

    this.todos = [
      { id: "todo-1", text: "Nested section validation in parseConfig", done: false, createdAt: now - 30 * MIN, sourceSessionId: "s-parse" },
      { id: "todo-2", text: "Summarize old transcripts with a cheap model before hand-off", done: false, createdAt: now - 50 * MIN },
      { id: "todo-3", text: "Decide: pi RPC vs vendor CLIs as backend", done: false, createdAt: now - 70 * MIN },
      { id: "todo-4", text: "Mock the panel UI", done: true, createdAt: now - 90 * MIN, sourceSessionId: "s-mock" },
    ];
  }
}
