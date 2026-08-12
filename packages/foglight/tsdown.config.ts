import { defineConfig } from "tsdown";

/**
 * The published bundle (SPEC.md §11).
 *
 * `core`, `server`, the Electron main process and the npm runtime deps
 * (`effect`, `@effect/platform`) are **bundled in**, which erases every
 * `workspace:*` dependency — the published package resolves none of them, and
 * the tarball is the entire download for a headless user.
 *
 * `electron` stays **external**: it is resolved for its *binary path*, not its
 * code. The bin runs under plain Node, where `require('electron')` returns the
 * path to the executable, which the bin then spawns.
 */
export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    "electron/main": "../electron/src/main.ts",
  },
  format: "esm",
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  dts: false, // this is a CLI, not an import target
  sourcemap: false,
  // `.js`, not `.mjs`: the package is `"type": "module"`, and `bin` points at
  // `dist/cli.js`.
  outExtensions: () => ({ js: ".js" }),
  deps: {
    neverBundle: ["electron"],
    // `qrcode` is bundled like everything else; it is small, and it is the
    // reason a phone can reach a headless instance without anyone retyping a
    // MagicDNS name off a terminal.
    alwaysBundle: [/^@foglight\//, "effect", /^@effect\//, "qrcode"],
  },
});
