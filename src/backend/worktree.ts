import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import type { Worktree } from "../api/types";

/** Where session worktrees live, outside the project so search and watchers don't see copies. */
const WORKTREES_DIR = path.join(os.homedir(), ".relay", "worktrees");
/** Finished worktrees are moved here instead of deleted, so files git never had (ignored, untracked) survive. */
const TRASH_DIR = path.join(os.homedir(), ".relay", "trash");

export type MergeResult = { ok: true; merged: boolean } | { ok: false; conflicts: string[] } | { ok: false; error: string };

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || stdout || err.message).trim()));
      else resolve(stdout.trim());
    });
  });
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  return git(cwd, ["rev-parse", "--is-inside-work-tree"]).then(
    (out) => out === "true",
    () => false,
  );
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "session";
}

/**
 * Checks out a new branch off the current one in its own worktree. The agent
 * works in the same subfolder of it that `cwd` is of the project.
 */
export async function createWorktree(cwd: string, sessionId: string, title: string): Promise<Worktree> {
  const root = await git(cwd, ["rev-parse", "--show-toplevel"]);
  const base = await git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => {
    throw new Error("Can't start a worktree: the project isn't on a branch (detached HEAD).");
  });
  const id = sessionId.split("-").pop() || sessionId;
  const branch = `relay/${slug(title)}-${id}`;
  const wtPath = path.join(WORKTREES_DIR, `${path.basename(root)}-${id}`);
  await fs.mkdir(WORKTREES_DIR, { recursive: true });
  await git(root, ["worktree", "add", "-b", branch, wtPath, "HEAD"]);
  await linkNodeModules(root, wtPath);
  return { path: wtPath, cwd: path.join(wtPath, path.relative(root, cwd)), branch, base };
}

/** Git doesn't copy ignored folders; share the project's installed packages instead. */
async function linkNodeModules(root: string, wtPath: string): Promise<void> {
  const source = path.join(root, "node_modules");
  const link = path.join(wtPath, "node_modules");
  if (!(await exists(source)) || (await exists(link))) return;
  await fs.symlink(source, link, "dir");
  // `node_modules/` in .gitignore only matches folders, not a symlink; keep it out of commits.
  const ignored = await git(wtPath, ["check-ignore", "-q", "node_modules"]).then(
    () => true,
    () => false,
  );
  if (ignored) return;
  const exclude = path.join(await git(wtPath, ["rev-parse", "--path-format=absolute", "--git-common-dir"]), "info", "exclude");
  await fs.mkdir(path.dirname(exclude), { recursive: true });
  await fs.appendFile(exclude, "\n/node_modules\n");
}

/**
 * Unstages new symlinks that point outside the worktree (like a link back to
 * the main checkout). Committed, they'd replace the real folder on merge.
 */
async function unstageOutsideLinks(wtPath: string): Promise<void> {
  const raw = (await git(wtPath, ["diff", "--cached", "--no-renames", "--diff-filter=AT", "--raw", "-z"])).split("\0");
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const file = raw[i + 1];
    if (raw[i].split(" ")[1] !== "120000") continue;
    const target = path.resolve(path.dirname(path.join(wtPath, file)), await fs.readlink(path.join(wtPath, file)));
    const rel = path.relative(wtPath, target);
    if (rel.startsWith("..") || path.isAbsolute(rel)) await git(wtPath, ["rm", "--cached", "-q", "--", file]);
  }
}

/**
 * Paths the branch adds that already exist on disk in the project. They're
 * untracked or ignored there, and git merge silently replaces ignored ones.
 */
async function untrackedInTheWay(projectCwd: string, wt: Worktree): Promise<string[]> {
  const root = await git(projectCwd, ["rev-parse", "--show-toplevel"]);
  const added = (await git(projectCwd, ["diff", "--name-only", "--no-renames", "--diff-filter=A", "-z", wt.base, wt.branch])).split("\0").filter(Boolean);
  const found = new Set<string>();
  for (const file of added) {
    if (await exists(path.join(root, file))) found.add(file);
    // A file or symlink where the branch needs a folder gets replaced too.
    for (let dir = path.dirname(file); dir !== "."; dir = path.dirname(dir)) {
      const stat = await fs.lstat(path.join(root, dir)).catch(() => undefined);
      if (stat && !stat.isDirectory()) found.add(dir);
    }
  }
  return [...found];
}

/**
 * Commits what's left in the worktree, brings its branch up to date with the
 * base, merges it into the project with a merge commit, then moves the
 * worktree to the trash and deletes the branch. Conflicts are left for the agent to resolve in the
 * worktree; nothing is changed in the project folder unless the merge is clean.
 */
export async function mergeWorktree(projectCwd: string, wt: Worktree, title: string): Promise<MergeResult> {
  try {
    if (await git(wt.path, ["status", "--porcelain"])) {
      await git(wt.path, ["add", "-A"]);
      await unstageOutsideLinks(wt.path);
      const staged = await git(wt.path, ["diff", "--cached", "--quiet"]).then(
        () => false,
        () => true,
      );
      if (staged) await git(wt.path, ["commit", "-m", title]);
    }
    try {
      await git(wt.path, ["merge", "--no-edit", wt.base]);
    } catch (err) {
      const conflicts = (await git(wt.path, ["diff", "--name-only", "--diff-filter=U"]).catch(() => "")).split("\n").filter(Boolean);
      await git(wt.path, ["merge", "--abort"]).catch(() => undefined);
      if (conflicts.length) return { ok: false, conflicts };
      throw err;
    }

    const current = await git(projectCwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => "");
    if (current !== wt.base) {
      return { ok: false, error: `The project folder is on ${current || "a detached HEAD"}, not ${wt.base}. Switch back to ${wt.base} and complete again.` };
    }
    const ahead = Number(await git(projectCwd, ["rev-list", "--count", `${wt.base}..${wt.branch}`]));
    if (ahead > 0) {
      const clobbered = await untrackedInTheWay(projectCwd, wt);
      if (clobbered.length) {
        return { ok: false, error: `Merging would overwrite files in the project that git doesn't track: ${clobbered.join(", ")}. Move them away or remove them from the session's branch, then complete again.` };
      }
      try {
        await git(projectCwd, ["merge", "--no-ff", "--no-edit", "-m", `Merge ${wt.branch}: ${title}`, wt.branch]);
      } catch (err) {
        await git(projectCwd, ["merge", "--abort"]).catch(() => undefined);
        throw err;
      }
    }

    await fs.mkdir(TRASH_DIR, { recursive: true });
    await fs.rename(wt.path, path.join(TRASH_DIR, `${path.basename(wt.path)}-${Date.now()}`));
    await git(projectCwd, ["worktree", "prune"]);
    await git(projectCwd, ["branch", "-d", wt.branch]);
    return { ok: true, merged: ahead > 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
