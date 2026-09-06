/**
 * The local adapter, run against **this repo's own `.wayfinder/`**.
 *
 * A fixture would only prove the parser agrees with itself. Foglight's first
 * real map is the one that produced foglight, so that is what these assert on.
 */
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { frontier, stateOf } from "#core/domain/derive.js";
import { makeId } from "#core/domain/model.js";
import type { MapSnapshot } from "#core/domain/model.js";
import {
  entryKey,
  parseInlineList,
  splitFrontmatter,
  splitSections,
} from "#core/parse/markdown.js";
import { parseMapBody, parseTicketBody } from "#core/parse/body.js";
import { makeLocalAdapter } from "#core/tracker/local.js";
import { parseGitHubRemote } from "#core/tracker/resolve.js";

const repoRoot = new URL("../../../", import.meta.url).pathname;

const run = <A>(effect: Effect.Effect<A, unknown, NodeContext.NodeContext>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeContext.layer)) as Effect.Effect<A>);

describe("markdown parsing", () => {
  it("splits frontmatter from body", () => {
    const { frontmatter, body } = splitFrontmatter('---\ntitle: "X"\n---\n\n## Question\n\nWhy?\n');
    expect(frontmatter).toContain("title");
    expect(body.trim()).toBe("## Question\n\nWhy?");
  });

  it("reads inline lists in either notation", () => {
    expect(parseInlineList("[wayfinder:map]")).toEqual(["wayfinder:map"]);
    expect(parseInlineList("001, 002")).toEqual(["001", "002"]);
    expect(parseInlineList("[]")).toEqual([]);
    expect(parseInlineList(undefined)).toEqual([]);
  });

  it("keys an entry on its bolded lead term, and hashes the ones without", () => {
    expect(entryKey("**Write operations** — claiming from the UI").slug).toBe("write-operations");
    // Non-conforming entries still get a stable key — and no warning.
    expect(entryKey("no bold here at all").slug).toMatch(/^h-[0-9a-f]{8}$/);
  });

  it("keeps a section's own content when a heading repeats", () => {
    const sections = splitSections("## A\none\n## B\ntwo");
    expect(sections.get("a")).toBe("one");
    expect(sections.get("b")).toBe("two");
  });
});

describe("git remote parsing", () => {
  it("reads owner/repo out of every url shape", () => {
    expect(parseGitHubRemote("git@github.com:pingdotgg/t3code.git")).toEqual({
      owner: "pingdotgg",
      repo: "t3code",
    });

    expect(parseGitHubRemote("https://github.com/a/b")).toEqual({ owner: "a", repo: "b" });
    expect(parseGitHubRemote("https://gitlab.com/a/b")).toBeNull();
  });
});

describe("ticket bodies", () => {
  it("marks a ticket with no question as malformed rather than dropping it", () => {
    const parsed = parseTicketBody("## Notes\n\nsomething");
    expect(parsed.question).toBe("");
    expect(parsed.resolution).toBeNull();
  });
});

describe("this repo's map", () => {
  const load = run(
    Effect.gen(function* () {
      const adapter = yield* makeLocalAdapter(repoRoot);

      return yield* adapter.loadMap(makeId("local:.wayfinder/map.md"));
    }),
  );

  it("loads with its real title and destination", async () => {
    const snapshot = await load;
    expect(snapshot.title).toBe("Foglight — wayfinder map viewer");
    expect(snapshot.destination).toContain("SPEC.md");
    expect(snapshot.tracker).toBe("local");
  });

  it("finds all ten tickets, every one closed", async () => {
    const snapshot = await load;
    expect(snapshot.tickets).toHaveLength(10);
    expect(snapshot.tickets.every((t) => t.status === "closed")).toBe(true);
    expect(snapshot.tickets.map((t) => t.shortId)).toContain("005");
  });

  it("reads the out-of-scope section the graph cannot draw", async () => {
    const snapshot = await load;
    const terms = snapshot.outOfScope.map((o) => o.term);
    expect(terms).toContain("Write operations");
    expect(terms).toContain("Multi-repo serving");
  });

  it("resolves unpadded blocked-by ids against zero-padded ticket ids", async () => {
    const snapshot = await load;
    // The map writes `blocked-by: [1, 6]`; the tickets are `001` and `006`.
    // If these don't reconcile, every edge silently vanishes and every blocked
    // ticket looks takeable.
    const packaging = snapshot.tickets.find((t) => t.shortId === "009");
    expect(packaging?.blockedBy).toEqual(["001", "006"]);
    expect(snapshot.tickets.find((t) => t.shortId === "005")?.blockedBy).toEqual(["003"]);
    expect(snapshot.warnings.filter((w) => w.kind === "dangling-edge")).toHaveLength(0);
  });

  it("draws a blocking edge for every blocked-by entry", async () => {
    const snapshot = await load;
    const edges = snapshot.tickets.flatMap((t) => t.blockedBy.map((b) => `${b}->${t.shortId}`));
    expect(edges).toEqual(["003->005", "001->006", "006->007", "001->009", "006->009", "009->010"]);
  });

  it("has an empty frontier and no fog — the destination is reached", async () => {
    const snapshot = await load;
    expect(frontier(snapshot)).toHaveLength(0);
    expect(snapshot.fog).toHaveLength(0);
    expect(snapshot.tickets.every((t) => stateOf(t, snapshot) === "closed")).toBe(true);
  });

  it("lists itself as a descriptor without loading dependencies", async () => {
    const descriptors = await run(
      Effect.gen(function* () {
        const adapter = yield* makeLocalAdapter(repoRoot);

        return yield* adapter.listMaps();
      }),
    );

    expect(descriptors).toHaveLength(2);
    expect(descriptors.map((d) => d.id).toSorted()).toEqual([
      "local:.wayfinder/map.md",
      "local:.wayfinder/project-handling.map.md",
    ]);

    expect(descriptors.find((d) => d.id === "local:.wayfinder/map.md")?.closedCount).toBe(10);
    expect(descriptors.find((d) => d.id === "local:.wayfinder/map.md")?.openCount).toBe(0);
  });
});

describe("derivation", () => {
  it("calls an open, unblocked, unclaimed ticket the frontier", () => {
    const snapshot = snapshotWith([
      { shortId: "001", status: "closed", assignee: "me", blockedBy: [] },
      { shortId: "002", status: "open", assignee: null, blockedBy: ["001"] },
      { shortId: "003", status: "open", assignee: null, blockedBy: ["002"] },
      { shortId: "004", status: "open", assignee: "me", blockedBy: [] },
    ]);

    expect(frontier(snapshot).map((t) => t.shortId)).toEqual(["002"]);
    expect(stateOf(snapshot.tickets[3]!, snapshot)).toBe("claimed");
    expect(stateOf(snapshot.tickets[2]!, snapshot)).toBe("blocked");
  });

  it("does not let a nonexistent blocker pin a ticket shut", () => {
    const snapshot = snapshotWith([
      { shortId: "002", status: "open", assignee: null, blockedBy: ["999"] },
    ]);

    expect(frontier(snapshot).map((t) => t.shortId)).toEqual(["002"]);
  });
});

describe("map body", () => {
  it("hangs a fog patch on the open tickets its prose names", () => {
    const parsed = parseMapBody(
      [
        "## Destination",
        "",
        "Somewhere.",
        "",
        "## Not yet specified",
        "",
        "- **Live-update mechanics** — transport and cadence; hangs on 004 and the UI prototype.",
        "- **Something adrift** — nothing named here at all.",
      ].join("\n"),
      [
        { shortId: "004", title: "Tracker adapter interface design", status: "open" },
        { shortId: "007", title: "Live-update transport", status: "open" },
      ],
    );

    expect(parsed.fog).toHaveLength(2);
    expect(parsed.fog[0]?.hangsOn).toEqual(["004"]);
    // A patch naming nothing floats at the fog band — an answer, not a failure.
    expect(parsed.fog[1]?.hangsOn).toEqual([]);
  });
});

describe("real-world tolerance", () => {
  // Found by pointing foglight at an actual project rather than at this repo:
  // its map lives in an undotted `wayfinder/` and its frontmatter says
  // `label:`, not `labels:`. Neither is exotic, and both failed silently —
  // the directory by finding no maps at all, the key by marking every single
  // ticket malformed for a missing type.
  const other = "/home/michaelk/repos/intravehicular";

  it("finds a map in an undotted wayfinder/ directory", async () => {
    const descriptors = await run(
      Effect.gen(function* () {
        const adapter = yield* makeLocalAdapter(other);

        return yield* adapter.listMaps();
      }),
    );

    expect(descriptors.length).toBeGreaterThan(0);
    expect(String(descriptors[0]?.id)).toBe("local:wayfinder/map.md");
  });

  it("reads a singular `label:` key as the ticket type", async () => {
    const snapshot = await run(
      Effect.gen(function* () {
        const adapter = yield* makeLocalAdapter(other);

        return yield* adapter.loadMap(makeId("local:wayfinder/map.md"));
      }),
    );

    expect(snapshot.tickets.length).toBeGreaterThan(20);
    // The point of the fix: no ticket is malformed merely for spelling it
    // `label:`, and real types come through rather than all defaulting.
    expect(snapshot.tickets.every((t) => t.malformed === undefined)).toBe(true);
    expect(new Set(snapshot.tickets.map((t) => t.type)).size).toBeGreaterThan(1);
  });

  it("finds tickets/ beside the map, whatever the directory is called", async () => {
    const snapshot = await run(
      Effect.gen(function* () {
        const adapter = yield* makeLocalAdapter(other);

        return yield* adapter.loadMap(makeId("local:wayfinder/map.md"));
      }),
    );

    expect(snapshot.tickets.some((t) => t.blockedBy.length > 0)).toBe(true);
  });
});

const snapshotWith = (
  tickets: {
    shortId: string;
    status: "open" | "closed";
    assignee: string | null;
    blockedBy: string[];
  }[],
) =>
  ({
    tickets: tickets.map((t) => ({
      ...t,
      id: makeId(`local:${t.shortId}`),
      malformed: undefined,
    })),
  }) as unknown as MapSnapshot;
