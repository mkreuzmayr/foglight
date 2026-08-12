// Applies a new map snapshot to React Flow's own store as a diff, never as a
// rebuild. A change signal must never redraw the map (SPEC.md §8).
//
// Why this exists (found with a real-browser probe; probe*.ts on branch prototype/map-graph-ui): in controlled
// mode, handing React Flow a fresh nodes array makes it rebuild node internals;
// while nodes re-measure, EdgeWrapper's position lookup returns null and it
// unmounts every custom edge path for a frame. Remount = every draw animation
// replays = the whole flowchart appears to redraw. Uncontrolled mode keeps
// `measured` on the store's node objects, so updating via setNodes/setEdges
// (spreading the store object) never knocks an edge out of the DOM.
//
// The contract: unchanged items keep their object identity (React Flow's memo
// skips them entirely); changed items are updated in place; new items enter
// with their lifecycle marking; departed items are flipped to `exiting` ghosts
// and purged after the exit window.
import { useEffect, useRef } from "react";
import { animate } from "motion/react";
import { useReactFlow, type Edge, type Node } from "@xyflow/react";

/** Must outlast the exit animations (edge retract 200ms + node fade tail). */
const EXIT_WINDOW = 340;
/** A node that has just arrived waits for its edge to draw toward it. */
const NEW_NODE_DELAY = 190;
const MOVE_S = 0.32;
/** --ease-in-out: on-screen movement, not an entrance */
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

const shallowEqual = (a: object = {}, b: object = {}) => {
  const ka = Object.keys(a) as (keyof typeof a)[];
  const kb = Object.keys(b) as (keyof typeof b)[];
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};

export const useSnapshotDiff = (target: { nodes: Node[]; edges: Edge[] }, reduce: boolean) => {
  const rf = useReactFlow();
  const first = useRef(true);
  const purge = useRef<ReturnType<typeof setTimeout>>(undefined);
  const motion = useRef<{ stop: () => void }>(undefined);

  useEffect(() => {
    // First target is the seed — it went in through defaultNodes/defaultEdges.
    if (first.current) {
      first.current = false;
      return;
    }

    motion.current?.stop();
    clearTimeout(purge.current);

    const tNodes = new Map(target.nodes.map((n) => [n.id, n]));
    const tEdges = new Map(target.edges.map((e) => [e.id, e]));
    const liveNodes = rf.getNodes();
    const liveById = new Map(liveNodes.map((n) => [n.id, n]));
    const liveNodeIds = new Set(liveById.keys());
    const liveEdgeIds = new Set(rf.getEdges().map((e) => e.id));

    // Continuity: when an arriving node and a departing node are the same thing
    // (a ticket graduated out of a fog patch — `data.origin` names the link,
    // checked both ways so undoing the change plays the move backwards), the
    // arrival *moves out of* the departure's place instead of fading in beside
    // its ghost. morphFrom: arriving id → position to start the glide at.
    const originOf = (n: Node | undefined) => (n?.data as { origin?: string })?.origin;
    const morphFrom = new Map<string, { x: number; y: number }>();
    /** departed id → the arrival that replaced it in place */
    const morphedInto = new Map<string, string>();
    for (const n of target.nodes) {
      if (liveNodeIds.has(n.id)) continue;
      const partner =
        // fog patch → graduated ticket
        (originOf(n) && !tNodes.has(originOf(n)!) && liveById.get(originOf(n)!)) ||
        // graduated ticket → fog patch (the reverse, on undo)
        liveNodes.find((l) => originOf(l) === n.id && !tNodes.has(l.id));
      if (partner) {
        morphFrom.set(n.id, { ...partner.position });
        morphedInto.set(partner.id, n.id);
      }
    }

    // 1. Update / mark exiting / append — all on the store's own objects.
    rf.setNodes((ns) => [
      ...ns
        .filter((n) => !(n.data.exiting && !tNodes.has(n.id))) // drop stale ghosts early on rapid changes
        .filter((n) => !morphedInto.has(n.id)) // replaced in place by its arrival — no ghost
        .map((n) => {
          const t = tNodes.get(n.id);
          if (!t) return { ...n, data: { ...n.data, exiting: true }, selected: false };
          // keep position (animated below) and measured; refresh content
          return { ...n, data: { ...t.data, enterDelay: n.data.enterDelay ?? 0 } };
        }),
      ...target.nodes
        .filter((n) => !liveNodeIds.has(n.id))
        .map((n) =>
          morphFrom.has(n.id)
            ? // starts where its predecessor stood, fully visible, and glides
              { ...n, position: morphFrom.get(n.id)!, data: { ...n.data, morph: true } }
            : { ...n, data: { ...n.data, enterDelay: reduce ? 0 : NEW_NODE_DELAY } },
        ),
    ]);

    rf.setEdges((es) => [
      ...es
        .filter((e) => !(e.data?.exiting && !tEdges.has(e.id)))
        .map((e) => {
          const t = tEdges.get(e.id);
          if (!t)
            return {
              ...e,
              // an endpoint that morphed away would take this ghost with it —
              // re-anchor to the arrival so the edge fades from the moving card
              source: morphedInto.get(e.source) ?? e.source,
              target: morphedInto.get(e.target) ?? e.target,
              data: { ...e.data, exiting: true },
            };
          // identity-stable when nothing visible changed → React Flow skips it
          return shallowEqual(e.style, t.style) ? e : { ...e, style: t.style };
        }),
      ...target.edges
        .filter((e) => !liveEdgeIds.has(e.id))
        .map((e) => ({ ...e, data: { ...e.data, enter: true, delay: 0 } })),
    ]);

    // 2. Ghosts leave the store once their exit has played.
    purge.current = setTimeout(() => {
      rf.setNodes((ns) => ns.filter((n) => !n.data.exiting));
      rf.setEdges((es) => es.filter((e) => !e.data?.exiting));
    }, EXIT_WINDOW);

    // 3. Positions glide to the new layout. Interpolated through the store so
    // edge paths track the cards; spreading store objects keeps `measured`.
    // Start points come from what we already hold — liveNodes (captured before
    // the write) plus the morph starts — NOT from re-reading the store: the
    // setNodes write above isn't visible to getNodes() yet, so a re-read misses
    // every arrival and the hold-still guard would pin morphed nodes at their
    // origin forever.
    const from = new Map(liveNodes.map((n) => [n.id, { ...n.position }]));
    for (const [id, p] of morphFrom) from.set(id, { ...p });
    const moved = target.nodes.some((t) => {
      const f = from.get(t.id);
      return f && (Math.abs(f.x - t.position.x) > 0.5 || Math.abs(f.y - t.position.y) > 0.5);
    });

    if (!moved || reduce) {
      rf.setNodes((ns) =>
        ns.map((n) => {
          const t = tNodes.get(n.id);
          return t ? { ...n, position: { ...t.position } } : n;
        }),
      );
      return;
    }

    motion.current = animate(0, 1, {
      duration: MOVE_S,
      ease: [...EASE_IN_OUT],
      onUpdate: (t) => {
        rf.setNodes((ns) =>
          ns.map((n) => {
            const tgt = tNodes.get(n.id);
            const f = from.get(n.id);
            if (!tgt || !f) return n; // ghosts and fresh arrivals hold still
            return {
              ...n,
              position: {
                x: f.x + (tgt.position.x - f.x) * t,
                y: f.y + (tgt.position.y - f.y) * t,
              },
            };
          }),
        );
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  useEffect(
    () => () => {
      motion.current?.stop();
      clearTimeout(purge.current);
    },
    [],
  );
};
