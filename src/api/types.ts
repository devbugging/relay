// Shared domain types. Both the extension host and the webview import from
// here, so keep this file free of Node and VS Code imports.

export type ProviderId = "claude" | "codex";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type SessionStatus = "running" | "waiting" | "done" | "failed";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** From the provider's live catalogue. Empty when it isn't available. */
  models: ModelInfo[];
  /** Why the provider can't be used, e.g. the CLI isn't installed or signed in. */
  unavailable?: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  /** Effort levels this model accepts; empty when it has no effort setting. */
  efforts: Effort[];
  defaultEffort?: Effort;
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
  /** Sent while the session was busy; delivered in order as each turn ends. */
  queued: QueuedMessage[];
  /** Context window fill as of the last model turn. */
  context?: ContextUsage;
  /** The provider's own conversation id (Claude session id, Codex thread id). */
  providerSessionId?: string;
  /** For a fork that hasn't run yet: where to branch from on its first turn. */
  forkOf?: { providerSessionId: string; atProviderMessageId?: string };
  /** Path of the transcript file on disk. */
  transcriptPath: string;
}

export interface QueuedMessage {
  id: string;
  text: string;
  createdAt: number;
}

/** "queue" waits for the running turn to end; "interrupt" stops it and sends now. */
export type Delivery = "queue" | "interrupt";

export interface ContextUsage {
  usedTokens: number;
  /** The model's context window. */
  limitTokens: number;
}

/**
 * One rate-limit window of a subscription plan, e.g. the rolling 5 hour
 * window or a weekly cap. Each provider reports whichever windows it has.
 */
export interface UsageWindow {
  id: string;
  label: string;
  /** 0 to 100. */
  usedPercent: number;
  resetsAt?: number;
  /** Extra context such as "$12.40 of $50". */
  detail?: string;
}

export interface ProviderUsage {
  provider: ProviderId;
  /** Plan name when known, e.g. "Max" or "Plus". */
  plan?: string;
  windows: UsageWindow[];
  /** Values that aren't a percentage, e.g. a credit balance. */
  extras?: Array<{ label: string; value: string }>;
  /** Why no windows are shown, e.g. signed in with an API key. */
  note?: string;
  updatedAt: number;
}

export type MessageRole = "user" | "assistant";

export interface ToolEvent {
  id: string;
  kind: "read" | "edit" | "write" | "run" | "other";
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
  /** Provider id of the last assistant message folded into this one; a fork branches here. */
  providerMessageId?: string;
}

export type ApprovalDecision = "allow" | "deny" | "always";

export function isActive(s: Session): boolean {
  return s.status === "running" || s.status === "waiting";
}
