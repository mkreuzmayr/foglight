// THROWAWAY PROTOTYPE — snapshot → React Flow graph, identical to the shipped
// cockpit. Shared across all three variants: the canvas is the fixed half of
// this prototype; only the chrome around it is under evaluation.
import type { Edge, Node } from "@xyflow/react";
import { progress, ticketById, type MapSnapshot } from "@/lib/domain";
import { layout } from "@/lib/layout";

export const NODE_W = 232;
export const DESTINATION_ID = "__destination";

export const buildGraph = (snap: MapSnapshot) => {
  const p = progress(snap);
  const nodes: Node[] = snap.tickets.map((t) => ({
    id: t.shortId,
    type: "ticket",
    position: { x: 0, y: 0 },
    // origin: continuity for the diff — a graduated ticket *moves out of* its
    // fog patch instead of fading in next to the patch's ghost
    data: { ticket: t, snap, origin: t.graduatedFrom },
    width: NODE_W,
    height: 62,
  }));

  const edges: Edge[] = [];
  for (const t of snap.tickets) {
    for (const b of t.blockedBy) {
      const resolved = ticketById(snap, b)?.status === "closed";
      edges.push({
        id: `${b}->${t.shortId}`,
        source: b,
        target: t.shortId,
        type: "drawn",
        style: {
          stroke: resolved ? "var(--color-decided)" : "var(--color-hair-bright)",
          strokeWidth: 1.3,
          opacity: resolved ? 0.55 : 1,
        },
      });
    }
  }

  snap.fog.forEach((f) => {
    nodes.push({
      id: f.id,
      type: "fog",
      position: { x: 0, y: 0 },
      data: { term: f.term },
      width: NODE_W - 24,
      height: 46,
    });
    for (const h of f.hangsOn) {
      edges.push({
        id: `${h}->${f.id}`,
        source: h,
        target: f.id,
        type: "drawn",
        style: { stroke: "var(--color-hair)", strokeDasharray: "3 5" },
      });
    }
    edges.push({
      id: `${f.id}->dest`,
      source: f.id,
      target: DESTINATION_ID,
      type: "drawn",
      style: { stroke: "var(--color-hair)", strokeDasharray: "2 6", opacity: 0.7 },
    });
  });

  nodes.push({
    id: DESTINATION_ID,
    type: "destination",
    position: { x: 0, y: 0 },
    data: { reached: p.closed, total: p.total },
    width: 104,
    height: 116,
  });

  return {
    nodes: layout(nodes, edges, { rankdir: "LR", ranksep: 104, nodesep: 20 }),
    edges,
  };
};

/** First paint: the whole route unfurls left to right, once. */
export const decorateFirstPaint = (g: { nodes: Node[]; edges: Edge[] }) => {
  const xs = g.nodes.map((n) => n.position.x);
  const minX = Math.min(...xs, 0);
  const spanX = Math.max(...xs, 1) - minX || 1;
  return {
    nodes: g.nodes.map((n, i) => ({ ...n, data: { ...n.data, enterDelay: i * 40 } })),
    edges: g.edges.map((e) => {
      const sourceX = g.nodes.find((n) => n.id === e.source)?.position.x ?? minX;
      const delay = Math.round(((sourceX - minX) / spanX) * 260 + 60);
      return { ...e, data: { ...e.data, enter: true, delay } };
    }),
  };
};
