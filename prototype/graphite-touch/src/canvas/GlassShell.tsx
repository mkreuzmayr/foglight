// THROWAWAY PROTOTYPE — the settled Nightfall shell: full-bleed canvas, a
// floating glass rail, and the legend chip. This half won the last round and
// is fixed; each riff supplies only a theme class and the rail's interior.
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import type { MapSnapshot } from "@/lib/domain";
import { progress } from "@/lib/domain";
import { stateStyle } from "@/lib/tokens";
import { FogVeil, edgeTypes, nodeTypes } from "@/canvas/nodes";
import { useCockpit } from "@/canvas/useCockpit";
import { cn } from "@/lib/utils";

export const RAIL_W = 336;
export const RAIL_INSET = 16;

export type RailContext = {
  snap: MapSnapshot;
  sel: string | null;
  pick: (id: string) => void;
};

const Inner = ({
  snap,
  themeClass,
  renderRail,
}: {
  snap: MapSnapshot;
  themeClass: string;
  renderRail: (ctx: RailContext) => React.ReactNode;
}) => {
  const { seed, sel, setSel, pick } = useCockpit(snap);
  const p = progress(snap);

  return (
    <div className={cn(themeClass, "relative h-full overflow-hidden")}>
      <div className={cn("absolute inset-0", sel && "edges-dimmed")}>
        <ReactFlow
          defaultNodes={seed.nodes}
          defaultEdges={seed.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{
            // The graph fits into the space the glass rail leaves free.
            padding: {
              left: `${RAIL_W + RAIL_INSET * 2 + 24}px`,
              top: "48px",
              right: "48px",
              bottom: "48px",
            },
          }}
          minZoom={0.25}
          maxZoom={1.5}
          nodesDraggable={false}
          onNodeClick={(_, n) => (n.type === "ticket" ? pick(n.id) : setSel(null))}
          onPaneClick={() => setSel(null)}
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="var(--dot)" />
          <FogVeil />
        </ReactFlow>
      </div>

      <aside
        className="material-rail absolute z-10 flex flex-col overflow-hidden rounded-[22px]"
        style={{ width: RAIL_W, left: RAIL_INSET, top: RAIL_INSET, bottom: RAIL_INSET }}
        aria-label="Map index"
      >
        {renderRail({ snap, sel, pick })}
      </aside>

      <div className="material-chip pointer-events-none absolute bottom-5 right-5 z-10 flex items-center gap-3 rounded-full border border-white/10 px-3.5 py-2">
        {(["frontier", "claimed", "closed", "blocked", "invalid"] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-[10px] text-ink-dim">
            <span className={cn("size-1.5 rounded-full", stateStyle[k].dot)} />
            {stateStyle[k].label}
          </span>
        ))}
        <span className="h-3 w-px bg-hair-bright" />
        <span className="t-mono text-[10px] text-ink-faint">{p.total} tickets</span>
      </div>
    </div>
  );
};

export const GlassShell = (props: {
  snap: MapSnapshot;
  themeClass: string;
  renderRail: (ctx: RailContext) => React.ReactNode;
}) => (
  <ReactFlowProvider>
    <Inner {...props} />
  </ReactFlowProvider>
);
