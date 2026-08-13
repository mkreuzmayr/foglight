// THROWAWAY PROTOTYPE — layered DAG layout via dagre (the "simplest option"
// per the React Flow layouting guide). Swap ENGINE to compare thrash on update.

import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

export type Sized = { id: string; width: number; height: number };

export const layout = (
  nodes: Node[],
  edges: Edge[],
  opts: { rankdir?: "TB" | "LR"; ranksep?: number; nodesep?: number } = {},
): Node[] => {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: opts.rankdir ?? "TB",
    ranksep: opts.ranksep ?? 80,
    nodesep: opts.nodesep ?? 36,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    g.setNode(n.id, {
      width: (n.measured?.width ?? (n.width as number) ?? 260) as number,
      height: (n.measured?.height ?? (n.height as number) ?? 96) as number,
    });
  }
  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const p = g.node(n.id);
    if (!p) return n;
    return { ...n, position: { x: p.x - p.width / 2, y: p.y - p.height / 2 } };
  });
};
