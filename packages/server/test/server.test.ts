/**
 * The server, end to end, against this repo's own `.wayfinder/`.
 *
 * The things worth asserting here are the ones a unit test cannot see: that
 * percent-encoded ids survive the path router, that the SSE feed opens with a
 * complete truth rather than waiting for a change, and that a touched file
 * produces a fresh snapshot with a *higher* revision — the ordering guarantee
 * the whole transport rests on.
 */

import { Effect, Fiber } from "effect";
import { utimes } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppLayer, boundAddress } from "../src/index.js";

const repoRoot = new URL("../../../", import.meta.url).pathname;
const MAP_ID = "local:.wayfinder/map.md";
const encoded = encodeURIComponent(MAP_ID);

let baseUrl = "";
let stop: () => void = () => {};

beforeAll(async () => {
  const layer = AppLayer({
    repoRoot,
    host: "127.0.0.1",
    port: 0, // ephemeral: parallel test runs must not fight over 4747
    tracker: null,
    clientDir: `${repoRoot}packages/client/dist`,
  });

  const started = Promise.withResolvers<string>();
  const fiber = Effect.runFork(
    Effect.gen(function* () {
      const address = yield* boundAddress;
      started.resolve(`http://127.0.0.1:${address._tag === "TcpAddress" ? address.port : 0}`);
      yield* Effect.never;
    }).pipe(Effect.provide(layer), Effect.scoped),
  );

  baseUrl = await started.promise;
  stop = () => void Effect.runFork(Fiber.interrupt(fiber));
}, 30_000);

afterAll(() => stop());

describe("api", () => {
  it("lists this repo's one map", async () => {
    const response = await fetch(`${baseUrl}/api/maps`);
    expect(response.status).toBe(200);
    const maps = (await response.json()) as Array<{ id: string; closedCount: number }>;
    expect(maps).toHaveLength(1);
    expect(maps[0]?.id).toBe(MAP_ID);
  });

  it("serves a snapshot under a percent-encoded id", async () => {
    // Map ids contain `:` and `/`. If the router decoded before matching, this
    // would 404 — and the failure would only ever show up at runtime.
    const response = await fetch(`${baseUrl}/api/maps/${encoded}`);
    expect(response.status).toBe(200);
    const snapshot = (await response.json()) as { tickets: unknown[]; revision: number };
    expect(snapshot.tickets).toHaveLength(10);
    expect(snapshot.revision).toBeGreaterThan(0);
  });

  it("serves the map body separately from its structure", async () => {
    const response = await fetch(`${baseUrl}/api/maps/${encoded}/body`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { markdown: string; bodyHash: string };
    expect(body.markdown).toContain("## Destination");
    expect(body.bodyHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("serves a ticket body", async () => {
    const ticketId = encodeURIComponent("local:.wayfinder/tickets/005-map-graph-ui-prototype.md");
    const response = await fetch(`${baseUrl}/api/maps/${encoded}/tickets/${ticketId}/body`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { markdown: string };
    expect(body.markdown).toContain("## Question");
  });

  it("gives a named 404 for a map that isn't there", async () => {
    const response = await fetch(`${baseUrl}/api/maps/${encodeURIComponent("local:nope.md")}`);
    expect(response.status).toBe(404);
    expect(((await response.json()) as { _tag: string })._tag).toBe("MapNotFound");
  });

  it("404s an unknown path rather than serving index.html", async () => {
    // Addressing is query params, so there is no SPA catch-all to fall into.
    expect((await fetch(`${baseUrl}/some/deep/path`)).status).toBe(404);
  });

  it("serves the client bundle at the root", async () => {
    const response = await fetch(`${baseUrl}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<div id="root">');
  });
});

describe("sse", () => {
  it("opens with a complete truth, then pushes a newer revision on change", async () => {
    const response = await fetch(`${baseUrl}/api/events?map=${encoded}`);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    const revisions: number[] = [];
    const events: string[] = [];

    const pump = (async () => {
      while (revisions.length < 2) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        for (const match of buffered.matchAll(/^event: (\w+)$/gm)) events.push(match[1]!);
        for (const match of buffered.matchAll(/^id: (\d+)$/gm)) {
          const revision = Number(match[1]);
          if (!revisions.includes(revision)) revisions.push(revision);
        }
      }
    })();

    // Give the initial burst a moment, then move the map.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const now = new Date();
    await utimes(`${repoRoot}.wayfinder/map.md`, now, now);

    await Promise.race([pump, new Promise((resolve) => setTimeout(resolve, 8000))]);
    void reader.cancel();

    expect(events).toContain("maps");
    expect(events).toContain("map");
    // Monotonic, and strictly increasing: this is what lets a client discard a
    // GET that resolves after a push without comparing contents.
    expect(revisions.length).toBeGreaterThanOrEqual(2);
    expect(revisions[1]).toBeGreaterThan(revisions[0]!);
  }, 20_000);
});
