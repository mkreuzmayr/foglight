/**
 * Resident attacher: connect-or-spawn, handshake, print the session, stay
 * until the socket closes or the process is interrupted.
 */
import { FileSystem } from "@effect/platform";
import { Duration, Effect } from "effect";
import { createConnection, type Socket } from "node:net";
import { acquireClaim, isProcessAlive, readClaim, releaseClaim } from "./claim.js";
import type { RuntimeLayout } from "./layout.js";
import {
  decodeLine,
  encode,
  ShutdownRequest,
  type Hello,
  type Message,
  type ServeFlags,
} from "./protocol.js";

export type AttacherMode = "serve" | "status";

export type AttacherInput = {
  readonly layout: RuntimeLayout;
  readonly hello: Hello;
  readonly mode: AttacherMode;
  readonly spawnDaemon: () => Effect.Effect<void>;
  readonly write: (line: string) => void;
  readonly writeError: (line: string) => void;
  readonly printQr?: (url: string) => Effect.Effect<void>;
};

const connect = (path: string): Effect.Effect<Socket, Error> =>
  Effect.async<Socket, Error>((resume) => {
    const socket = createConnection({ path });
    const onConnect = () => {
      socket.off("error", onError);
      resume(Effect.succeed(socket));
    };
    const onError = (error: Error) => {
      socket.off("connect", onConnect);
      resume(Effect.fail(error));
    };
    socket.once("connect", onConnect);
    socket.once("error", onError);
  });

const lineReader = (socket: Socket) => {
  let buf = "";
  const waiters: Array<(line: Effect.Effect<string, Error>) => void> = [];
  let closed: Error | null = null;

  const flush = () => {
    while (waiters.length > 0) {
      if (closed !== null) {
        waiters.shift()?.(Effect.fail(closed));
        continue;
      }
      const nl = buf.indexOf("\n");
      if (nl < 0) break;
      const line = buf.slice(0, nl + 1);
      buf = buf.slice(nl + 1);
      waiters.shift()?.(Effect.succeed(line));
    }
  };

  socket.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    flush();
  });
  socket.on("close", () => {
    closed = new Error("socket closed");
    flush();
  });
  socket.on("error", (error) => {
    closed = error;
    flush();
  });

  return {
    read: (): Effect.Effect<string, Error> =>
      Effect.async<string, Error>((resume) => {
        waiters.push(resume);
        flush();
      }),
  };
};

const send = (socket: Socket, message: Message): Effect.Effect<void> =>
  Effect.sync(() => {
    socket.write(encode(message));
  });

const flagWarning = (wanted: ServeFlags, actual: ServeFlags): string | null => {
  const bits: string[] = [];
  if (wanted.port !== actual.port)
    bits.push(`--port ${wanted.port} ignored; daemon is on ${actual.port}`);
  if (wanted.host !== actual.host)
    bits.push(`--host ${wanted.host} ignored; daemon is on ${actual.host}`);
  if (wanted.tailscale !== actual.tailscale) {
    bits.push(
      `--tailscale ignored; daemon ${actual.tailscale ? "has" : "has not"} bound the tailnet`,
    );
  }
  if (wanted.tailscaleServe !== actual.tailscaleServe) {
    bits.push(
      `--tailscale-serve ignored; daemon ${actual.tailscaleServe ? "has" : "has not"} delegated HTTPS`,
    );
  }
  return bits.length === 0 ? null : `foglight: ${bits.join("; ")}`;
};

const waitUntilClose = (socket: Socket): Effect.Effect<void> =>
  Effect.async<void>((resume) => {
    if (socket.destroyed) return resume(Effect.void);
    socket.once("close", () => resume(Effect.void));
  });

const printEvent = (input: AttacherInput, message: Message): void => {
  if (message.type === "event") {
    if (message.kind === "daemon-exiting") input.write("  daemon exiting");
    else if (message.kind === "project-joined") {
      input.write(`  project joined: ${message.name ?? ""} (${message.path ?? ""})`);
    } else {
      input.write(`  project left: ${message.name ?? ""} (${message.path ?? ""})`);
    }
  } else if (message.type === "log-line" && input.hello.verbose) {
    input.write(message.line);
  }
};

const session = (input: AttacherInput, socket: Socket): Effect.Effect<number, unknown> =>
  Effect.gen(function* () {
    const lines = lineReader(socket);
    yield* send(socket, input.hello);
    const reply = decodeLine(yield* lines.read());
    if (reply.type === "hello-reply" && !reply.ok && reply.error === "version-skew") {
      yield* send(socket, ShutdownRequest.make({ type: "shutdown-request" }));
      yield* waitUntilClose(socket);
      return 0;
    }
    if (reply.type !== "hello-reply" || !reply.ok) {
      input.writeError(
        reply.type === "hello-reply" && !reply.ok
          ? `foglight: ${reply.message}`
          : "foglight: handshake failed",
      );
      return 1;
    }
    if (input.mode === "status") {
      input.write(`  pid ${reply.pid}`);
      input.write(`  ${reply.url}`);
      for (const project of reply.projects) {
        input.write(`  ${project.name}  ${project.path}`);
      }
      return 0;
    }
    const warning = flagWarning(input.hello.flags, reply.flags);
    if (warning !== null) input.writeError(warning);
    input.write(`  ${reply.url}`);
    if (input.printQr !== undefined) yield* input.printQr(reply.url);
    for (;;) {
      const next = yield* lines.read().pipe(Effect.either);
      if (next._tag === "Left") return 0;
      printEvent(input, decodeLine(next.right));
    }
  });

export const runAttacher = (
  input: AttacherInput,
): Effect.Effect<number, unknown, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(input.layout.dir, { recursive: true });
    let spawnedAt: number | null = null;
    for (;;) {
      const opened = yield* connect(input.layout.socketPath).pipe(Effect.either);
      if (opened._tag === "Right") {
        const code = yield* Effect.acquireUseRelease(
          Effect.succeed(opened.right),
          (socket) => session(input, socket),
          (socket) => Effect.sync(() => socket.destroy()),
        );
        if (input.mode === "status" || code !== 0) return code;
        spawnedAt = null;
        continue;
      }
      if (input.mode === "status") {
        input.write("no session");
        return 0;
      }
      if (spawnedAt !== null && Date.now() - spawnedAt > 8_000) {
        input.writeError(`foglight: daemon failed to start. See ${input.layout.logPath}`);
        return 1;
      }
      if (yield* acquireClaim(input.layout.claimPath)) {
        yield* input.spawnDaemon();
        spawnedAt = Date.now();
      } else {
        const record = yield* readClaim(input.layout.claimPath);
        if (record !== null && !isProcessAlive(record.pid)) {
          yield* releaseClaim(input.layout.claimPath);
        }
      }
      yield* Effect.sleep(Duration.millis(50));
    }
  });
