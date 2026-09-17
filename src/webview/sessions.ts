import type { Session, SessionStatus } from "../api/types";
import type { UiState } from "../panel/protocol";
import { icons } from "./icons";
import { ago, elapsed, esc } from "./util";

interface Node {
  session: Session;
  children: Node[];
}

const ORDER: Record<SessionStatus, number> = { waiting: 0, running: 1, queued: 2, done: 3, failed: 3 };

function buildTree(sessions: Session[]): Node[] {
  const byId = new Map<string, Node>();
  for (const s of sessions) byId.set(s.id, { session: s, children: [] });
  const roots: Node[] = [];
  for (const node of byId.values()) {
    const parent = node.session.parentId ? byId.get(node.session.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortChildren = (n: Node) => {
    n.children.sort((a, b) => a.session.createdAt - b.session.createdAt);
    n.children.forEach(sortChildren);
  };
  roots.forEach(sortChildren);
  return roots;
}

function latestActivity(n: Node): number {
  return Math.max(n.session.lastActivityAt, ...n.children.map(latestActivity));
}

function isActive(n: Node): boolean {
  const s = n.session.status;
  return s === "running" || s === "waiting" || n.children.some(isActive);
}

function statusIcon(status: SessionStatus): string {
  switch (status) {
    case "running":
      return `<span class="status status-running"></span>`;
    case "waiting":
      return `<span class="status status-waiting">${icons.clock}</span>`;
    case "done":
      return `<span class="status status-done">${icons.check}</span>`;
    case "failed":
      return `<span class="status status-failed">${icons.cross}</span>`;
    case "queued":
      return `<span class="status status-queued">${icons.circle}</span>`;
  }
}

function modelLabel(state: UiState, s: Session): string {
  const p = state.providers.find((x) => x.id === s.options.provider);
  const m = p && p.models.find((x) => x.id === s.options.model);
  return m ? m.label : s.options.model;
}

function providerLabel(state: UiState, s: Session): string {
  const p = state.providers.find((x) => x.id === s.options.provider);
  return p ? p.label : s.options.provider;
}

function providerBadge(state: UiState, s: Session): string {
  const p = state.providers.find((x) => x.id === s.options.provider);
  return `<span class="provider provider-${esc(s.options.provider)}">${esc(p ? p.label : s.options.provider)}</span>`;
}

function timeCell(s: Session, now: number): string {
  if (s.status === "running") return elapsed(s.createdAt, now);
  if (s.status === "waiting") return "Needs approval";
  if (s.status === "queued") return "queued";
  return ago(s.lastActivityAt, now);
}

function card(state: UiState, node: Node, depth: number): string {
  const s = node.session;
  const isSel = s.id === state.selectedSessionId;
  const forkNote = s.forkedFromIndex ? `from msg ${s.forkedFromIndex} · ` : s.role ? `${s.role} · ` : "";
  const meta =
    depth === 0
      ? `${providerBadge(state, s)}<span class="ellipsis">${esc(modelLabel(state, s))} · ${esc(s.options.effort)} · ${esc(s.options.mode)}</span>
         <span class="right mono">${esc(s.pendingApproval ? `${s.pendingApproval.kind}: ${s.pendingApproval.detail.split(" ").slice(0, 2).join(" ")}` : s.folder)}</span>`
      : `<span class="ellipsis">${esc(forkNote)}${esc(providerLabel(state, s))} · ${esc(modelLabel(state, s))} · ${esc(s.options.effort)}</span>`;
  const canStop = s.status === "running" || s.status === "waiting";
  const approval =
    s.pendingApproval && (isSel || depth === 0)
      ? `<div class="card-actions">
           <button class="btn btn-primary" data-action="approve" data-id="${esc(s.id)}" data-decision="allow">Allow</button>
           <button class="btn" data-action="approve" data-id="${esc(s.id)}" data-decision="deny">Deny</button>
           <button class="btn" data-action="approve" data-id="${esc(s.id)}" data-decision="always">Always for this session</button>
         </div>`
      : "";
  const children = node.children.length
    ? `<div class="children">
         ${node.children.map((c) => `<div class="child"><div class="branch"></div>${card(state, c, depth + 1)}</div>`).join("")}
         ${isSel && !s.role ? `<div class="child"><div class="branch"></div><button class="fork-slot" data-action="fork" data-id="${esc(s.id)}">${icons.plus} Fork from latest message</button></div>` : ""}
       </div>`
    : "";
  return `<div class="card card-${esc(s.status)} ${isSel ? "selected" : ""}" data-action="select" data-id="${esc(s.id)}">
    <div class="card-row">
      ${statusIcon(s.status)}
      <span class="card-title ellipsis grow">${esc(s.title)}</span>
      <span class="card-tools">
        <button class="icon-btn sm" data-action="fork" data-id="${esc(s.id)}" title="Fork session" aria-label="Fork session">${icons.fork}</button>
        ${canStop ? `<button class="icon-btn sm" data-action="stop" data-id="${esc(s.id)}" title="Stop" aria-label="Stop">${icons.stop}</button>` : ""}
      </span>
      <span class="card-time">${esc(timeCell(s, state.now))}</span>
    </div>
    <div class="card-meta">${meta}</div>
    ${approval}
    ${children}
  </div>`;
}

function olderRow(state: UiState, node: Node): string {
  const s = node.session;
  const p = state.providers.find((x) => x.id === s.options.provider);
  const isSel = s.id === state.selectedSessionId;
  return `<div class="row ${isSel ? "selected" : ""}" data-action="select" data-id="${esc(s.id)}">
    ${statusIcon(s.status)}
    <span class="ellipsis grow">${esc(s.title)}</span>
    <span class="small">${esc(p ? p.label : s.options.provider)}</span>
    <span class="small">${esc(ago(latestActivity(node), state.now))}</span>
  </div>`;
}

export function renderSessions(state: UiState): string {
  const roots = buildTree(state.sessions);
  const cutoff = state.now - state.olderThresholdMs;
  const active: Node[] = [];
  const older: Node[] = [];
  for (const r of roots) (isActive(r) || latestActivity(r) >= cutoff ? active : older).push(r);
  active.sort((a, b) => ORDER[a.session.status] - ORDER[b.session.status] || latestActivity(b) - latestActivity(a));
  older.sort((a, b) => latestActivity(b) - latestActivity(a));

  const running = state.sessions.filter((s) => s.status === "running").length;
  const waiting = state.sessions.filter((s) => s.status === "waiting").length;
  const summary = [running ? `${running} running` : "", waiting ? `${waiting} waiting` : ""].filter(Boolean).join(" · ") || "idle";

  const olderBlock = older.length
    ? `<button class="older-toggle ${state.showOlder ? "open" : ""}" data-action="toggleOlder">${icons.chevron}
         ${state.showOlder ? "Hide older sessions" : `Show ${older.length} older session${older.length === 1 ? "" : "s"}`}
         <span class="muted">· inactive over 1h</span></button>
       ${state.showOlder ? older.map((n) => olderRow(state, n)).join("") : ""}`
    : "";

  return `<div class="sessions">
    <div class="section-head">
      ${state.layout === "wide" ? "" : icons.chevron}
      <span>Sessions</span><span class="count">${esc(summary)}</span>
      ${state.layout === "wide" ? `<span class="grow"></span><button class="btn btn-primary" data-action="newSession">${icons.plus} New</button>` : ""}
    </div>
    <div class="sessions-list">
      ${active.length ? active.map((n) => card(state, n, 0)).join("") : `<div class="empty">No active sessions. Start one below.</div>`}
      ${olderBlock}
    </div>
  </div>`;
}
