import type { Effort, Mode, ProviderId } from "../api/types";
import type { UiState } from "../panel/protocol";
import { icons } from "./icons";
import { composerOptions, local, post } from "./state";
import { esc } from "./util";

const MODES: Mode[] = ["talk", "code", "feature"];

/**
 * The composer is rendered once and then only its chips are refreshed, so
 * the textarea keeps whatever the user has typed while sessions stream.
 */
export function renderComposer(): string {
  return `<div class="composer">
    <div class="composer-box">
      <textarea id="input" rows="3" aria-label="Message" placeholder="Message this session…  ⌘↵ to send"></textarea>
      <div class="composer-bar" id="chips"></div>
    </div>
    <div id="todos-strip"></div>
  </div>`;
}

export function refreshChips(state: UiState): void {
  const el = document.getElementById("chips");
  if (!el) return;
  const opts = composerOptions(state);
  const provider = state.providers.find((p) => p.id === opts.provider) || state.providers[0];
  const models = provider ? provider.models : [];
  const efforts: Effort[] = provider ? provider.efforts : ["low", "medium", "high"];

  const providerSel = `<span class="chip-wrap has-dot"><span class="dot dot-${esc(opts.provider)}"></span>
    <select class="chip" id="chip-provider" aria-label="Provider">
      ${state.providers.map((p) => `<option value="${esc(p.id)}" ${p.id === opts.provider ? "selected" : ""}>${esc(p.label)}</option>`).join("")}
    </select></span>`;
  const modelSel = `<select class="chip" id="chip-model" aria-label="Model">
      ${models.map((m) => `<option value="${esc(m.id)}" ${m.id === opts.model ? "selected" : ""}>${esc(m.label)}</option>`).join("")}
    </select>`;
  const effortSel = `<select class="chip" id="chip-effort" aria-label="Effort">
      ${efforts.map((e) => `<option value="${esc(e)}" ${e === opts.effort ? "selected" : ""}>${esc(e)}</option>`).join("")}
    </select>`;
  const modeSel = `<select class="chip chip-mode-${esc(opts.mode)}" id="chip-mode" aria-label="Mode">
      ${MODES.map((m) => `<option value="${esc(m)}" ${m === opts.mode ? "selected" : ""}>${esc(m)}</option>`).join("")}
    </select>`;

  el.innerHTML = `${providerSel}${modelSel}${effortSel}${modeSel}<span class="grow"></span>
    <button class="icon-btn" title="Attach" aria-label="Attach file">${icons.attach}</button>
    <button class="send" id="send" title="Send (⌘↵)" aria-label="Send">${icons.send}</button>`;

  const onChange = (id: string, fn: (v: string) => void) => {
    const s = document.getElementById(id) as HTMLSelectElement | null;
    if (s) s.addEventListener("change", () => fn(s.value));
  };
  onChange("chip-provider", (v) => {
    const p = state.providers.find((x) => x.id === (v as ProviderId));
    opts.provider = v as ProviderId;
    if (p && !p.models.some((m) => m.id === opts.model)) opts.model = p.models[0].id;
    if (p && !p.efforts.includes(opts.effort)) opts.effort = p.efforts[Math.min(2, p.efforts.length - 1)];
    refreshChips(state);
  });
  onChange("chip-model", (v) => (opts.model = v));
  onChange("chip-effort", (v) => (opts.effort = v as Effort));
  onChange("chip-mode", (v) => {
    opts.mode = v as Mode;
    refreshChips(state);
  });
  const send = document.getElementById("send");
  if (send) send.addEventListener("click", () => submit(state));
}

export function submit(state: UiState): void {
  const input = document.getElementById("input") as HTMLTextAreaElement | null;
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  post({ type: "send", sessionId: state.selectedSessionId, text, options: { ...composerOptions(state) } });
  input.value = "";
  local.composerFor = undefined;
}

export function bindComposerOnce(getState: () => UiState | undefined): void {
  const input = document.getElementById("input") as HTMLTextAreaElement | null;
  if (!input) return;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const s = getState();
      if (s) submit(s);
    }
  });
}
