import { spawn } from "child_process";
import * as os from "os";
import { findExecutable } from "./binaries";

const TIMEOUT_MS = 60 * 1000;
const MAX_INPUT = 2000;
const MAX_TITLE = 60;

const PROMPT = [
  "You name coding-chat sessions for a sidebar list.",
  "The <stdin> block holds the session's current title and the user's latest message.",
  "Reply with a one-line title (at most 6 words) saying what the latest message is about.",
  "If the message is a short follow-up that doesn't change the topic (\"yes\", \"do it\", \"commit\"), reply with the current title unchanged.",
  "Reply with the title only: no quotes, no trailing period. Do not run any commands or read any files.",
].join("\n");

/** Writes a session title for the latest message; resolves undefined when it can't. */
export type Titler = (message: string, currentTitle: string) => Promise<string | undefined>;

/**
 * Asks a small Codex model for the title, as a one-off `codex exec` that runs
 * read-only and leaves no session behind.
 */
export function codexTitler(codexPath: () => string | undefined, model: () => string): Titler {
  return (message, currentTitle) => {
    const exe = findExecutable("codex", codexPath());
    if (!exe) return Promise.resolve(undefined);
    const input = `Current title: ${currentTitle}\n\nLatest message:\n${message.slice(0, MAX_INPUT)}`;
    const args = ["exec", "-m", model(), "-c", "model_reasoning_effort=low", "-s", "read-only", "--ephemeral", "--skip-git-repo-check", "--ignore-rules", "--color", "never", PROMPT];
    return new Promise((resolve) => {
      const child = spawn(exe, args, { cwd: os.tmpdir(), stdio: ["pipe", "pipe", "ignore"] });
      let out = "";
      const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
      child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
      child.on("error", () => resolve(undefined));
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve(code === 0 ? clean(out) : undefined);
      });
      child.stdin.end(input);
    });
  };
}

function clean(raw: string): string | undefined {
  const line = raw.trim().split("\n")[0].trim().replace(/^["'`]+|["'`.]+$/g, "").trim();
  if (!line) return undefined;
  return line.length > MAX_TITLE ? line.slice(0, MAX_TITLE - 1) + "…" : line;
}
