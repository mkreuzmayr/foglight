/**
 * Snapshot → React Flow graph.
 *
 * The graph answers **"what is the shape of this effort"**: left to right,
 * decisions behind, the frontier at the working edge, fog beyond it, and the
 * destination anchored at the right as a node the route arrives at (SPEC.md
 * §8). What the graph structurally *cannot* show — out-of-scope entries, parse
 * warnings — is not omitted here by oversight; it belongs to the rail.
 *
 * Node ids are the snapshot's qualified ids, not array positions, so layout
 * cannot thrash when a tick reorders anything.
 */
import { stateOf } from "@foglight/core/domain";
import type { MapSnapshot } from "@foglight/core/domain";

import type { Edge, Node } from "@xyflow/react";
import { layout } from "./layout.js";

export const NODE_W = 232;
const NODE_H = 62;
const FOG_W = NODE_W - 24;
const FOG_H = 46;
export const DESTINATION_ID = "__destination";

export const buildGraph = (snapshot: MapSnapshot, previousNodes?: Node[]) => {
  const byShortId = new Map(snapshot.tickets.map((t) => [t.shortId, t]));
  const closed = snapshot.tickets.filter((t) => t.status === "closed").length;

  const nodes: Node[] = snapshot.tickets.map((ticket) => ({
    id: ticket.id,
    type: "ticket",
    position: { x: 0, y: 0 },
    // `origin` is the continuity link the diff reads: a ticket that graduated
    // out of a fog patch *moves out of* the patch rather than fading in beside
    // its ghost (CONTEXT.md, "Graduation").
    data: { ticket, snapshot, origin: ticket.graduatedFrom },
    width: NODE_W,
    height: NODE_H,
  }));

  const edges: Edge[] = [];
  for (const ticket of snapshot.tickets) {
    for (const blocker of ticket.blockedBy) {
      const source = byShortId.get(blocker);
      if (source === undefined) {
        continue;
      } // dangling: already a warning on the rail

      edges.push({
        id: `${source.id}->${ticket.id}`,
        source: source.id,
        target: ticket.id,
        type: "drawn",
        style: {
          stroke: source.status === "closed" ? "var(--color-decided)" : "var(--color-hair-bright)",
          strokeWidth: 1.3,
          opacity: source.status === "closed" ? 0.55 : 1,
        },
      });
    }
  }

  for (const patch of snapshot.fog) {
    nodes.push({
      id: patch.id,
      type: "fog",
      position: { x: 0, y: 0 },
      data: { term: patch.term },
      width: FOG_W,
      height: FOG_H,
    });

    for (const shortId of patch.hangsOn) {
      const source = byShortId.get(shortId);
      if (source === undefined) {
        continue;
      }

      edges.push({
        id: `${source.id}->${patch.id}`,
        source: source.id,
        target: patch.id,
        type: "drawn",
        style: { stroke: "var(--color-hair)", strokeDasharray: "3 5" },
      });
    }

    // Fog gathers only ever *toward* the destination — so every patch has an
    // edge to it, even one that hangs on nothing and floats at the band.
    edges.push({
      id: `${patch.id}->${DESTINATION_ID}`,
      source: patch.id,
      target: DESTINATION_ID,
      type: "drawn",
      style: { stroke: "var(--color-hair)", strokeDasharray: "2 6", opacity: 0.7 },
    });
  }

  appendTerminalEdges(snapshot, edges);

  nodes.push({
    id: DESTINATION_ID,
    type: "destination",
    position: { x: 0, y: 0 },
    data: { reached: closed, total: snapshot.tickets.length },
    width: 104,
    height: 116,
  });

  return {
    nodes:
      previousNodes === undefined
        ? layout(nodes, edges, { rankdir: "LR", ranksep: 104, nodesep: 20 })
        : nodes.map((node) => ({
            ...node,
            position:
              previousNodes.find((previous) => previous.id === node.id)?.position ?? node.position,
          })),
    edges,
  };
};

/**
 * A structural hash: node ids plus edge pairs. **Dagre re-runs only when this
 * changes** (SPEC.md §8) — an identical hash patches node `data` in place and
 * skips layout entirely, so fixing a typo in a ticket's title cannot move a
 * card. Status is in the hash because it changes rank and section.
 */
export const structureHash = (snapshot: MapSnapshot): string =>
  [
    ...snapshot.tickets.map(
      (t) => `${t.id}:${t.status}:${stateOf(t, snapshot)}:${t.blockedBy.join(",")}`,
    ),
    ...snapshot.fog.map((f) => `${f.id}:${f.hangsOn.join(",")}`),
  ].join("|");

/** First paint: the whole route unfurls left to right, once. */
export const decorateFirstPaint = (graph: { nodes: Node[]; edges: Edge[] }) => {
  const xs = graph.nodes.map((n) => n.position.x);
  const minX = Math.min(...xs, 0);
  const spanX = Math.max(...xs, 1) - minX || 1;

  return {
    nodes: graph.nodes.map((node, i) => ({
      ...node,
      data: { ...node.data, enterDelay: i * 40 },
    })),
    edges: graph.edges.map((edge) => {
      const sourceX = graph.nodes.find((n) => n.id === edge.source)?.position.x ?? minX;
      const delay = Math.round(((sourceX - minX) / spanX) * 260 + 60);

      return { ...edge, data: { ...edge.data, enter: true, delay } };
    }),
  };
};

const appendTerminalEdges = (snapshot: MapSnapshot, edges: Edge[]) => {
  // With no fog left, the route's own end arrives at the destination — the map
  // would otherwise show its endpoint floating unconnected. These read a shade
  // brighter than the fog approach edges: with no fog to carry the weight,
  // `--color-hair` on the ground is invisible, and an edge nobody can see is
  // the same as an edge that isn't there.
  if (snapshot.fog.length === 0) {
    for (const ticket of snapshot.tickets) {
      const isTerminal = !snapshot.tickets.some((other) =>
        other.blockedBy.includes(ticket.shortId),
      );

      if (!isTerminal) {
        continue;
      }

      edges.push({
        id: `${ticket.id}->${DESTINATION_ID}`,
        source: ticket.id,
        target: DESTINATION_ID,
        type: "drawn",
        style: { stroke: "var(--color-destination)", strokeDasharray: "2 6", opacity: 0.32 },
      });
    }
  }
};
