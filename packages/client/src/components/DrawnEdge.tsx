// An edge that draws itself.
//
// Purpose: preventing a jarring change. When a ticket graduates out of the fog,
// its blocking edges used to blink into existence; now the line grows from the
// blocker toward the new ticket, so the route visibly *extends*. On removal it
// retracts along the same path — enter and exit are one gesture.
//
// How: `pathLength={1}` normalizes the path's length to exactly 1 whatever its
// geometry, so the draw is `stroke-dashoffset: 1 → 0` in plain CSS. No
// getTotalLength, no WAAPI, and — the part that matters — it stays correct while
// the path is still changing shape (React Flow mounts edges before their
// endpoint nodes have measured, and useLayoutMotion moves nodes mid-draw).
// The first version measured the path on mount and pinned the dash pattern to
// that number; the geometry changed under it and the line froze.
//
// Dashed (fog) edges can't be drawn this way — the dash pattern *is* the dash
// machinery — so they cross-fade instead.
import { getBezierPath, type EdgeProps } from "@xyflow/react";
import { cn } from "@/lib/utils.js";

export type DrawnEdgeData = {
  /** draw this edge in on mount */
  enter?: boolean;
  /** ms before the draw starts — staggered so the route unfurls outward */
  delay?: number;
  /** edge is a ghost: retract it, then it gets dropped from the graph */
  exiting?: boolean;
};

export const DrawnEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data,
}: EdgeProps) => {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const { enter, delay = 0, exiting } = (data ?? {}) as DrawnEdgeData;
  // A dashed edge keeps its dash pattern; drawing would overwrite it.
  const dashed = Boolean(style?.strokeDasharray);

  return (
    <path
      id={id}
      d={path}
      fill="none"
      pathLength={dashed ? undefined : 1}
      className={cn(
        "react-flow__edge-path",
        !dashed && enter && !exiting && "edge-draw-in",
        !dashed && exiting && "edge-draw-out",
        dashed && enter && !exiting && "edge-fade-in",
        dashed && exiting && "edge-fade-out",
      )}
      style={{ ...style, ["--draw-delay" as string]: `${delay}ms` }}
    />
  );
};
