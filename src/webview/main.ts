import type { ApprovalDecision } from "../api/types";
import type { ToWebview, UiState } from "../panel/protocol";
import { renderChat } from "./chat";
import { bindComposerOnce, refreshChips, renderComposer } from "./composer";
import { renderSessions } from "./sessions";
import { post } from "./state";

let state: UiState | undefined;
let shellBuilt = false;
const app = document.getElementById("app") as HTMLDivElement;

function buildShell(): void {
  app.innerHTML = `<div id="left"></div><div id="chat" class="chat-wrap"></div>${renderComposer()}`;
  bindComposerOnce(() => state);
  shellBuilt = true;
}

function render(): void {
  if (!state) return;
  if (!shellBuilt) buildShell();

  const left = document.getElementById("left");
  const chat = document.getElementById("chat");
  const messages = document.getElementById("messages");
  const stickToBottom = !messages || messages.scrollHeight - messages.scrollTop - messages.clientHeight < 40;
  const prevScroll = messages ? messages.scrollTop : 0;

  if (left) left.innerHTML = renderSessions(state);
  if (chat) chat.outerHTML = `<div id="chat" class="chat-wrap">${renderChat(state)}</div>`;
  refreshChips(state);

  const nextMessages = document.getElementById("messages");
  if (nextMessages) nextMessages.scrollTop = stickToBottom ? nextMessages.scrollHeight : prevScroll;
}

window.addEventListener("message", (e: MessageEvent<ToWebview>) => {
  if (!e.data) return;
  if (e.data.type === "state") {
    state = e.data.state;
    render();
  } else if (e.data.type === "focusInput") {
    const input = document.getElementById("input");
    if (input) input.focus();
  }
});

// Ticks the clocks on cards between state pushes.
setInterval(() => {
  if (!state) return;
  if (!state.sessions.some((s) => s.status === "running")) return;
  state.now = Date.now();
  const left = document.getElementById("left");
  if (left) left.innerHTML = renderSessions(state);
}, 1000);

function messageText(mid: string): string {
  if (!state) return "";
  const m = state.messages.find((x) => x.id === mid);
  return m ? m.text : "";
}

app.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
  if (!target || !state) return;
  const action = target.dataset.action;
  const id = target.dataset.id || "";
  const mid = target.dataset.mid;
  switch (action) {
    case "select":
      if (id !== state.selectedSessionId) post({ type: "selectSession", sessionId: id });
      break;
    case "fork":
      e.stopPropagation();
      post({ type: "fork", sessionId: id });
      break;
    case "forkAt":
      post({ type: "fork", sessionId: id, messageId: mid });
      break;
    case "stop":
      e.stopPropagation();
      post({ type: "stop", sessionId: id });
      break;
    case "approve":
      e.stopPropagation();
      post({ type: "approve", sessionId: id, decision: target.dataset.decision as ApprovalDecision });
      break;
    case "complete":
      e.stopPropagation();
      post({ type: "complete", sessionId: id });
      break;
    case "toggleAllPast":
      post({ type: "toggleAllPast" });
      break;
    case "copy":
      if (mid) void navigator.clipboard.writeText(messageText(mid));
      break;
  }
});

post({ type: "ready" });
