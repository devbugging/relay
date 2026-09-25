import type { ApprovalDecision, Message, ProviderInfo, ProviderUsage, Session, SessionOptions } from "../api/types";

export type Layout = "sidebar" | "wide";

/** Full snapshot pushed to the webview after every change. */
export interface UiState {
  layout: Layout;
  providers: ProviderInfo[];
  usage: ProviderUsage[];
  sessions: Session[];
  selectedSessionId?: string;
  messages: Message[];
  /** Past sessions active within this window are listed without expanding. */
  pastWindowMs: number;
  /** Also list older and completed sessions. */
  showAllPast: boolean;
  now: number;
}

export type ToWebview = { type: "state"; state: UiState } | { type: "focusInput" };

export type FromWebview =
  | { type: "ready" }
  | { type: "selectSession"; sessionId: string }
  | { type: "newSession" }
  | { type: "send"; sessionId?: string; text: string; options: SessionOptions }
  | { type: "fork"; sessionId: string; messageId?: string }
  | { type: "stop"; sessionId: string }
  | { type: "approve"; sessionId: string; decision: ApprovalDecision }
  | { type: "complete"; sessionId: string }
  | { type: "toggleAllPast" };
