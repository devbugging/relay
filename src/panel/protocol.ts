import type { ApprovalDecision, Message, Plan, ProviderInfo, Session, SessionOptions, Todo } from "../api/types";

export type Layout = "sidebar" | "wide";

/** Full snapshot pushed to the webview after every change. */
export interface UiState {
  layout: Layout;
  providers: ProviderInfo[];
  sessions: Session[];
  selectedSessionId?: string;
  messages: Message[];
  plan?: Plan;
  todos: Todo[];
  /** Sessions idle longer than this are collapsed into the "older" group. */
  olderThresholdMs: number;
  showOlder: boolean;
  now: number;
}

export type ToWebview = { type: "state"; state: UiState };

export type FromWebview =
  | { type: "ready" }
  | { type: "selectSession"; sessionId: string }
  | { type: "send"; sessionId?: string; text: string; options: SessionOptions }
  | { type: "newSession" }
  | { type: "fork"; sessionId: string; messageId?: string }
  | { type: "stop"; sessionId: string }
  | { type: "approve"; sessionId: string; decision: ApprovalDecision }
  | { type: "toggleOlder" }
  | { type: "openWide" }
  | { type: "openTranscript"; sessionId: string }
  | { type: "openPlan"; sessionId: string }
  | { type: "addTodo"; text: string; sourceSessionId?: string }
  | { type: "toggleTodo"; todoId: string }
  | { type: "removeTodo"; todoId: string };
