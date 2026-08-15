/**
 * The Electron main process (SPEC.md §2).
 *
 * **The window is a client of the same server headless runs.** This process
 * starts the shared `AppLayer` on an OS-ephemeral port and points a
 * `BrowserWindow` at `http://127.0.0.1:<port>`. There is no IPC transport and
 * no preload API surface, because the renderer is an ordinary HTTP client —
 * exactly the one a browser on a tailnet would be.
 *
 * `ManagedRuntime` rather than `NodeRuntime.runMain`: Electron owns the
 * process lifecycle, so the runtime must be something we dispose on quit
 * rather than something that installs its own exit handling.
 */
import { AppLayer, boundAddress } from "@foglight/server";
import type { TrackerOverride } from "@foglight/core";
import { app, BrowserWindow, shell } from "electron";
import { Effect, ManagedRuntime } from "effect";
import { join } from "node:path";

export type GuiOptions = {
  readonly repoRoot: string;
  readonly tracker: TrackerOverride;
  readonly clientDir: string;
};

const WINDOW = { width: 1440, height: 900, minWidth: 880, minHeight: 560 };

export const runGui = async (options: GuiOptions): Promise<void> => {
  const runtime = ManagedRuntime.make(
    AppLayer({
      initialProject: { path: options.repoRoot, tracker: options.tracker },
      host: "127.0.0.1",
      // The GUI takes whatever port the OS gives it and accepts no --port
      // flag: nothing outside this process ever needs to name it.
      port: 0,
      clientDir: options.clientDir,
    }),
  );

  const address = await runtime.runPromise(
    boundAddress.pipe(Effect.map((bound) => (bound._tag === "TcpAddress" ? bound.port : 0))),
  );

  if (address === 0) {
    throw new Error("foglight: the server did not bind a TCP port");
  }

  await app.whenReady();

  const window = new BrowserWindow({
    ...WINDOW,
    show: false,
    backgroundColor: "#08080a", // matches --color-ground, so no white flash
    title: "foglight",
    autoHideMenuBar: true,
    webPreferences: {
      // No preload, no node integration: the renderer is a web page talking
      // HTTP to localhost, and giving it more would be giving it more than the
      // headless browser has.
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  await window.loadURL(`http://127.0.0.1:${address}`);

  // Links in ticket bodies belong in the user's browser, not in this window —
  // a viewer that can be navigated away from its own map is a broken viewer.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => {
    void runtime.dispose();
  });
};

/**
 * Entry point when Electron runs this file as its app. Options ride in through
 * the environment because the `foglight` bin spawns the Electron binary as a
 * child process — argv there belongs to Electron itself.
 */
const main = async () => {
  await runGui({
    repoRoot: process.env["FOGLIGHT_REPO"] ?? process.cwd(),
    tracker: (process.env["FOGLIGHT_TRACKER"] as TrackerOverride) || null,
    clientDir: process.env["FOGLIGHT_CLIENT_DIR"] ?? join(import.meta.dirname, "../client"),
  });
};

if (process.env["FOGLIGHT_ELECTRON_ENTRY"] === "1") {
  void main().catch((error: unknown) => {
    console.error(error);
    app.exit(1);
  });
}
