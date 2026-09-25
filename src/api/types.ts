// Shared domain types. Both the extension host and the webview import from
// here, so keep this file free of Node and VS Code imports.

export type ProviderId = "claude" | "codex";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type SessionStatus = "running" | "waiting" | "done" | "failed";

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
  /** Finished since the user last opened it. */
  unread: boolean;
  /** When the user last checked its finished output. */
  seenAt?: number;
  /** The user marked it complete. Hidden unless all past sessions are shown. */
  archived: boolean;
  /** Parent session when this one was forked. */
  parentId?: string;
  /** Message id in the parent this fork started from. */
  forkedFromMessageId?: string;
  /** 1-based index of that message in the parent, for display. */
  forkedFromIndex?: number;
  pendingApproval?: PendingApproval;
  /** Path of the transcript file on disk. */
  transcriptPath: string;
}

export type MessageRole = "user" | "assistant";

export interface ToolEvent {
  id: string;
  kind: "read" | "edit" | "write" | "run";
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

export type ApprovalDecision = "allow" | "deny" | "always";

export function isActive(s: Session): boolean {
  return s.status === "running" || s.status === "waiting";
}
