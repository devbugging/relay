// Shared domain types. Both the extension host and the webview import from
// here, so keep this file free of Node and VS Code imports.

export type ProviderId = "claude" | "codex";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type Mode = "talk" | "code" | "feature";

export type SessionStatus = "running" | "waiting" | "done" | "failed" | "queued";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  models: ModelInfo[];
  efforts: Effort[];
}

export interface ModelInfo {
  id: string;
  label: string;
}

export interface SessionOptions {
  provider: ProviderId;
  model: string;
  effort: Effort;
  mode: Mode;
}

export interface PendingApproval {
  kind: "bash" | "edit" | "other";
  summary: string;
  detail: string;
}

export interface Session {
  id: string;
  title: string;
  status: SessionStatus;
  options: SessionOptions;
  cwd: string;
  /** Short folder name shown on the card. */
  folder: string;
  createdAt: number;
  /** Last time anything happened in this session (message, tool call, status). */
  lastActivityAt: number;
  /** Parent session when this one was forked. */
  parentId?: string;
  /** Message id in the parent this fork started from. */
  forkedFromMessageId?: string;
  /** 1-based index of that message in the parent, for display. */
  forkedFromIndex?: number;
  pendingApproval?: PendingApproval;
  /** Role inside a feature-mode run. */
  role?: "planner" | "worker" | "reviewer";
  /** Path of the transcript file on disk. */
  transcriptPath: string;
}

export type MessageRole = "user" | "assistant";

export interface ToolEvent {
  id: string;
  kind: "read" | "edit" | "write" | "run" | "spawn" | "finish";
  label: string;
  target: string;
  detail?: string;
  added?: number;
  removed?: number;
  ok?: boolean;
}

export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  createdAt: number;
  tools?: ToolEvent[];
  streaming?: boolean;
}

export interface PlanTask {
  id: string;
  index: number;
  title: string;
  status: SessionStatus;
  assignee?: string;
  note?: string;
  dependsOn?: string[];
}

export interface Plan {
  sessionId: string;
  path: string;
  tasks: PlanTask[];
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  sourceSessionId?: string;
}

export type ApprovalDecision = "allow" | "deny" | "always";
