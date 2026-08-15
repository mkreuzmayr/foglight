/**
 * Two real `foglight serve` processes against one isolated daemon.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
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

const waitForUrl = async (child: ChildProcess, timeoutMs = 15_000): Promise<string> => {
  const start = Date.now();
  let buf = "";
  return new Promise((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const match = buf.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (match !== null) resolve(match[0]);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    const timer = setInterval(() => {
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`timed out waiting for URL\n${buf}`));
      }
    }, 50);
  });
};

const serve = (env: NodeJS.ProcessEnv, dir: string, port: number): ChildProcess =>
  spawn(process.execPath, [cli, "serve", dir, "--port", String(port)], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

describe("two foglight serve processes", () => {
  let runtimeDir = "";
  let children: ChildProcess[] = [];

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
    for (const child of children) {
      child.kill("SIGTERM");
    }
    children = [];
    if (runtimeDir !== "") await rm(runtimeDir, { recursive: true, force: true });
  });

  it("share a daemon and detach independently", async () => {
    runtimeDir = await mkdtemp(join(tmpdir(), "foglight-int-"));
    const clientDir = join(runtimeDir, "client");
    const a = join(runtimeDir, "a");
    const b = join(runtimeDir, "b");
    await mkdir(clientDir);
    await mkdir(join(runtimeDir, "state"));
    await writeProject(a);
    await writeProject(b);

    const port = 41000 + (process.pid % 1000);
    const env = {
      ...process.env,
      FOGLIGHT_RUNTIME_DIR: join(runtimeDir, "state"),
      FOGLIGHT_CLIENT_DIR: clientDir,
    };

    const first = serve(env, a, port);
    children.push(first);
    const url = await waitForUrl(first);

    const one = (await (await fetch(`${url}api/projects`)).json()) as Array<{ path: string }>;
    expect(one).toHaveLength(1);
    expect(one[0]?.path).toContain("/a");

    const second = serve(env, b, port);
    children.push(second);
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
