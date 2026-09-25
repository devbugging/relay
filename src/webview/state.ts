import type { Session, SessionOptions } from "../api/types";
import type { FromWebview, UiState } from "../panel/protocol";

declare function acquireVsCodeApi(): { postMessage(m: unknown): void };

const vscode = acquireVsCodeApi();

export function post(m: FromWebview): void {
  vscode.postMessage(m);
}

/** Local UI state that survives state pushes from the extension host. */
export const local = {
  /** Unset until toggled: open in the editor tab, collapsed in the narrow sidebar. */
  usageOpen: undefined as boolean | undefined,
  composer: undefined as SessionOptions | undefined,
  composerFor: undefined as string | undefined,
};

export function selected(state: UiState): Session | undefined {
  return state.sessions.find((s) => s.id === state.selectedSessionId);
}

/** The composer follows the selected session's options until the user changes them. */
export function composerOptions(state: UiState): SessionOptions {
  const s = selected(state);
  if (!local.composer || local.composerFor !== state.selectedSessionId) {
    local.composerFor = state.selectedSessionId;
    local.composer = s ? { ...s.options } : { provider: "claude", model: "claude-opus-5", effort: "high" };
  }
  return local.composer;
}
