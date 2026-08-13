// THROWAWAY PROTOTYPE — the cockpit's canvas state, shared by all variants:
// seed once, diff every later snapshot into React Flow's store, keep selection
// in the store identity-stably, and fit the viewport only when a person asks.
import { useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useReducedMotion } from "motion/react";
import type { MapSnapshot } from "@/lib/domain";
import { buildGraph, decorateFirstPaint } from "@/lib/graph";
import { useSnapshotDiff } from "@/lib/useSnapshotDiff";

export const useCockpit = (snap: MapSnapshot) => {
  const target = useMemo(() => buildGraph(snap), [snap]);
  // Seed once; every later snapshot is applied to React Flow's store as a
  // diff — never by handing it a rebuilt array, which remounts every edge
  // and replays every animation.
  const seed = useRef<ReturnType<typeof decorateFirstPaint>>(undefined);
  seed.current ??= decorateFirstPaint(target);
  const [sel, setSel] = useState<string | null>("005");
  const reduce = useReducedMotion() ?? false;
  const rf = useReactFlow();

  useSnapshotDiff(target, reduce);

  // Selection lives in the store too, identity-stable where unchanged so
  // untouched nodes and edges skip rendering entirely.
  useEffect(() => {
    rf.setNodes((ns) =>
      ns.map((n) => (n.selected === (n.id === sel) ? n : { ...n, selected: n.id === sel })),
    );
    rf.setEdges((es) =>
      es.map((e) => {
        const cls = sel && (e.source === sel || e.target === sel) ? "edge-lit" : undefined;
        return e.className === cls ? e : { ...e, className: cls };
      }),
    );
  }, [sel, rf]);

  const pick = (id: string) => {
    setSel(id);
    // The viewport never moves on its own — but it may move because a person
    // asked for this ticket.
    rf.fitView({ nodes: [{ id }], padding: 3.2, duration: 320, maxZoom: 1.15 });
  };

  return { seed: seed.current, sel, setSel, pick };
};
