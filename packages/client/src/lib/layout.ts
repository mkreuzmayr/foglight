// Layered DAG layout via dagre (SPEC.md §8).
//
// dagre, not elkjs: measured on the change signal, existing nodes travel
// 2–47px, which the animated relayout absorbs — so elkjs's position-preserving
// mode is not worth its ~460 kB. This is the seam to revisit if maps get much
// larger than the tens of nodes a wayfinder map runs to.

import { graphlib, layout as runLayout } from "@dagrejs/dagre";
import { Schema } from "effect";
import type { Edge, Node } from "@xyflow/react";

export type Sized = { id: string; width: number; height: number };

export const layout = (
  nodes: Node[],
  edges: Edge[],
  opts: { rankdir?: "TB" | "LR"; ranksep?: number; nodesep?: number } = {},
): Node[] => {
  const g = new graphlib.Graph();
  g.setGraph({
    rankdir: opts.rankdir ?? "TB",
    ranksep: opts.ranksep ?? 80,
    nodesep: opts.nodesep ?? 36,
    marginx: 40,
    marginy: 40,
  });

  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    g.setNode(n.id, dimensions(n));
  }

  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  runLayout(g);

  return nodes.map((n) => {
    const p = Schema.decodeUnknownSync(Position)(g.node(n.id));
    if (!p) {
      return n;
    }

    return { ...n, position: { x: p.x - p.width / 2, y: p.y - p.height / 2 } };
  });
};

const Position = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
});

const dimensions = (node: Node) => ({
  width: node.measured?.width ?? node.width ?? 260,
  height: node.measured?.height ?? node.height ?? 96,
});
