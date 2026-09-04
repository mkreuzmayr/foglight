import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireClaim,
  isProcessAlive,
  readClaim,
  releaseClaim,
  writeClaim,
} from "#foglight/claim.js";

const run = <A>(effect: Effect.Effect<A, unknown, NodeContext.NodeContext>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeContext.layer)) as Effect.Effect<A>);

describe("acquireClaim", () => {
  type Fixture = { dir: string };
  const fixture: Fixture = { dir: "" };

  afterEach(async () => {
    if (fixture.dir !== "") {
      await rm(fixture.dir, { recursive: true, force: true });
    }
  });

  it("wins on a missing path", async () => {
    fixture.dir = await mkdtemp(join(tmpdir(), "foglight-claim-"));
    const path = join(fixture.dir, "claim");
    expect(await run(acquireClaim(path))).toBe(true);
  });

  it("loses when the file already exists", async () => {
    fixture.dir = await mkdtemp(join(tmpdir(), "foglight-claim-"));
    const path = join(fixture.dir, "claim");
    expect(await run(acquireClaim(path))).toBe(true);
    expect(await run(acquireClaim(path))).toBe(false);
  });

  it("can be re-acquired after claim-file-first release", async () => {
    fixture.dir = await mkdtemp(join(tmpdir(), "foglight-claim-"));
    const path = join(fixture.dir, "claim");
    expect(await run(acquireClaim(path))).toBe(true);
    await run(releaseClaim(path));
    expect(await run(acquireClaim(path))).toBe(true);
  });

  it("round-trips a claim record", async () => {
    fixture.dir = await mkdtemp(join(tmpdir(), "foglight-claim-"));
    const path = join(fixture.dir, "claim");
    expect(await run(acquireClaim(path))).toBe(true);
    const record = { pid: 42, port: 4747, host: "127.0.0.1", version: "0.1.0" };
    await run(writeClaim(path, record));
    expect(await run(readClaim(path))).toEqual(record);
  });

  it("a dead pid makes the claim stealable", async () => {
    fixture.dir = await mkdtemp(join(tmpdir(), "foglight-claim-"));
    const path = join(fixture.dir, "claim");
    expect(await run(acquireClaim(path))).toBe(true);
    await run(
      writeClaim(path, { pid: 999_999_999, port: 4747, host: "127.0.0.1", version: "0.1.0" }),
    );

    const record = await run(readClaim(path));
    expect(record).not.toBeNull();
    expect(isProcessAlive(record!.pid)).toBe(false);
    expect(isProcessAlive(process.pid)).toBe(true);
    await run(releaseClaim(path));
    expect(await run(acquireClaim(path))).toBe(true);
  });
});
