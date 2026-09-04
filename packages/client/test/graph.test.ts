/**
 * The client's pure logic — the parts that *can* be tested without a browser.
 *
 * Everything visual is deliberately not here: jsdom cannot see SVG geometry,
 * WAAPI or layout, and React Flow renders no edges without measurement, so a
 * jsdom test would happily pass on a cockpit that draws nothing. That job
 * belongs to `test/cockpit.probe.ts`, which drives real Chromium.
 */
import { TicketNode } from "@foglight/core/domain";
import type { MapSnapshot, ResourceId } from "@foglight/core/domain";
import { describe, expect, it } from "vitest";
import { resolveInitialMap } from "@/lib/address.js";
import { buildGraph, structureHash, DESTINATION_ID } from "@/lib/graph.js";

const id = (value: string) => value as ResourceId;

const snapshot = (overrides: Partial<MapSnapshot> = {}): MapSnapshot =>
  ({
    id: id("local:.wayfinder/map.md"),
    title: "A map",
    destination: "Somewhere",
    tracker: "local",
    revision: 1,
    bodyHash: "abc",
    tickets: [
      {
        id: id("t/001"),
        shortId: "001",
        title: "One",
        type: "research",
        status: "closed",
        assignee: null,
        blockedBy: [],
        bodyHash: "h1",
      },
      {
        id: id("t/002"),
        shortId: "002",
        title: "Two",
        type: "grilling",
        status: "open",
        assignee: null,
        blockedBy: ["001"],
        bodyHash: "h2",
      },
    ],
    fog: [],
    outOfScope: [],
    warnings: [],
    readAt: "2026-08-10T00:00:00Z",
    ...overrides,
  }) as unknown as MapSnapshot;

describe("buildGraph", () => {
  it("gives every ticket a node and anchors the destination", () => {
    const graph = buildGraph(snapshot());
    expect(graph.nodes.map((n) => n.id)).toContain("t/001");
    expect(graph.nodes.filter((n) => n.type === "destination")).toHaveLength(1);
  });

  it("draws a blocking edge from blocker to blocked, resolved through shortIds", () => {
    const graph = buildGraph(snapshot());
    expect(graph.edges.some((e) => e.source === "t/001" && e.target === "t/002")).toBe(true);
  });

  it("drops a dangling blocker instead of drawing an edge to nothing", () => {
    const graph = buildGraph(
      snapshot({
        tickets: snapshot().tickets.map((t) =>
          t.shortId === "002" ? patchTicket(t, { blockedBy: ["999"] }) : t,
        ),
      } as Partial<MapSnapshot>),
    );

    expect(graph.edges.some((e) => e.target === "t/002")).toBe(false);
  });

  it("connects the route's end to the destination when there is no fog", () => {
    const graph = buildGraph(snapshot());
    expect(graph.edges.some((e) => e.target === DESTINATION_ID)).toBe(true);
  });

  it("gives every fog patch a node and an approach to the destination", () => {
    const withFog = snapshot({
      fog: [{ id: id("f/1"), slug: "x", term: "Something", hangsOn: ["002"], bodyHash: "h" }],
    } as Partial<MapSnapshot>);

    const graph = buildGraph(withFog);
    expect(graph.nodes.some((n) => n.type === "fog")).toBe(true);
    expect(graph.edges.some((e) => e.source === "t/002" && e.target === "f/1")).toBe(true);
    expect(graph.edges.some((e) => e.source === "f/1" && e.target === DESTINATION_ID)).toBe(true);
  });
});

it("reuses positions while refreshing data for a text-only snapshot", () => {
  const initial = snapshot();
  const graph = buildGraph(initial);
  const edited = snapshot({
    tickets: initial.tickets.map((ticket) => patchTicket(ticket, { title: "Edited title" })),
  });

  const updated = buildGraph(edited, graph.nodes);

  expect(updated.nodes.map((node) => node.position)).toEqual(
    graph.nodes.map((node) => node.position),
  );

  expect(updated.nodes.find((node) => node.id === "t/001")?.data.ticket).toMatchObject({
    title: "Edited title",
  });

  expect(graph.nodes.find((node) => node.id === "t/001")?.data.ticket).toEqual(initial.tickets[0]);
});

describe("structureHash", () => {
  it("ignores a change that only affects what a card says", () => {
    // A typo fix must not move a card: an identical hash skips dagre entirely.
    const before = structureHash(snapshot());
    const after = structureHash(
      snapshot({
        tickets: snapshot().tickets.map((t) => patchTicket(t, { title: `${t.title} (edited)` })),
      } as Partial<MapSnapshot>),
    );

    expect(after).toBe(before);
  });

  it("changes when a status changes, because that changes rank and section", () => {
    const before = structureHash(snapshot());
    const after = structureHash(
      snapshot({
        tickets: snapshot().tickets.map((t) =>
          t.shortId === "002" ? patchTicket(t, { status: "closed" }) : t,
        ),
      } as Partial<MapSnapshot>),
    );

    expect(after).not.toBe(before);
  });

  it("changes when a blocking edge appears", () => {
    const before = structureHash(snapshot());
    const after = structureHash(
      snapshot({
        tickets: snapshot().tickets.map((t) =>
          t.shortId === "001" ? patchTicket(t, { blockedBy: ["002"] }) : t,
        ),
      } as Partial<MapSnapshot>),
    );

    expect(after).not.toBe(before);
  });
});

describe("cold start", () => {
  const available = [{ id: id("a") }, { id: id("b") }];

  it("lets an explicit ?map beat the remembered map", () => {
    // A pasted link must land where it points, whatever this browser remembers.
    expect(resolveInitialMap(id("b"), id("a"), available)).toBe("b");
  });

  it("falls back to the remembered map", () => {
    expect(resolveInitialMap(null, id("a"), available)).toBe("a");
  });

  it("ignores a remembered map that no longer exists", () => {
    expect(resolveInitialMap(null, id("gone"), available)).toBeNull();
  });

  it("does not silently open a different project's sole remaining map", () => {
    // The remembered project's attacher left: wait for re-attach rather than
    // substituting a stranger, even when only one other map is reachable.
    expect(resolveInitialMap(null, id("gone"), [{ id: id("stranger") }])).toBeNull();
  });

  it("reopens the remembered map once its project is attached again", () => {
    expect(resolveInitialMap(null, id("gone"), [{ id: id("gone") }])).toBe("gone");
  });

  it("opens the only map without asking", () => {
    expect(resolveInitialMap(null, null, [{ id: id("only") }])).toBe("only");
  });

  it("opens nothing — and so the picker — when there are several", () => {
    expect(resolveInitialMap(null, null, available)).toBeNull();
  });

  it("opens nothing when there are none", () => {
    expect(resolveInitialMap(null, null, [])).toBeNull();
  });
});

const patchTicket = (ticket: TicketNode, patch: Partial<TicketNode>): TicketNode =>
  new TicketNode({
    id: ticket.id,
    shortId: ticket.shortId,
    title: ticket.title,
    type: ticket.type,
    status: ticket.status,
    assignee: ticket.assignee,
    blockedBy: ticket.blockedBy,
    bodyHash: ticket.bodyHash,
    malformed: ticket.malformed,
    graduatedFrom: ticket.graduatedFrom,
    ...patch,
  });
