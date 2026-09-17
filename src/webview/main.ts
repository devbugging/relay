import type { ApprovalDecision } from "../api/types";
import type { ToWebview, UiState } from "../panel/protocol";
import { renderChat } from "./chat";
import { bindComposerOnce, refreshChips, renderComposer } from "./composer";
import { renderSessions } from "./sessions";
import { renderPlan, renderTodosColumn, renderTodosStrip } from "./side";
import { local, post } from "./state";

let state: UiState | undefined;
let shellBuilt = false;
const app = document.getElementById("app") as HTMLDivElement;

function buildShell(layout: UiState["layout"]): void {
  if (layout === "wide") {
    app.innerHTML = `
      <div class="col col-left" id="left"></div>
      <div class="col" id="center"><div id="chat"></div>${renderComposer()}</div>
      <div class="col col-right" id="right"></div>`;
  } else {
    app.innerHTML = `<div id="left"></div><div id="chat" class="chat-wrap"></div>${renderComposer()}`;
  }
  bindComposerOnce(() => state);
  shellBuilt = true;
}

function render(): void {
  if (!state) return;
  if (!shellBuilt) buildShell(state.layout);

  const left = document.getElementById("left");
  const chat = document.getElementById("chat");
  const right = document.getElementById("right");
  const strip = document.getElementById("todos-strip");
  const messages = document.getElementById("messages");
  const stickToBottom = !messages || messages.scrollHeight - messages.scrollTop - messages.clientHeight < 40;
  const prevScroll = messages ? messages.scrollTop : 0;

  if (left) left.innerHTML = renderSessions(state);
  if (chat) chat.outerHTML = `<div id="chat" class="chat-wrap">${renderChat(state)}</div>`;
  if (right) right.innerHTML = `${renderPlan(state)}${renderTodosColumn(state)}`;
  if (strip) strip.innerHTML = state.layout === "wide" ? "" : renderTodosStrip(state);
  refreshChips(state);

  const nextMessages = document.getElementById("messages");
  if (nextMessages) nextMessages.scrollTop = stickToBottom ? nextMessages.scrollHeight : prevScroll;

  if (local.addingTodo) {
    const input = document.getElementById("todo-new") as HTMLInputElement | null;
    if (input) input.focus();
  }
}

window.addEventListener("message", (e: MessageEvent<ToWebview>) => {
  if (e.data && e.data.type === "state") {
    state = e.data.state;
    render();
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
    case "newSession":
      post({ type: "newSession" });
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
    case "toggleOlder":
      post({ type: "toggleOlder" });
      break;
    case "openTranscript":
      post({ type: "openTranscript", sessionId: id });
      break;
    case "openPlan":
      post({ type: "openPlan", sessionId: id });
      break;
    case "copy":
      if (mid) void navigator.clipboard.writeText(messageText(mid));
      break;
    case "todoFrom":
      if (mid) post({ type: "addTodo", text: messageText(mid).slice(0, 120), sourceSessionId: id });
      local.todosOpen = true;
      break;
    case "toggleTodos":
      local.todosOpen = !local.todosOpen;
      render();
      break;
    case "addTodoStart":
      local.addingTodo = true;
      local.todosOpen = true;
      render();
      break;
    case "removeTodo":
      post({ type: "removeTodo", todoId: id });
      break;
    case "toggleTodo":
      // Checkbox: handled on change below, but stop the card click from firing.
      break;
  }
});

app.addEventListener("change", (e) => {
  const target = e.target as HTMLElement;
  if (target.dataset.action === "toggleTodo" && target.dataset.id) post({ type: "toggleTodo", todoId: target.dataset.id });
});

app.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (target.id !== "todo-new") return;
  const input = target as HTMLInputElement;
  if (e.key === "Enter") {
    const text = input.value.trim();
    local.addingTodo = false;
    if (text) post({ type: "addTodo", text, sourceSessionId: state ? state.selectedSessionId : undefined });
    else render();
  } else if (e.key === "Escape") {
    local.addingTodo = false;
    render();
  }
});

post({ type: "ready" });
