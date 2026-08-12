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
import { NodeRuntime } from "@effect/platform-node";
import { AppLayer, boundAddress } from "@foglight/server";
import { Cause, Effect } from "effect";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT, HELP, parseArgv, type Command } from "./argv.js";
import { FUNNEL_WARNING, startTailscaleServe, tailnetAddress } from "./tailscale.js";

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

/**
 * `@effect/platform` wraps the bind failure in a `ServeError` whose own
 * message says nothing useful ("An error has occurred") — the `EADDRINUSE`
 * lives on a nested `cause`. So the chain is walked rather than the rendered
 * text searched, because that text does not contain it.
 */
const isAddressInUse = (error: unknown, depth = 0): boolean => {
  if (depth > 6 || error === null || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: unknown; error?: unknown };
  if (candidate.code === "EADDRINUSE") return true;
  return isAddressInUse(candidate.cause, depth + 1) || isAddressInUse(candidate.error, depth + 1);
};

/** The fatal half of the failure taxonomy (SPEC.md §5), in terminal form. */
const namedTrackerError = (error: unknown): string | null => {
  const tagged = error as { _tag?: string; reason?: string; cwd?: string; id?: string } | null;
  switch (tagged?._tag) {
    case "NoTrackerDetected":
      return (
        `foglight: no tracker here.\n` +
        `  ${tagged.cwd ?? "This directory"} has no .wayfinder/ directory and no GitHub \`origin\` remote.\n` +
        "  Pass --tracker local|github to force one."
      );
    case "TrackerUnreachable":
      return `foglight: cannot reach the tracker.\n  ${tagged.reason ?? ""}`;
    case "TrackerUnauthenticated":
      return (
        `foglight: no credential for this tracker.\n  ${tagged.reason ?? ""}\n` +
        "  Foglight only ever reads; a read-scoped token is enough."
      );
    case "MapUnparseable":
      return `foglight: could not read the map ${tagged.id ?? ""}.\n  ${tagged.reason ?? ""}`;
    default:
      return null;
  }
};

const exposureBanner = (host: string): void => {
  if (host === "127.0.0.1" || host === "localhost" || host === "::1") return;
  console.log(
    [
      "",
      `  ⚠  foglight is bound to ${host} — anything that can reach this port can read this map.`,
      "     It is read-only and there is no login in front of it.",
      "     On a tailnet, prefer --tailscale (binds the tailnet address only) or --tailscale-serve.",
      "",
    ].join("\n"),
  );
};

const runServe = async (command: Extract<Command, { kind: "serve" }>): Promise<void> => {
  const host = command.tailscale ? await tailnetAddress() : command.host;

  const layer = AppLayer({
    repoRoot: resolve(command.repoRoot),
    host,
    port: command.port,
    tracker: command.tracker,
    clientDir: CLIENT_DIR,
  });

  /**
   * Nothing is printed until the socket is actually bound. Announcing a URL
   * and then failing to bind hands the user an address that never worked —
   * and, under `--tailscale-serve`, a live HTTPS mapping pointing at nothing.
   */
  const announce = Effect.gen(function* () {
    yield* boundAddress;

    const serveHandle = command.tailscaleServe
      ? yield* Effect.promise(() => startTailscaleServe(command.tailscaleServePort))
      : null;
    const url = serveHandle?.url ?? `http://${host}:${command.port}/`;

    // Torn down on exit, best-effort: a leaked serve mapping outlives the
    // process and keeps pointing at a port nothing is listening on.
    const teardown = () => {
      if (serveHandle === null) process.exit(0);
      else void serveHandle.stop().finally(() => process.exit(0));
    };
    process.on("SIGINT", teardown);
    process.on("SIGTERM", teardown);

    exposureBanner(host);
    console.log(`  foglight — reading ${resolve(command.repoRoot)}`);
    console.log(`  ${url}\n`);
    yield* Effect.promise(() => printQrCode(url));
    if (serveHandle !== null) console.log(FUNNEL_WARNING);

    yield* Effect.never;
  });

  NodeRuntime.runMain(
    announce.pipe(
      Effect.provide(layer),
      Effect.catchAllCause((cause) => {
        const text = Cause.pretty(cause);
        // No auto-increment: a drifting port invalidates the URL just printed
        // and any `tailscale serve` mapping aimed at it (SPEC.md §4).
        if (isAddressInUse(Cause.squash(cause)) || text.includes("EADDRINUSE")) {
          console.error(
            `foglight: port ${command.port} is already in use.\n` +
              "  Pass --port to choose another. Foglight will not pick one for you:\n" +
              "  a port that moves on its own invalidates the URL it just printed,\n" +
              "  and any `tailscale serve` mapping aimed at it.",
          );
          return Effect.sync(() => process.exit(1));
        }
        // Fatal tracker errors are *named* states, not crashes — the whole
        // point of the taxonomy is that "which one" is most of the diagnosis.
        // A stack trace here would bury that.
        const named = namedTrackerError(Cause.squash(cause));
        return Effect.sync(() => {
          console.error(named ?? text);
          process.exit(1);
        });
      }),
    ),
  );
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
    case "serve":
      await runServe(command);
  }
};

void main().catch((error: unknown) => {
  die(error instanceof Error ? error.message : String(error));
});

export { DEFAULT_PORT };
