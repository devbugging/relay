import markdownit from "markdown-it";
import { esc } from "./util";

// html: false escapes any raw HTML in model output, and markdown-it refuses
// javascript:/vbscript: links on its own, so the result is safe to inject.
const md = markdownit({ html: false, linkify: true, breaks: false });

/** Fenced code gets a header with its language and a copy button. */
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const lang = token.info.trim().split(/\s+/)[0];
  return `<div class="code-block">
    <div class="code-head"><span>${esc(lang || "text")}</span><button class="code-copy" data-action="copyCode" title="Copy code">Copy</button></div>
    <pre><code>${esc(token.content)}</code></pre>
  </div>`;
};

export function renderMarkdown(text: string): string {
  return md.render(text);
}
