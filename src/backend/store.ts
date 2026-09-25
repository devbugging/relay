import * as fs from "fs/promises";
import * as path from "path";
import type { Message, Session } from "../api/types";

interface Snapshot {
  version: 1;
  sessions: Session[];
  messages: Record<string, Message[]>;
}

/**
 * Sessions and their normalized messages, kept in memory and written to one
 * JSON file (debounced). With no file it is purely in memory, as the mock uses it.
 */
export class SessionStore {
  readonly sessions = new Map<string, Session>();
  readonly messages = new Map<string, Message[]>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly file?: string) {}

  async load(): Promise<void> {
    if (!this.file) return;
    let raw: string;
    try {
      raw = await fs.readFile(this.file, "utf8");
    } catch {
      return;
    }
    const snap = JSON.parse(raw) as Snapshot;
    for (const s of snap.sessions) {
      // Nothing survives a reload mid-turn: the provider process went with it.
      if (s.status === "running" || s.status === "waiting") {
        s.status = "failed";
        s.unread = true;
        s.pendingApproval = undefined;
      }
      this.sessions.set(s.id, s);
      const msgs = snap.messages[s.id] || [];
      for (const m of msgs) m.streaming = false;
      this.messages.set(s.id, msgs);
    }
  }

  put(session: Session, messages: Message[] = []): void {
    this.sessions.set(session.id, session);
    if (!this.messages.has(session.id)) this.messages.set(session.id, messages);
    this.save();
  }

  messagesOf(sessionId: string): Message[] {
    let list = this.messages.get(sessionId);
    if (!list) {
      list = [];
      this.messages.set(sessionId, list);
    }
    return list;
  }

  save(): void {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      void this.flush();
    }, 500);
  }

  async flush(): Promise<void> {
    if (!this.file) return;
    const snap: Snapshot = { version: 1, sessions: [...this.sessions.values()], messages: Object.fromEntries(this.messages) };
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(snap));
    await fs.rename(tmp, this.file);
  }
}
