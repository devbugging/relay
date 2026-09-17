import type { PlanTask, Todo } from "../api/types";
import type { UiState } from "../panel/protocol";
import { icons } from "./icons";
import { local } from "./state";
import { esc } from "./util";

function taskIcon(status: PlanTask["status"]): string {
  switch (status) {
    case "running":
      return `<span class="status status-running"></span>`;
    case "waiting":
      return `<span class="status status-waiting">${icons.clock}</span>`;
    case "done":
      return `<span class="status status-done">${icons.check}</span>`;
    case "failed":
      return `<span class="status status-failed">${icons.cross}</span>`;
    default:
      return `<span class="status status-queued">${icons.circle}</span>`;
  }
}

export function renderPlan(state: UiState): string {
  const plan = state.plan;
  if (!plan) {
    return `<div class="section-head"><span>Plan</span><span class="count">none for this session</span></div>
      <div class="empty" style="border-bottom: 1px solid var(--border);">Switch the composer to <b>feature</b> mode and the planner will write one here.</div>`;
  }
  const done = plan.tasks.filter((t) => t.status === "done").length;
  return `<div class="section-head"><span>Plan</span><span class="count">${done} of ${plan.tasks.length} done</span><span class="grow"></span>
      <button class="icon-btn" data-action="openPlan" data-id="${esc(plan.sessionId)}" title="Open plan file" aria-label="Open plan file">${icons.file}</button></div>
    <div class="plan-list">
      ${plan.tasks
        .map(
          (t) => `<div class="task task-${esc(t.status)}">${taskIcon(t.status)}
            <div class="task-body"><span class="task-title">${t.index}. ${esc(t.title)}</span>
            <span class="task-note">${esc([t.assignee, t.note].filter(Boolean).join(" · "))}</span></div></div>`,
        )
        .join("")}
    </div>`;
}

function todoRow(t: Todo): string {
  return `<div class="todo ${t.done ? "done" : ""}">
    <input type="checkbox" id="todo-${esc(t.id)}" ${t.done ? "checked" : ""} data-action="toggleTodo" data-id="${esc(t.id)}">
    <label for="todo-${esc(t.id)}">${esc(t.text)}</label>
    <button class="icon-btn sm" data-action="removeTodo" data-id="${esc(t.id)}" title="Remove" aria-label="Remove todo">${icons.trash}</button>
  </div>`;
}

function todoInput(): string {
  return `<div class="todo-input"><input id="todo-new" placeholder="New todo, Enter to add" aria-label="New todo"></div>`;
}

/** Collapsed strip under the composer in the sidebar. */
export function renderTodosStrip(state: UiState): string {
  const open = state.todos.filter((t) => !t.done).length;
  const list = local.todosOpen ? `<div class="todo-list">${state.todos.map(todoRow).join("")}</div>` : "";
  return `<div class="todos-strip">
    <div class="todos-strip-head">
      <button class="toggle ${local.todosOpen ? "open" : ""}" data-action="toggleTodos">${icons.chevronRight}<b>Todos</b><span>${open} open</span></button>
      <button class="add-link" data-action="addTodoStart">+ add</button>
    </div>
    ${local.addingTodo ? todoInput() : ""}
    ${list}
  </div>`;
}

/** Full column in the wide layout. */
export function renderTodosColumn(state: UiState): string {
  const open = state.todos.filter((t) => !t.done).length;
  return `<div class="section-head" style="border-bottom: 0; height: 36px;"><span>Todos</span><span class="count">${open} open</span><span class="grow"></span>
      <button class="icon-btn" data-action="addTodoStart" title="Add todo" aria-label="Add todo">${icons.plus}</button></div>
    ${local.addingTodo ? todoInput() : ""}
    <div class="todo-list">${state.todos.map(todoRow).join("")}</div>
    <div class="footer">${icons.folder}<span class="mono">.ai/todos.md</span><span class="grow"></span><span>saved</span></div>`;
}
