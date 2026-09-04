import { setTimeout as delay } from "node:timers/promises";
/**
 * The server, end to end, against this repo's own `.wayfinder/`.
 *
 * The things worth asserting here are the ones a unit test cannot see: that
 * percent-encoded ids survive the path router, that the SSE feed opens with a
 * complete truth rather than waiting for a change, and that a touched file
 * produces a fresh snapshot with a *higher* revision — the ordering guarantee
 * the whole transport rests on.
 */

import { Effect, Fiber, ManagedRuntime, Stream, SubscriptionRef, Duration } from "effect";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { idFor, makeId, MapNotFound } from "@foglight/core";
import type { PollMode, TrackerAdapter } from "@foglight/core";
import { AppLayer, attachProject, boundAddress, detachProject } from "#server/index.js";
import { MapStore, layer as storeLayer } from "#server/store.js";

const repoRoot = new URL("../../../", import.meta.url).pathname;
const canonicalPath = realpathSync(repoRoot);
const PROJECT_ID = idFor(canonicalPath);
const MAP_ID = `${PROJECT_ID}:local:.wayfinder/map.md`;
const encoded = encodeURIComponent(MAP_ID);

type ServerState = { baseUrl: string; stop: () => void };
const serverState: ServerState = { baseUrl: "", stop: () => undefined };

beforeAll(async () => {
  const layer = AppLayer({
    initialProject: { path: repoRoot, tracker: null },
    host: "127.0.0.1",
    port: 0, // ephemeral: parallel test runs must not fight over 4747
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

  serverState.baseUrl = await started.promise;
  serverState.stop = () => void Effect.runFork(Fiber.interrupt(fiber));
}, 30_000);

afterAll(() => serverState.stop());

describe("api", () => {
  it("lists the attached folder as a project", async () => {
    const response = await fetch(`${serverState.baseUrl}/api/projects`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: PROJECT_ID,
        name: basename(canonicalPath),
        path: canonicalPath,
        state: "ready",
        trackerKind: "local",
      },
    ]);
  });

  it("lists this repo's maps", async () => {
    const response = await fetch(`${serverState.baseUrl}/api/maps`);
    expect(response.status).toBe(200);
    const maps = (await response.json()) as {
      id: string;
      project?: { id: string; name: string };
    }[];

    expect(maps.map((m) => m.id).toSorted()).toEqual([
      `${PROJECT_ID}:local:.wayfinder/map.md`,
      `${PROJECT_ID}:local:.wayfinder/project-handling.map.md`,
    ]);

    expect(
      maps.every(
        (m) => m.project?.id === PROJECT_ID && m.project?.name === basename(canonicalPath),
      ),
    ).toBe(true);
  });

  it("serves a snapshot under a percent-encoded id", async () => {
    // Map ids contain `:` and `/`. If the router decoded before matching, this
    // would 404 — and the failure would only ever show up at runtime.
    const response = await fetch(`${serverState.baseUrl}/api/maps/${encoded}`);
    expect(response.status).toBe(200);
    const snapshot = (await response.json()) as {
      tickets: unknown[];
      revision: number;
      id: string;
      project?: { id: string; name: string };
    };

    expect(snapshot.id).toBe(MAP_ID);
    expect(snapshot.project).toEqual({ id: PROJECT_ID, name: basename(canonicalPath) });
    expect(snapshot.tickets).toHaveLength(10);
    expect(snapshot.revision).toBeGreaterThan(0);
  });

  it("qualifies nested resource ids on a snapshot", async () => {
    const handling = encodeURIComponent(`${PROJECT_ID}:local:.wayfinder/project-handling.map.md`);
    const response = await fetch(`${serverState.baseUrl}/api/maps/${handling}`);
    expect(response.status).toBe(200);
    const snapshot = (await response.json()) as {
      tickets: { id: string; graduatedFrom?: string }[];
      fog: { id: string }[];
      outOfScope: { id: string }[];
      warnings: { subject: string | null }[];
    };

    const prefixed = (id: string) => id.startsWith(`${PROJECT_ID}:`);
    expect(snapshot.tickets.length).toBeGreaterThan(0);
    expect(snapshot.tickets.every((t) => prefixed(t.id))).toBe(true);
    expect(
      snapshot.tickets.every((t) => t.graduatedFrom === undefined || prefixed(t.graduatedFrom)),
    ).toBe(true);

    expect(snapshot.fog.length).toBeGreaterThan(0);
    expect(snapshot.fog.every((f) => prefixed(f.id))).toBe(true);
    expect(snapshot.outOfScope.length).toBeGreaterThan(0);
    expect(snapshot.outOfScope.every((o) => prefixed(o.id))).toBe(true);
    expect(snapshot.warnings.every((w) => w.subject === null || prefixed(w.subject))).toBe(true);

    const ticketId = snapshot.tickets[0]!.id;
    const body = await fetch(
      `${serverState.baseUrl}/api/maps/${handling}/tickets/${encodeURIComponent(ticketId)}/body`,
    );

    expect(body.status).toBe(200);
  });

  it("serves the map body separately from its structure", async () => {
    const response = await fetch(`${serverState.baseUrl}/api/maps/${encoded}/body`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { markdown: string; bodyHash: string };
    expect(body.markdown).toContain("## Destination");
    expect(body.bodyHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("serves a ticket body", async () => {
    const ticketId = encodeURIComponent("local:.wayfinder/tickets/005-map-graph-ui-prototype.md");
    const response = await fetch(
      `${serverState.baseUrl}/api/maps/${encoded}/tickets/${ticketId}/body`,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { markdown: string };
    expect(body.markdown).toContain("## Question");
  });

  it("gives a named 404 for a map that isn't there", async () => {
    const response = await fetch(
      `${serverState.baseUrl}/api/maps/${encodeURIComponent("local:nope.md")}`,
    );

    expect(response.status).toBe(404);
    expect(((await response.json()) as { _tag: string })._tag).toBe("MapNotFound");
  });

  it("404s an unknown path rather than serving index.html", async () => {
    // Addressing is query params, so there is no SPA catch-all to fall into.
    expect((await fetch(`${serverState.baseUrl}/some/deep/path`)).status).toBe(404);
  });

  it("serves the client bundle at the root", async () => {
    const response = await fetch(`${serverState.baseUrl}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<div id="root">');
  });
});

describe("sse", () => {
  it("opens with a complete truth, then pushes a newer revision on change", async () => {
    const response = await fetch(`${serverState.baseUrl}/api/events?map=${encoded}`);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader: ReadableStreamDefaultReader<Uint8Array> = response.body!.getReader();
    const decoder = new TextDecoder();
    type StreamState = { buffered: string };
    const streamState: StreamState = { buffered: "" };
    const revisions: number[] = [];
    const events: string[] = [];

    const pump = (async () => {
      while (revisions.length < 2) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        streamState.buffered += decoder.decode(value, { stream: true });
        for (const match of streamState.buffered.matchAll(/^event: (\w+)$/gm)) {
          events.push(match[1]!);
        }

        for (const match of streamState.buffered.matchAll(/^id: (\d+)$/gm)) {
          const revision = Number(match[1]);
          if (!revisions.includes(revision)) {
            revisions.push(revision);
          }
        }
      }
    })();

    // Give the initial burst a moment, then move the map.
    await delay(500);
    const now = new Date();
    await utimes(`${repoRoot}.wayfinder/map.md`, now, now);

    await Promise.race([pump, delay(8000)]);
    void reader.cancel();

    expect(events).toContain("maps");
    expect(events).toContain("map");
    expect(events).toContain("projects");
    // Monotonic, and strictly increasing: this is what lets a client discard a
    // GET that resolves after a push without comparing contents.
    expect(revisions.length).toBeGreaterThanOrEqual(2);
    expect(revisions[1]).toBeGreaterThan(revisions[0]!);
  }, 20_000);
});

describe("empty session", () => {
  const runtime = ManagedRuntime.make(
    AppLayer({ host: "127.0.0.1", port: 0, clientDir: `${repoRoot}packages/client/dist` }),
  );

  const sessionState = { url: "" };

  beforeAll(async () => {
    const address = await runtime.runPromise(
      boundAddress.pipe(Effect.map((bound) => (bound._tag === "TcpAddress" ? bound.port : 0))),
    );

    sessionState.url = `http://127.0.0.1:${address}`;
  }, 30_000);

  afterAll(async () => {
    await runtime.dispose();
  });

  it("lists no projects", async () => {
    const response = await fetch(`${sessionState.url}/api/projects`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("treats detach of an unknown path as a no-op", async () => {
    await runtime.runPromise(detachProject({ path: "/no/such/foglight-project" }));
    const response = await fetch(`${sessionState.url}/api/projects`);
    expect(await response.json()).toEqual([]);
  });

  it("attaches a folder as a project", async () => {
    await runtime.runPromise(attachProject({ path: canonicalPath }));
    const response = await fetch(`${sessionState.url}/api/projects`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: PROJECT_ID,
        name: basename(canonicalPath),
        path: canonicalPath,
        state: "ready",
        trackerKind: "local",
      },
    ]);
  });

  it("lists maps of a project attached at runtime", async () => {
    const response = await fetch(`${sessionState.url}/api/maps`);
    expect(response.status).toBe(200);
    const maps = (await response.json()) as { id: string }[];
    expect(maps.map((m) => m.id)).toContain(MAP_ID);
  });

  it("refuses a path that does not exist", async () => {
    const result = await runtime.runPromise(
      attachProject({ path: "/no/such/foglight-project" }).pipe(Effect.either),
    );

    expect(result._tag).toBe("Left");
    expect(result).toMatchObject({ _tag: "Left", left: { _tag: "ProjectPathInvalid" } });
  });

  it("attaches a folder with no tracker as an empty project", async () => {
    const dir = await mkdtemp(join(tmpdir(), "foglight-empty-"));
    await runtime.runPromise(attachProject({ path: dir }));
    const projects = (await (await fetch(`${sessionState.url}/api/projects`)).json()) as {
      path: string;
      state: string;
      trackerKind?: string;
    }[];

    const attached = projects.find((p) => p.path === realpathSync(dir));
    expect(attached?.state).toBe("no-tracker");
    expect(attached?.trackerKind).toBeUndefined();
  });

  it("attaches a forced tracker that cannot resolve as an error project", async () => {
    const dir = await mkdtemp(join(tmpdir(), "foglight-forced-"));
    await runtime.runPromise(attachProject({ path: dir, tracker: "local" }));
    const projects = (await (await fetch(`${sessionState.url}/api/projects`)).json()) as {
      path: string;
      state: string;
      trackerKind?: string;
    }[];

    const attached = projects.find((p) => p.path === realpathSync(dir));
    expect(attached?.state).toBe("error");
    expect(attached?.trackerKind).toBe("local");
  });

  it("brings an empty project alive when a tracker appears", async () => {
    const dir = await mkdtemp(join(tmpdir(), "foglight-live-"));
    const canonical = realpathSync(dir);
    await runtime.runPromise(attachProject({ path: dir }));
    await mkdir(join(dir, ".wayfinder"));
    await writeFile(
      join(dir, ".wayfinder/map.md"),
      [
        "---",
        'title: "Live"',
        "labels: [wayfinder:map]",
        "---",
        "",
        "## Destination",
        "",
        "Alive.",
        "",
      ].join("\n"),
    );

    const deadline = Date.now() + 5000;
    type Observed = { state: string | undefined };
    const observed: Observed = { state: "no-tracker" };
    while (Date.now() < deadline) {
      const projects = (await (await fetch(`${sessionState.url}/api/projects`)).json()) as {
        path: string;
        state: string;
      }[];

      observed.state = projects.find((p) => p.path === canonical)?.state;
      if (observed.state === "ready") {
        break;
      }

      await delay(50);
    }

    expect(observed.state).toBe("ready");
    const maps = (await (await fetch(`${sessionState.url}/api/maps`)).json()) as { id: string }[];
    expect(maps.some((m) => m.id === `${idFor(canonical)}:local:.wayfinder/map.md`)).toBe(true);
  }, 10_000);

  it("pushes a projects event when a project attaches or detaches", async () => {
    const dir = await mkdtemp(join(tmpdir(), "foglight-sse-"));
    const canonical = realpathSync(dir);
    const response = await fetch(`${sessionState.url}/api/events`);
    const reader: ReadableStreamDefaultReader<Uint8Array> = response.body!.getReader();
    const decoder = new TextDecoder();
    type StreamState = { buffered: string };
    const streamState: StreamState = { buffered: "" };
    const lists: { path: string }[][] = [];

    const pump = (async () => {
      while (lists.length < 3) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        streamState.buffered += decoder.decode(value, { stream: true });
        const chunks = [...streamState.buffered.matchAll(/^event: projects\ndata: (\{.*\})$/gm)];
        lists.length = 0;
        for (const chunk of chunks) {
          const payload = JSON.parse(chunk[1]!) as { projects: { path: string }[] };
          lists.push(payload.projects);
        }
      }
    })();

    await delay(300);
    await runtime.runPromise(attachProject({ path: dir }));
    await runtime.runPromise(detachProject({ path: dir }));

    await Promise.race([pump, delay(5000)]);
    void reader.cancel();

    expect(lists.some((projects) => projects.some((p) => p.path === canonical))).toBe(true);
    expect(lists.some((projects) => !projects.some((p) => p.path === canonical))).toBe(true);
    const attached = lists.findIndex((projects) => projects.some((p) => p.path === canonical));
    const detached = lists.findIndex(
      (projects, i) => i > attached && !projects.some((p) => p.path === canonical),
    );

    expect(attached).toBeGreaterThanOrEqual(0);
    expect(detached).toBeGreaterThan(attached);
  }, 10_000);

  it("serves maps from two ready projects at once", async () => {
    const dir = await mkdtemp(join(tmpdir(), "foglight-second-"));
    await mkdir(join(dir, ".wayfinder"));
    await writeFile(
      join(dir, ".wayfinder/map.md"),
      [
        "---",
        'title: "Second"',
        "labels: [wayfinder:map]",
        "---",
        "",
        "## Destination",
        "",
        "Another folder.",
        "",
      ].join("\n"),
    );

    const second = realpathSync(dir);
    await runtime.runPromise(attachProject({ path: dir }));
    await runtime.runPromise(attachProject({ path: canonicalPath }));

    const projects = (await (await fetch(`${sessionState.url}/api/projects`)).json()) as {
      path: string;
      state: string;
    }[];

    expect(projects.some((p) => p.path === canonicalPath && p.state === "ready")).toBe(true);
    expect(projects.some((p) => p.path === second && p.state === "ready")).toBe(true);

    const maps = (await (await fetch(`${sessionState.url}/api/maps`)).json()) as { id: string }[];
    expect(maps.map((m) => m.id)).toContain(MAP_ID);
    expect(maps.map((m) => m.id)).toContain(`${idFor(second)}:local:.wayfinder/map.md`);
  });

  it("removes a project on detach", async () => {
    await runtime.runPromise(detachProject({ path: canonicalPath }));
    const projects = (await (await fetch(`${sessionState.url}/api/projects`)).json()) as {
      path: string;
    }[];

    expect(projects.some((p) => p.path === canonicalPath)).toBe(false);
  });
});

const silentAdapter = (label: string): TrackerAdapter => ({
  kind: "github",
  label,
  listMaps: () => Effect.succeed([]),
  loadMap: (id) => new MapNotFound({ id: String(id) }),
  loadMapBody: (id) => new MapNotFound({ id: String(id) }),
  loadTicketBody: (_mapId, ticketId) => new MapNotFound({ id: String(ticketId) }),
  changes: () => Stream.empty,
});

describe("cadence", () => {
  it("polls a GitHub project fast only while one of its maps is on screen", async () => {
    const cadenceA = await Effect.runPromise(SubscriptionRef.make<PollMode>("paused"));
    const cadenceB = await Effect.runPromise(SubscriptionRef.make<PollMode>("paused"));
    const runtime = ManagedRuntime.make(
      storeLayer(silentAdapter("a/a"), cadenceA, { id: "proj-a", name: "A" }),
    );

    const modes = await runtime.runPromise(
      Effect.gen(function* () {
        const store = yield* MapStore;
        yield* store.add({
          adapter: silentAdapter("b/b"),
          project: { id: "proj-b", name: "B" },
          cadence: cadenceB,
        });

        const fiber = yield* store
          .subscribe(makeId("proj-a:github:a/a#1"))
          .pipe(Stream.runDrain, Effect.fork);

        yield* Effect.sleep(Duration.millis(80));
        const watching = {
          a: yield* SubscriptionRef.get(cadenceA),
          b: yield* SubscriptionRef.get(cadenceB),
        };

        yield* Fiber.interrupt(fiber);
        yield* Effect.sleep(Duration.millis(80));
        const idle = {
          a: yield* SubscriptionRef.get(cadenceA),
          b: yield* SubscriptionRef.get(cadenceB),
        };

        return { watching, idle };
      }),
    );

    await runtime.dispose();
    expect(modes.watching).toEqual({ a: "active", b: "idle" });
    expect(modes.idle).toEqual({ a: "paused", b: "paused" });
  });
});
