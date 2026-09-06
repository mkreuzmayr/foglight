/**
 * The O_EXCL claim file that decides who spawns the daemon
 * (research/daemon-discovery.md). `wx` is atomic on every local filesystem.
 */
import { FileSystem } from "@effect/platform";
import type { Error as PlatformError } from "@effect/platform";
import { Effect, Schema } from "effect";

export class ClaimRecord extends Schema.Class<ClaimRecord>("ClaimRecord")({
  pid: Schema.Number,
  port: Schema.Number,
  host: Schema.String,
  version: Schema.String,
}) {}

const alreadyHeld = (error: PlatformError.PlatformError): boolean =>
  error._tag === "SystemError" && error.reason === "AlreadyExists";

/** `true` if this process created the file; `false` if someone else holds it. */
export const acquireClaim = (
  path: string,
): Effect.Effect<boolean, PlatformError.PlatformError, FileSystem.FileSystem> =>
  FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) => fs.writeFile(path, new Uint8Array(), { flag: "wx", mode: 0o600 })),
    Effect.as(true),
    Effect.catchIf(alreadyHeld, () => Effect.succeed(false)),
  );

/** Remove the claim so the next attacher can spawn. Missing file is a no-op. */
export const releaseClaim = (
  path: string,
): Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem> =>
  FileSystem.FileSystem.pipe(Effect.flatMap((fs) => fs.remove(path, { force: true })));

export const writeClaim = (
  path: string,
  record: ClaimRecord,
): Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem> =>
  FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) => fs.writeFileString(path, `${JSON.stringify(record)}\n`)),
  );

export const readClaim = (
  path: string,
): Effect.Effect<ClaimRecord | null, PlatformError.PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const raw = yield* fs.readFileString(path).pipe(Effect.orElseSucceed(() => ""));
    if (raw.trim() === "") {
      return null;
    }

    try {
      return yield* Schema.decodeUnknown(ClaimRecord)(JSON.parse(raw)).pipe(
        Effect.orElseSucceed(() => null),
      );
    } catch {
      return null;
    }
  });

/** `kill(pid, 0)`: ESRCH means dead. EPERM still means alive. Never proves identity. */
export const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH");
  }
};
