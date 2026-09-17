import type { Message, Session, ToolEvent } from "../api/types";
import type { UiState } from "../panel/protocol";
import { icons } from "./icons";
import { ago, esc } from "./util";
import { selected } from "./state";

function toolIcon(kind: ToolEvent["kind"]): string {
  switch (kind) {
    case "read":
      return icons.eye;
    case "edit":
    case "write":
      return icons.pencil;
    case "run":
      return icons.terminal;
    case "spawn":
      return icons.spawn;
    case "finish":
      return `<span class="status-done">${icons.check}</span>`;
  }
}

function tool(t: ToolEvent): string {
  const diff =
    t.added !== undefined || t.removed !== undefined
      ? `<span class="right"><span class="add">+${t.added || 0}</span> <span class="del">−${t.removed || 0}</span></span>`
      : t.detail
        ? `<span class="right ${t.ok ? "add" : ""}">${esc(t.detail)}</span>`
        : "";
  return `<div class="tool">${toolIcon(t.kind)}<span>${esc(t.label)}</span><span class="target ${t.kind === "spawn" || t.kind === "finish" ? "" : "mono"} ellipsis">${esc(t.target)}</span>${diff}</div>`;
}

function message(m: Message, session: Session): string {
  if (m.role === "user") {
    return `<div class="msg msg-user" data-mid="${esc(m.id)}"><div class="bubble">${esc(m.text)}</div></div>`;
  }
  const tools = m.tools && m.tools.length ? `<div class="tools">${m.tools.map(tool).join("")}</div>` : "";
  const text = m.text ? `<div class="msg-text">${esc(m.text)}${m.streaming ? `<span class="caret"></span>` : ""}</div>` : m.streaming ? `<div class="msg-text"><span class="caret"></span></div>` : "";
  const toolbar = m.streaming
    ? ""
    : `<div class="msg-tools">
         <button class="icon-btn" data-action="forkAt" data-id="${esc(session.id)}" data-mid="${esc(m.id)}" title="Fork from here" aria-label="Fork from this message">${icons.fork}</button>
         <button class="icon-btn" data-action="copy" data-mid="${esc(m.id)}" title="Copy" aria-label="Copy message">${icons.copy}</button>
         <button class="icon-btn" data-action="todoFrom" data-id="${esc(session.id)}" data-mid="${esc(m.id)}" title="Add as todo" aria-label="Add as todo">${icons.todo}</button>
       </div>`;
  return `<div class="msg msg-assistant" data-mid="${esc(m.id)}">${toolbar}${tools}${text}</div>`;
}

function approval(s: Session): string {
  if (!s.pendingApproval) return "";
  return `<div class="approval">
    <div class="approval-title">${icons.clock}<span>${esc(s.pendingApproval.summary)}</span></div>
    <div class="approval-cmd mono">${esc(s.pendingApproval.detail)}</div>
    <div class="approval-actions">
      <button class="btn btn-primary" data-action="approve" data-id="${esc(s.id)}" data-decision="allow">Allow</button>
      <button class="btn" data-action="approve" data-id="${esc(s.id)}" data-decision="deny">Deny</button>
      <button class="btn" data-action="approve" data-id="${esc(s.id)}" data-decision="always">Always allow ${esc(s.pendingApproval.detail.split(" ").slice(0, 2).join(" "))}</button>
    </div>
  </div>`;
}

function head(state: UiState, s: Session | undefined): string {
  if (!s) {
    return `<div class="chat-head"><span class="title grow">No session selected</span></div>`;
  }
  const p = state.providers.find((x) => x.id === s.options.provider);
  const m = p && p.models.find((x) => x.id === s.options.model);
  const status =
    s.status === "running"
      ? `<span class="status status-running"></span>`
      : s.status === "waiting"
        ? `<span class="status status-waiting">${icons.clock}</span>`
        : s.status === "failed"
          ? `<span class="status status-failed">${icons.cross}</span>`
          : `<span class="status status-done">${icons.check}</span>`;
  const sub =
    state.layout === "wide"
      ? `<span class="muted ellipsis">· ${esc(p ? p.label : s.options.provider)} · ${esc(m ? m.label : s.options.model)} · ${esc(s.options.effort)} · ${esc(s.options.mode)} mode · started ${esc(ago(s.createdAt, state.now))}</span>`
      : "";
  const canStop = s.status === "running" || s.status === "waiting";
  return `<div class="chat-head">
    ${status}
    <span class="title ellipsis">${esc(s.title)}</span>${sub}<span class="grow"></span>
    <button class="icon-btn" data-action="fork" data-id="${esc(s.id)}" title="Fork session" aria-label="Fork session">${icons.fork}</button>
    <button class="icon-btn" data-action="openTranscript" data-id="${esc(s.id)}" title="Open transcript file" aria-label="Open transcript file">${icons.file}</button>
    ${canStop ? `<button class="icon-btn" data-action="stop" data-id="${esc(s.id)}" title="Stop" aria-label="Stop session">${icons.stop}</button>` : ""}
  </div>`;
}

export function renderChat(state: UiState): string {
  const s = selected(state);
  const body = !s
    ? `<div class="empty">Pick a session above, or type below to start a new one.</div>`
    : state.messages.length === 0
      ? `<div class="empty">Empty session. Say what you want done.</div>`
      : `<div class="messages-inner">${state.messages.map((m) => message(m, s)).join("")}${approval(s)}</div>`;
  return `<div class="chat">${head(state, s)}<div class="messages" id="messages">${body}</div></div>`;
}
