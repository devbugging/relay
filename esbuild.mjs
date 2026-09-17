import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const extension = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  external: ["vscode"],
  outfile: "dist/extension.js",
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

// The webview runs in Chromium, but we still transpile down to ES2019 so the
// bundle carries no optional chaining or nullish coalescing.
const webview = {
  entryPoints: ["src/webview/main.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2019",
  outfile: "dist/webview.js",
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

const css = {
  entryPoints: ["src/webview/styles.css"],
  bundle: true,
  outfile: "dist/webview.css",
  minify: production,
  logLevel: "info",
};

if (watch) {
  const contexts = await Promise.all([extension, webview, css].map((c) => esbuild.context(c)));
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  await Promise.all([extension, webview, css].map((c) => esbuild.build(c)));
}
