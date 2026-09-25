import * as fs from "fs";
import * as path from "path";

// Anything shaped like a file path with an extension: src/a.ts, ./x/y.md, /abs/z.json, package.json.
// Most matches aren't files ("e.g.", "v1.2"); the existence check below weeds them out.
const CANDIDATE = /(?:\.{1,2}\/|\/)?(?:[\w@.-]+\/)*[\w@-][\w@.-]*\.[A-Za-z0-9]{1,10}\b/g;

/** Strings in the texts that name an existing file or folder, relative to cwd or absolute. */
export function findLinkable(texts: string[], cwd: string): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const text of texts) {
    for (const match of text.match(CANDIDATE) || []) {
      if (seen.has(match)) continue;
      seen.add(match);
      if (fs.existsSync(resolveIn(cwd, match))) found.push(match);
    }
  }
  return found;
}

export function resolveIn(cwd: string, p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(cwd, p);
}
