/**
 * Detached daemon spawn. Effect's Command cannot detach, so this is raw
 * `child_process.spawn` (research/daemon-discovery.md).
 */
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import type { RuntimeLayout } from "./layout.js";
import type { ServeFlags } from "./protocol.js";

export const spawnDetachedDaemon = (input: {
  readonly layout: RuntimeLayout;
  readonly flags: ServeFlags;
  readonly script: string;
  readonly clientDir: string;
}): void => {
  mkdirSync(input.layout.dir, { recursive: true, mode: 0o700 });
  const logFd = openSync(input.layout.logPath, "a");
  const args = [
    input.script,
    "daemon",
    "--host",
    input.flags.host,
    "--port",
    String(input.flags.port),
    "--tailscale-serve-port",
    String(input.flags.tailscaleServePort),
  ];

  if (input.flags.tailscale) {
    args.push("--tailscale");
  }

  if (input.flags.tailscaleServe) {
    args.push("--tailscale-serve");
  }

  const child = spawn(process.execPath, [...process.execArgv, ...args], {
    detached: true,
    windowsHide: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, FOGLIGHT_CLIENT_DIR: input.clientDir },
  });

  child.unref();
  closeSync(logFd);
};
