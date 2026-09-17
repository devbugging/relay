import type {
  ApprovalDecision,
  Message,
  Plan,
  ProviderInfo,
  Session,
  SessionOptions,
  Todo,
} from "./types";

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
  getPlan(sessionId: string): Promise<Plan | undefined>;

  createSession(options: SessionOptions, cwd: string): Promise<Session>;
  sendMessage(sessionId: string, text: string, options?: Partial<SessionOptions>): Promise<void>;
  forkSession(sessionId: string, fromMessageId?: string): Promise<Session>;
  stopSession(sessionId: string): Promise<void>;
  respondToApproval(sessionId: string, decision: ApprovalDecision): Promise<void>;
  renameSession(sessionId: string, title: string): Promise<void>;

  listTodos(): Promise<Todo[]>;
  addTodo(text: string, sourceSessionId?: string): Promise<Todo>;
  toggleTodo(todoId: string): Promise<void>;
  removeTodo(todoId: string): Promise<void>;

  /** Fires whenever anything above would return something different. */
  onDidChange(listener: () => void): Unsubscribe;

  dispose(): void;
}
