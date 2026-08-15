#!/usr/bin/env node
/**
 * The `foglight` bin (SPEC.md §4, §11).
 *
 * This file runs under **plain Node**, never under Electron. That is what
 * makes the packaging work: `require('electron')` from Node returns the path
 * to the Electron *executable*, which this script spawns with the app
 * directory. Electron itself is a plain dependency and stays external to the
 * bundle for exactly that reason — it is resolved for its binary path, not for
 * its code. Everything else is bundled in, so the published package resolves
 * no `workspace:*` dependency and the tarball is the whole download.
 */
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAttacher } from "./attacher.js";
import { DEFAULT_PORT, HELP, parseArgv, type Command } from "./argv.js";
import { runDaemonFromFlags } from "./daemon.js";
import { Hello } from "./protocol.js";
import { hostLayout } from "./layout.js";
import { spawnDetachedDaemon } from "./spawn.js";

const here = dirname(fileURLToPath(import.meta.url));
/** `dist/client/` sits beside `dist/cli.js` in the published tarball. */
const CLIENT_DIR = join(here, "client");

const version = (): string => {
  try {
    return (
      JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as { version: string }
    ).version;
  } catch {
    return "0.0.0";
  }
};

const die = (message: string): never => {
  console.error(message);
  process.exit(1);
};

/**
 * Launch the desktop window by spawning the Electron binary on this same
 * package. The first launch on a machine that has never run Electron is where
 * the ~120 MB binary downloads — and if that machine is offline or cannot
 * reach GitHub, **it fails here, at launch, not at install**. The message says
 * so, names `ELECTRON_MIRROR`, and points at the alternative that works.
 */
const launchGui = (command: Extract<Command, { kind: "gui" }>): void => {
  const require = createRequire(import.meta.url);
  let electronPath: string;
  try {
    electronPath = require("electron") as string;
  } catch {
    return void die(
      "foglight: could not resolve the Electron binary.\n" +
        "  Electron downloads on first GUI launch, so this usually means no network or a blocked github.com.\n" +
        "  Set ELECTRON_MIRROR to a reachable mirror, or run `foglight serve` instead —\n" +
        "  headless needs no Electron binary at all.",
    );
  }

  const child = spawn(electronPath, [join(here, "electron", "main.js")], {
    stdio: "inherit",
    env: {
      ...process.env,
      FOGLIGHT_ELECTRON_ENTRY: "1",
      FOGLIGHT_REPO: resolve(command.repoRoot),
      FOGLIGHT_CLIENT_DIR: CLIENT_DIR,
      ...(command.tracker === null ? {} : { FOGLIGHT_TRACKER: command.tracker }),
    },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
};

const printQrCode = async (url: string): Promise<void> => {
  try {
    const { toString } = await import("qrcode");
    // The phone browser is the main reason the tailnet path exists — a URL you
    // have to retype from a terminal onto a phone is a URL you don't use.
    console.log(await toString(url, { type: "terminal", small: true }));
  } catch {
    /* a missing QR is not worth failing a startup over */
  }
};

const clientDir = (): string => process.env.FOGLIGHT_CLIENT_DIR ?? CLIENT_DIR;

const runAttached = async (
  command: Extract<Command, { kind: "serve" }> | Extract<Command, { kind: "status" }>,
): Promise<void> => {
  const layout = hostLayout();
  if (layout.warning !== undefined) console.error(`foglight: ${layout.warning}`);

  const serve = command.kind === "serve" ? command : null;
  const flags = {
    host: serve?.host ?? "127.0.0.1",
    port: serve?.port ?? 4747,
    tailscale: serve?.tailscale ?? false,
    tailscaleServe: serve?.tailscaleServe ?? false,
    tailscaleServePort: serve?.tailscaleServePort ?? 4747,
  };

  const hello = Hello.make({
    type: "hello",
    version: version(),
    verbose: serve?.verbose ?? false,
    flags,
    ...(serve === null ? {} : { path: resolve(serve.repoRoot) }),
    ...(serve?.tracker ? { tracker: serve.tracker } : {}),
  });

  const code = await Effect.runPromise(
    runAttacher({
      layout,
      hello,
      mode: command.kind === "status" ? "status" : "serve",
      spawnDaemon: () =>
        Effect.sync(() =>
          spawnDetachedDaemon({
            layout,
            flags,
            script: process.argv[1] ?? fileURLToPath(import.meta.url),
            clientDir: clientDir(),
          }),
        ),
      write: (line) => console.log(line),
      writeError: (line) => console.error(line),
      printQr: (url) => Effect.promise(() => printQrCode(url)),
    }).pipe(Effect.provide(NodeContext.layer)),
  );
  process.exit(code);
};

const main = async (): Promise<void> => {
  const command = parseArgv(process.argv, process.cwd());

  switch (command.kind) {
    case "help":
      console.log(HELP);
      return;
    case "version":
      console.log(version());
      return;
    case "error":
      die(`foglight: ${command.message}\n\nRun \`foglight --help\`.`);
      return;
    case "gui":
      launchGui(command);
      return;
    case "status":
      await runAttached(command);
      return;
    case "serve":
      await runAttached(command);
      return;
    case "daemon":
      await runDaemonFromFlags(
        {
          host: command.host,
          port: command.port,
          tailscale: command.tailscale,
          tailscaleServe: command.tailscaleServe,
          tailscaleServePort: command.tailscaleServePort,
        },
        version(),
        clientDir(),
      );
  }
};

void main().catch((error: unknown) => {
  die(error instanceof Error ? error.message : String(error));
});

export { DEFAULT_PORT };
