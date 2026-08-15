import { NodeContext } from "@effect/platform-node";
import { Effect, Fiber } from "effect";
import { createServer, type Socket as NetSocket } from "node:net";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runAttacher } from "../src/attacher.js";
import { writeClaim } from "../src/claim.js";
import type { RuntimeLayout } from "../src/layout.js";
import {
  decodeLine,
  encode,
  Event,
  Hello,
  HelloReplyErr,
  HelloReplyOk,
  type Message,
} from "../src/protocol.js";

const run = <A>(effect: Effect.Effect<A, unknown, NodeContext.NodeContext>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeContext.layer)) as Effect.Effect<A>);

const flags = {
  host: "127.0.0.1",
  port: 4747,
  tailscale: false,
  tailscaleServe: false,
  tailscaleServePort: 4747,
};

const listenFake = (
  socketPath: string,
  onHello: (hello: Hello, reply: (message: Message) => void, sock: NetSocket) => void,
  onMessage?: (message: Message, reply: (message: Message) => void, sock: NetSocket) => void,
) =>
  new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
    const sockets = new Set<NetSocket>();
    const server = createServer((sock) => {
      sockets.add(sock);
      sock.on("close", () => sockets.delete(sock));
      let buf = "";
      sock.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        let nl = buf.indexOf("\n");
        while (nl >= 0) {
          const line = buf.slice(0, nl + 1);
          buf = buf.slice(nl + 1);
          const message = decodeLine(line);
          const reply = (m: Message) => sock.write(encode(m));
          if (message.type === "hello") onHello(message, reply, sock);
          else onMessage?.(message, reply, sock);
          nl = buf.indexOf("\n");
        }
      });
    });
    (server as typeof server & { _sockets: Set<NetSocket> })._sockets = sockets;
    server.on("error", reject);
    server.listen({ path: socketPath }, () => resolve(server));
  });

const closeServer = (server: ReturnType<typeof createServer>) =>
  new Promise<void>((resolve) => {
    const sockets = (server as typeof server & { _sockets?: Set<NetSocket> })._sockets;
    if (sockets !== undefined) for (const sock of sockets) sock.destroy();
    server.close(() => resolve());
  });

describe("runAttacher", () => {
  let dir = "";
  let server: ReturnType<typeof createServer> | undefined;
  let fiber: Fiber.RuntimeFiber<number, unknown> | undefined;

  afterEach(async () => {
    if (fiber !== undefined) {
      await run(Fiber.interrupt(fiber));
      fiber = undefined;
    }
    if (server !== undefined) await closeServer(server);
    server = undefined;
    if (dir !== "") await rm(dir, { recursive: true, force: true });
  });

  const layoutIn = async (): Promise<RuntimeLayout> => {
    dir = await mkdtemp(join(tmpdir(), "foglight-ipc-"));
    return {
      dir,
      claimPath: join(dir, "claim"),
      socketPath: join(dir, "sock"),
      logPath: join(dir, "daemon.log"),
    };
  };

  it("prints the session URL from a live daemon and does not spawn", async () => {
    const layout = await layoutIn();
    let spawned = 0;
    server = await listenFake(layout.socketPath, (_hello, reply) => {
      reply(
        HelloReplyOk.make({
          type: "hello-reply",
          ok: true,
          pid: 99,
          url: "http://127.0.0.1:4747/",
          version: "0.1.0",
          flags,
          projects: [{ name: "foglight", path: "/repo" }],
        }),
      );
    });

    const lines: string[] = [];
    fiber = Effect.runFork(
      runAttacher({
        layout,
        hello: Hello.make({
          type: "hello",
          version: "0.1.0",
          path: "/repo",
          verbose: false,
          flags,
        }),
        mode: "serve",
        spawnDaemon: () =>
          Effect.sync(() => {
            spawned += 1;
          }),
        write: (line) => lines.push(line),
        writeError: (line) => lines.push(line),
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    await expect.poll(() => lines.some((l) => l.includes("http://127.0.0.1:4747/"))).toBe(true);
    expect(spawned).toBe(0);
    await run(Fiber.interrupt(fiber));
  });

  it("prints status and disconnects without staying resident", async () => {
    const layout = await layoutIn();
    server = await listenFake(layout.socketPath, (_hello, reply, sock) => {
      reply(
        HelloReplyOk.make({
          type: "hello-reply",
          ok: true,
          pid: 99,
          url: "http://127.0.0.1:4747/",
          version: "0.1.0",
          flags,
          projects: [{ name: "foglight", path: "/repo" }],
        }),
      );
      sock.end();
    });

    const lines: string[] = [];
    const code = await run(
      runAttacher({
        layout,
        hello: Hello.make({ type: "hello", version: "0.1.0", verbose: false, flags }),
        mode: "status",
        spawnDaemon: () => Effect.void,
        write: (line) => lines.push(line),
        writeError: (line) => lines.push(line),
      }),
    );

    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("pid 99");
    expect(lines.join("\n")).toContain("http://127.0.0.1:4747/");
    expect(lines.join("\n")).toContain("/repo");
  });

  it("exits when the path is already registered", async () => {
    const layout = await layoutIn();
    server = await listenFake(layout.socketPath, (_hello, reply) => {
      reply(
        HelloReplyErr.make({
          type: "hello-reply",
          ok: false,
          error: "path-registered",
          message: "this path is already registered",
        }),
      );
    });

    const lines: string[] = [];
    const code = await run(
      runAttacher({
        layout,
        hello: Hello.make({
          type: "hello",
          version: "0.1.0",
          path: "/repo",
          verbose: false,
          flags,
        }),
        mode: "serve",
        spawnDaemon: () => Effect.void,
        write: (line) => lines.push(line),
        writeError: (line) => lines.push(line),
      }),
    );

    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("this path is already registered");
  });

  it("prints no session when status finds no daemon", async () => {
    const layout = await layoutIn();
    let spawned = 0;
    const lines: string[] = [];
    const code = await run(
      runAttacher({
        layout,
        hello: Hello.make({ type: "hello", version: "0.1.0", verbose: false, flags }),
        mode: "status",
        spawnDaemon: () =>
          Effect.sync(() => {
            spawned += 1;
          }),
        write: (line) => lines.push(line),
        writeError: (line) => lines.push(line),
      }),
    );
    expect(code).toBe(0);
    expect(spawned).toBe(0);
    expect(lines.join("\n").toLowerCase()).toContain("no session");
  });

  it("spawns a daemon when none is listening", async () => {
    const layout = await layoutIn();
    let spawned = 0;
    const lines: string[] = [];
    fiber = Effect.runFork(
      runAttacher({
        layout,
        hello: Hello.make({
          type: "hello",
          version: "0.1.0",
          path: "/repo",
          verbose: false,
          flags,
        }),
        mode: "serve",
        spawnDaemon: () =>
          Effect.promise(async () => {
            spawned += 1;
            server = await listenFake(layout.socketPath, (_hello, reply) => {
              reply(
                HelloReplyOk.make({
                  type: "hello-reply",
                  ok: true,
                  pid: 7,
                  url: "http://127.0.0.1:4747/",
                  version: "0.1.0",
                  flags,
                  projects: [],
                }),
              );
            });
          }),
        write: (line) => lines.push(line),
        writeError: (line) => lines.push(line),
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    await expect.poll(() => lines.some((l) => l.includes("http://127.0.0.1:4747/"))).toBe(true);
    expect(spawned).toBe(1);
    await run(Fiber.interrupt(fiber));
  });

  it("respawns after the daemon socket closes", async () => {
    const layout = await layoutIn();
    let spawned = 0;
    const lines: string[] = [];

    const boot = () =>
      Effect.promise(async () => {
        spawned += 1;
        if (server !== undefined) await closeServer(server);
        await unlink(layout.socketPath).catch(() => undefined);
        server = await listenFake(layout.socketPath, (_hello, reply) => {
          reply(
            HelloReplyOk.make({
              type: "hello-reply",
              ok: true,
              pid: spawned,
              url: `http://127.0.0.1:4747/`,
              version: "0.1.0",
              flags,
              projects: [],
            }),
          );
        });
      });

    fiber = Effect.runFork(
      runAttacher({
        layout,
        hello: Hello.make({
          type: "hello",
          version: "0.1.0",
          path: "/repo",
          verbose: false,
          flags,
        }),
        mode: "serve",
        spawnDaemon: boot,
        write: (line) => lines.push(line),
        writeError: (line) => lines.push(line),
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    await expect.poll(() => spawned).toBe(1);
    await expect
      .poll(() => lines.filter((l) => l.includes("http://127.0.0.1:4747/")).length)
      .toBe(1);

    await run(
      writeClaim(layout.claimPath, {
        pid: 999_999_999,
        port: 4747,
        host: "127.0.0.1",
        version: "0.1.0",
      }),
    );
    await closeServer(server!);
    server = undefined;

    await expect.poll(() => spawned).toBe(2);
    await expect
      .poll(() => lines.filter((l) => l.includes("http://127.0.0.1:4747/")).length)
      .toBe(2);
    await run(Fiber.interrupt(fiber));
  });

  it("warns when serve flags disagree with the daemon's, then attaches", async () => {
    const layout = await layoutIn();
    server = await listenFake(layout.socketPath, (_hello, reply) => {
      reply(
        HelloReplyOk.make({
          type: "hello-reply",
          ok: true,
          pid: 1,
          url: "http://127.0.0.1:4747/",
          version: "0.1.0",
          flags,
          projects: [],
        }),
      );
    });

    const lines: string[] = [];
    fiber = Effect.runFork(
      runAttacher({
        layout,
        hello: Hello.make({
          type: "hello",
          version: "0.1.0",
          path: "/repo",
          verbose: false,
          flags: { ...flags, port: 9999 },
        }),
        mode: "serve",
        spawnDaemon: () => Effect.void,
        write: (line) => lines.push(line),
        writeError: (line) => lines.push(line),
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    await expect.poll(() => lines.some((l) => l.includes("http://127.0.0.1:4747/"))).toBe(true);
    expect(lines.join("\n")).toMatch(/9999/);
    expect(lines.join("\n")).toMatch(/4747/);
  });

  it("asks a version-skewed daemon to shut down, then respawns", async () => {
    const layout = await layoutIn();
    let spawned = 0;
    let shutdowns = 0;
    const lines: string[] = [];

    server = await listenFake(
      layout.socketPath,
      (_hello, reply) => {
        reply(
          HelloReplyErr.make({
            type: "hello-reply",
            ok: false,
            error: "version-skew",
            message: "daemon is 0.1.0; attacher is 0.2.0",
          }),
        );
      },
      (message, _reply, sock) => {
        if (message.type === "shutdown-request") {
          shutdowns += 1;
          sock.destroy();
          if (server !== undefined)
            void closeServer(server).then(() => unlink(layout.socketPath).catch(() => undefined));
        }
      },
    );

    fiber = Effect.runFork(
      runAttacher({
        layout,
        hello: Hello.make({
          type: "hello",
          version: "0.2.0",
          path: "/repo",
          verbose: false,
          flags,
        }),
        mode: "serve",
        spawnDaemon: () =>
          Effect.promise(async () => {
            spawned += 1;
            if (server !== undefined) await closeServer(server);
            await unlink(layout.socketPath).catch(() => undefined);
            server = await listenFake(layout.socketPath, (_hello, reply) => {
              reply(
                HelloReplyOk.make({
                  type: "hello-reply",
                  ok: true,
                  pid: 3,
                  url: "http://127.0.0.1:4747/",
                  version: "0.2.0",
                  flags,
                  projects: [],
                }),
              );
            });
          }),
        write: (line) => lines.push(line),
        writeError: (line) => lines.push(line),
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    await expect.poll(() => shutdowns).toBe(1);
    await expect.poll(() => spawned).toBe(1);
    await expect.poll(() => lines.some((l) => l.includes("http://127.0.0.1:4747/"))).toBe(true);
  });

  it("prints lifecycle events from the daemon", async () => {
    const layout = await layoutIn();
    server = await listenFake(layout.socketPath, (_hello, reply, sock) => {
      reply(
        HelloReplyOk.make({
          type: "hello-reply",
          ok: true,
          pid: 1,
          url: "http://127.0.0.1:4747/",
          version: "0.1.0",
          flags,
          projects: [],
        }),
      );
      sock.write(
        encode(
          Event.make({ type: "event", kind: "project-joined", path: "/other", name: "other" }),
        ),
      );
    });

    const lines: string[] = [];
    fiber = Effect.runFork(
      runAttacher({
        layout,
        hello: Hello.make({
          type: "hello",
          version: "0.1.0",
          path: "/repo",
          verbose: false,
          flags,
        }),
        mode: "serve",
        spawnDaemon: () => Effect.void,
        write: (line) => lines.push(line),
        writeError: (line) => lines.push(line),
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    await expect.poll(() => lines.join("\n")).toMatch(/project joined: other/);
  });
});
