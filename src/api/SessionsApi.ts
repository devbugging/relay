import type { ApprovalDecision, Message, ProviderInfo, Session, SessionOptions } from "./types";

export type Unsubscribe = () => void;

/**
 * Everything the UI needs from the backend. The mock implements this today;
 * the real implementation will sit on top of the Claude Agent SDK, the Codex
 * SDK or pi's RPC mode without the UI changing.
 */
export interface SessionsApi {
  listProviders(): Promise<ProviderInfo[]>;

  listSessions(): Promise<Session[]>;
  getMessages(sessionId: string): Promise<Message[]>;

  createSession(options: SessionOptions, cwd: string): Promise<Session>;
  /** Also brings an archived session (and its ancestors) back. */
  sendMessage(sessionId: string, text: string, options?: Partial<SessionOptions>): Promise<void>;
  forkSession(sessionId: string, fromMessageId?: string): Promise<Session>;
  stopSession(sessionId: string): Promise<void>;
  respondToApproval(sessionId: string, decision: ApprovalDecision): Promise<void>;
  renameSession(sessionId: string, title: string): Promise<void>;

  /** The user has looked at the finished output. */
  markSeen(sessionId: string): Promise<void>;
  /** Marks the session and its finished forks complete. */
  archiveSession(sessionId: string): Promise<void>;

  /** Fires whenever anything above would return something different. */
  onDidChange(listener: () => void): Unsubscribe;

  dispose(): void;
}
