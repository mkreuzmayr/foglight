/**
 * Two real `foglight serve` processes against one isolated daemon.
 */
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

const MAP = `---
title: "Probe"
labels: [wayfinder:map]
---

## Destination

probe

## Notes

n

## Decisions so far

## Not yet specified

## Out of scope
`;

const writeProject = async (dir: string): Promise<void> => {
  await mkdir(join(dir, ".wayfinder"), { recursive: true });
  await writeFile(join(dir, ".wayfinder", "map.md"), MAP);
};

const waitForUrl = (child: ChildProcess, timeoutMs = 15_000): Promise<string> => {
  const output: string[] = [];

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout?.off("data", onData);
      child.stderr?.off("data", onData);
      child.off("exit", onExit);
    };

    const onData = (chunk: Buffer) => {
      output.push(chunk.toString("utf8"));
      const match = /http:\/\/127\.0\.0\.1:\d+\//.exec(output.join(""));
      if (match !== null) {
        cleanup();
        resolve(match[0]);
      }
    };

    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`serve exited with ${code}: ${output.join("")}`));
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for URL\n${output.join("")}`));
    }, timeoutMs);

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", onExit);
  });
};

const serve = (env: NodeJS.ProcessEnv, dir: string, port: number): ChildProcess =>
  spawn(process.execPath, [cli, "serve", dir, "--port", String(port)], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

describe("two foglight serve processes", () => {
  type Processes = { runtimeDir: string; children: ChildProcess[] };
  const processes: Processes = { runtimeDir: "", children: [] };

  beforeAll(() => {
    const result = spawnSync("pnpm", ["exec", "tsdown"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
    });

    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || "tsdown failed");
    }
  });

  afterEach(async () => {
    for (const child of processes.children) {
      child.kill("SIGTERM");
    }

    processes.children = [];
    if (processes.runtimeDir !== "") {
      await rm(processes.runtimeDir, { recursive: true, force: true });
    }
  });

  it("share a daemon and detach independently", async () => {
    processes.runtimeDir = await mkdtemp(join(tmpdir(), "foglight-int-"));
    const clientDir = join(processes.runtimeDir, "client");
    const a = join(processes.runtimeDir, "a");
    const b = join(processes.runtimeDir, "b");
    await mkdir(clientDir);
    await mkdir(join(processes.runtimeDir, "state"));
    await writeProject(a);
    await writeProject(b);

    const port = 41000 + (process.pid % 1000);
    const env = {
      ...process.env,
      FOGLIGHT_RUNTIME_DIR: join(processes.runtimeDir, "state"),
      FOGLIGHT_CLIENT_DIR: clientDir,
    };

    const first = serve(env, a, port);
    processes.children.push(first);
    const url = await waitForUrl(first);

    const one = (await (await fetch(`${url}api/projects`)).json()) as { path: string }[];
    expect(one).toHaveLength(1);
    expect(one[0]?.path).toContain("/a");

    const second = serve(env, b, port);
    processes.children.push(second);
    await waitForUrl(second);

    await expect
      .poll(async () => ((await (await fetch(`${url}api/projects`)).json()) as unknown[]).length)
      .toBe(2);

    first.kill("SIGTERM");
    await expect
      .poll(async () => ((await (await fetch(`${url}api/projects`)).json()) as unknown[]).length)
      .toBe(1);

    second.kill("SIGTERM");
    await expect
      .poll(async () => {
        try {
          await fetch(`${url}api/projects`);

          return "up";
        } catch {
          return "down";
        }
      })
      .toBe("down");
  }, 30_000);
});
