/**
 * The serve daemon: HTTP AppLayer plus the IPC socket attachers hold open.
 * Last attacher out: claim-file-first, then teardown, then exit.
 */
import {
  AppLayer,
  attachProject,
  boundAddress,
  detachProject,
  ProjectSession,
} from "@foglight/server";
import { Effect, ManagedRuntime } from "effect";
import { chmod, realpath, unlink } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { writeClaim, releaseClaim } from "./claim.js";
import { hostLayout, type RuntimeLayout } from "./layout.js";
import {
  LogLine,
  decodeLine,
  encode,
  Event,
  HelloReplyErr,
  HelloReplyOk,
  type Hello,
  type Message,
  type ServeFlags,
} from "./protocol.js";
import {
  FUNNEL_WARNING,
  startTailscaleServe,
  tailnetAddress,
  type ServeHandle,
} from "./tailscale.js";

export type DaemonInput = {
  readonly layout: RuntimeLayout;
  readonly flags: ServeFlags;
  readonly version: string;
  readonly clientDir: string;
};

type Peer = {
  readonly socket: Socket;
  path?: string;
  verbose: boolean;
};

const send = (socket: Socket, message: Message): void => {
  socket.write(encode(message));
};

const asRefs = (projects: ReadonlyArray<{ name: string; path: string }>) =>
  projects.map((p) => ({ name: p.name, path: p.path }));

const readMessages = (socket: Socket, onMessage: (message: Message) => void): void => {
  let buf = "";
  socket.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      const line = buf.slice(0, nl + 1);
      buf = buf.slice(nl + 1);
      try {
        onMessage(decodeLine(line));
      } catch {
        /* drop a torn line; the next one will resync */
      }
      nl = buf.indexOf("\n");
    }
  });
};

export const runDaemon = async (input: DaemonInput): Promise<void> => {
  const flags = input.flags;
  const host = flags.tailscale ? await tailnetAddress() : flags.host;
  const runtime = ManagedRuntime.make(
    AppLayer({
      host,
      port: flags.port,
      clientDir: input.clientDir,
    }),
  );

  const peers = new Set<Peer>();
  let shuttingDown = false;
  let serveHandle: ServeHandle | null = null;
  let url = `http://${host}:${flags.port}/`;

  const broadcast = (message: Message, except?: Socket): void => {
    for (const peer of peers) {
      if (peer.socket === except) continue;
      send(peer.socket, message);
    }
  };

  const attacherCount = (): number => [...peers].filter((p) => p.path !== undefined).length;

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    broadcast(Event.make({ type: "event", kind: "daemon-exiting" }));
    await runtime.runPromise(releaseClaim(input.layout.claimPath)).catch(() => undefined);
    if (serveHandle !== null) await serveHandle.stop();
    for (const peer of peers) peer.socket.destroy();
    // Watchers and detect-loops are forkDaemon fibers; dispose can hang on
    // them. Bound it so last-detach actually exits instead of leaving a
    // process that has already torn down Tailscale and is no longer serving.
    await Promise.race([runtime.dispose(), new Promise((resolve) => setTimeout(resolve, 1500))]);
    process.exit(0);
  };

  try {
    await runtime.runPromise(
      writeClaim(input.layout.claimPath, {
        pid: process.pid,
        port: flags.port,
        host,
        version: input.version,
      }),
    );

    const address = await runtime.runPromise(boundAddress);
    const port = address._tag === "TcpAddress" ? address.port : flags.port;
    url = `http://${host}:${port}/`;

    if (flags.tailscaleServe) {
      serveHandle = await startTailscaleServe(flags.tailscaleServePort);
      url = serveHandle.url;
      console.log(FUNNEL_WARNING);
    } else if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
      console.log(
        [
          "",
          `  ⚠  foglight is bound to ${host} — anything that can reach this port can read this map.`,
          "     It is read-only and there is no login in front of it.",
          "     On a tailnet, prefer --tailscale (binds the tailnet address only) or --tailscale-serve.",
          "",
        ].join("\n"),
      );
    }

    await runtime.runPromise(
      writeClaim(input.layout.claimPath, {
        pid: process.pid,
        port,
        host,
        version: input.version,
      }),
    );

    if (process.platform !== "win32") {
      await unlink(input.layout.socketPath).catch(() => undefined);
    }

    const ipc = createServer();
    await new Promise<void>((resolve, reject) => {
      ipc.once("error", reject);
      ipc.listen({ path: input.layout.socketPath }, () => resolve());
    });
    if (process.platform !== "win32") {
      await chmod(input.layout.socketPath, 0o600).catch(() => undefined);
    }

    const handleHello = async (peer: Peer, hello: Hello): Promise<void> => {
      if (hello.version !== input.version) {
        send(
          peer.socket,
          HelloReplyErr.make({
            type: "hello-reply",
            ok: false,
            error: "version-skew",
            message: `daemon is ${input.version}; attacher is ${hello.version}`,
          }),
        );
        return;
      }

      const listed = await runtime.runPromise(ProjectSession.pipe(Effect.flatMap((s) => s.list)));

      const requested = hello.path;
      if (requested === undefined) {
        send(
          peer.socket,
          HelloReplyOk.make({
            type: "hello-reply",
            ok: true,
            pid: process.pid,
            url,
            version: input.version,
            flags,
            projects: asRefs(listed),
          }),
        );
        return;
      }

      const canonical = await realpath(requested).catch(() => requested);

      if ([...peers].some((p) => p.path === canonical)) {
        send(
          peer.socket,
          HelloReplyErr.make({
            type: "hello-reply",
            ok: false,
            error: "path-registered",
            message: "this path is already registered",
          }),
        );
        return;
      }

      const attached = await runtime.runPromise(
        attachProject({ path: canonical, tracker: hello.tracker ?? null }).pipe(Effect.either),
      );
      if (attached._tag === "Left") {
        send(
          peer.socket,
          HelloReplyErr.make({
            type: "hello-reply",
            ok: false,
            error: "path-invalid",
            message: String(attached.left),
          }),
        );
        return;
      }

      peer.path = canonical;
      const after = await runtime.runPromise(ProjectSession.pipe(Effect.flatMap((s) => s.list)));
      send(
        peer.socket,
        HelloReplyOk.make({
          type: "hello-reply",
          ok: true,
          pid: process.pid,
          url,
          version: input.version,
          flags,
          projects: asRefs(after),
        }),
      );
      broadcast(
        Event.make({
          type: "event",
          kind: "project-joined",
          path: canonical,
          name: attached.right.name,
        }),
        peer.socket,
      );
      console.log(`project joined: ${attached.right.name} (${canonical})`);
    };

    ipc.on("connection", (socket) => {
      const peer: Peer = { socket, verbose: false };
      peers.add(peer);
      readMessages(socket, (message) => {
        if (message.type === "hello") {
          peer.verbose = message.verbose;
          void handleHello(peer, message);
        }
        if (message.type === "shutdown-request") void shutdown();
      });
      socket.on("close", () => {
        peers.delete(peer);
        if (peer.path === undefined) return;
        const path = peer.path;
        void runtime
          .runPromise(detachProject({ path }))
          .then(() => {
            broadcast(Event.make({ type: "event", kind: "project-left", path, name: path }));
            console.log(`project left: ${path}`);
            if (attacherCount() === 0) void shutdown();
          })
          .catch(() => {
            if (attacherCount() === 0) void shutdown();
          });
      });
    });

    console.log(`foglight daemon listening on ${url}`);

    const originalLog = console.log.bind(console);
    console.log = (...args: unknown[]) => {
      originalLog(...args);
      const line = args.map(String).join(" ");
      for (const peer of peers) {
        if (peer.verbose) send(peer.socket, LogLine.make({ type: "log-line", line }));
      }
    };
  } catch (error) {
    console.error(error);
    await runtime.runPromise(releaseClaim(input.layout.claimPath)).catch(() => undefined);
    await runtime.dispose();
    process.exit(1);
  }
};

/** Bind the daemon to this machine's layout. */
export const runDaemonFromFlags = (
  flags: ServeFlags,
  version: string,
  clientDir: string,
): Promise<void> => runDaemon({ layout: hostLayout(), flags, version, clientDir });
