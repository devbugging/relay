import { spawn, type ChildProcess } from "child_process";

/** Only macOS for now: caffeinate ships with it and cleans up after us on its own. */
export const keepAwakeSupported = process.platform === "darwin";

/**
 * Holds a macOS "prevent idle sleep" assertion while on. The display may still
 * sleep, and closing the lid still sleeps the Mac.
 */
export class KeepAwake {
  private child: ChildProcess | undefined;

  set(on: boolean): void {
    if (!keepAwakeSupported || on === !!this.child) return;
    if (!on) return this.release();
    // -w: caffeinate exits by itself if the extension host dies without releasing.
    const child = spawn("/usr/bin/caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" });
    child.on("error", (err) => console.error("Relay: caffeinate failed", err));
    child.on("exit", () => {
      if (this.child === child) this.child = undefined;
    });
    this.child = child;
  }

  dispose(): void {
    this.release();
  }

  private release(): void {
    if (this.child) this.child.kill();
    this.child = undefined;
  }
}
