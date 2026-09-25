import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Finds a CLI the way a login shell would. VS Code launched from the Dock has
 * a minimal PATH, so the usual install locations are checked as well.
 */
export function findExecutable(name: string, override?: string): string | undefined {
  if (override) return isExecutable(override) ? override : undefined;
  const home = os.homedir();
  const exe = process.platform === "win32" ? [`${name}.exe`, `${name}.cmd`] : [name];
  const dirs = [
    ...(process.env.PATH || "").split(path.delimiter),
    path.join(home, ".local", "bin"),
    path.join(home, `.${name}`, "bin"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".bun", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  for (const dir of dirs) {
    if (!dir) continue;
    for (const file of exe) {
      const candidate = path.join(dir, file);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return undefined;
}

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}
