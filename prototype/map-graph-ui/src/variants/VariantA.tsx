// THROWAWAY PROTOTYPE — Variant A: "Full-bleed canvas".
// Stance: the map *is* the graph. No list anywhere. All chrome floats over the
// canvas and gets out of the way; the fog is a real veil at the graph's edge;
// a ticket opens as an overlay sheet. Out-of-scope lives in a tucked-away popover
// because it is not on the route.
import { useCallback, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  decisionsSoFar,
  frontier,
  progress,
  stateOf,
  ticketById,
  type MapSnapshot,
  type Ticket,
} from "@/lib/domain";
import { stateStyle, typeGlyph, typeLabel } from "@/lib/tokens";
import { layout } from "@/lib/layout";
import { cn } from "@/lib/utils";

/* ---------------------------------- nodes --------------------------------- */

type TicketData = { ticket: Ticket; snap: MapSnapshot };

const TicketNode = ({ data, selected }: NodeProps & { data: TicketData }) => {
  const { ticket, snap } = data;
  const state = ticket.malformed ? "invalid" : stateOf(ticket, snap);
  const s = stateStyle[state];
  return (
    <div
      className={cn(
        "w-[268px] rounded-xl border bg-panel/95 px-3.5 py-3 backdrop-blur transition",
        s.border,
        state === "frontier" &&
          "shadow-[0_0_0_1px_var(--color-accent),0_0_28px_-6px_var(--color-accent)]",
        state === "closed" && "opacity-80",
        state === "blocked" && "opacity-55",
        selected && "ring-2 ring-ink/60",
      )}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em]">
        <span className={cn("size-1.5 rounded-full", s.dot)} />
        <span className={cn("font-semibold", s.text)}>{s.label}</span>
        <span className="ml-auto font-mono text-ink-faint">
          {typeGlyph[ticket.type]} {typeLabel[ticket.type]}
        </span>
      </div>
      <div className="mt-2 flex gap-2">
        <span className="font-mono text-xs text-ink-faint">{ticket.shortId}</span>
        <span className="text-[13px] leading-snug font-medium text-ink">{ticket.title}</span>
      </div>
      {ticket.gist ? (
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-ink-dim">{ticket.gist}</p>
      ) : null}
      {ticket.assignee && ticket.status === "open" ? (
        <p className="mt-1.5 text-[11px] text-claimed">claimed · {ticket.assignee}</p>
      ) : null}
      {ticket.malformed ? (
        <p className="mt-1.5 text-[11px] leading-snug text-invalid">{ticket.malformed}</p>
      ) : null}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

const FogNode = ({ data }: NodeProps & { data: { entry: { term: string; detail: string } } }) => (
  <div className="w-[240px] rounded-xl border border-dashed border-hair-bright/70 bg-white/[0.03] px-3.5 py-3 text-ink-dim">
    <Handle type="target" position={Position.Top} />
    <div className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">not yet specified</div>
    <div className="mt-1.5 text-[13px] font-medium text-ink-dim">{data.entry.term}</div>
    <Handle type="source" position={Position.Bottom} />
  </div>
);

const DestinationNode = ({ data }: NodeProps & { data: { snap: MapSnapshot } }) => {
  const p = progress(data.snap);
  return (
    <div className="w-[420px] rounded-2xl border border-destination/40 bg-destination/[0.06] px-5 py-4">
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-destination">
        ★ destination
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-ink">{data.snap.destination}</p>
      <div className="mt-3 flex items-center gap-3 text-[11px] text-ink-faint">
        <span className="font-mono">
          {p.closed}/{p.total} decided
        </span>
        <span>·</span>
        <span>{p.fog} patches of fog remain</span>
      </div>
    </div>
  );
};

const nodeTypes = {
  ticket: TicketNode as never,
  fog: FogNode as never,
  destination: DestinationNode as never,
};

/* --------------------------------- graph ---------------------------------- */

const buildGraph = (snap: MapSnapshot) => {
  const nodes: Node[] = snap.tickets.map((t) => ({
    id: t.shortId,
    type: "ticket",
    position: { x: 0, y: 0 },
    data: { ticket: t, snap },
    width: 268,
    height: t.gist || t.malformed ? 126 : 96,
  }));

  const edges: Edge[] = [];
  for (const t of snap.tickets) {
    for (const b of t.blockedBy) {
      edges.push({
        id: `${b}->${t.shortId}`,
        source: b,
        target: t.shortId,
        style: {
          stroke:
            ticketById(snap, b)?.status === "closed"
              ? "var(--color-decided)"
              : "var(--color-hair-bright)",
          strokeWidth: 1.4,
        },
        animated: ticketById(snap, b)?.status !== "closed",
      });
    }
  }

  for (const f of snap.fog) {
    nodes.push({
      id: f.id,
      type: "fog",
      position: { x: 0, y: 0 },
      data: { entry: f },
      width: 240,
      height: 84,
    });
    for (const h of f.hangsOn) {
      edges.push({
        id: `${h}->${f.id}`,
        source: h,
        target: f.id,
        style: { stroke: "var(--color-hair)", strokeDasharray: "3 5" },
      });
    }
  }

  nodes.push({
    id: "__destination",
    type: "destination",
    position: { x: 0, y: 0 },
    data: { snap },
    width: 420,
    height: 150,
  });
  for (const f of snap.fog) {
    edges.push({
      id: `${f.id}->dest`,
      source: f.id,
      target: "__destination",
      style: { stroke: "var(--color-hair)", strokeDasharray: "2 6" },
    });
  }

  return { nodes: layout(nodes, edges, { rankdir: "TB", ranksep: 78 }), edges };
};

/* ------------------------------- fog veil --------------------------------- */

const FogVeil = ({ nodes }: { nodes: Node[] }) => {
  const fogNodes = nodes.filter((n) => n.type === "fog");
  if (!fogNodes.length) return null;
  const xs = fogNodes.map((n) => n.position.x);
  const ys = fogNodes.map((n) => n.position.y);
  const x = Math.min(...xs) - 200;
  const y = Math.min(...ys) - 90;
  const w = Math.max(...xs.map((v, i) => v + (fogNodes[i].width ?? 240))) - x + 200;
  const h = Math.max(...ys.map((v, i) => v + (fogNodes[i].height ?? 84))) - y + 420;
  return (
    <ViewportPortal>
      <div
        className="pointer-events-none"
        style={{ position: "absolute", left: x, top: y, width: w, height: h }}
      >
        <div className="fog-veil absolute inset-0 rounded-[999px] bg-[radial-gradient(ellipse_at_50%_35%,rgba(196,163,255,0.16),rgba(10,10,12,0)_70%)] blur-2xl" />
        <div className="fog-veil-2 absolute inset-x-12 inset-y-8 rounded-[999px] bg-[radial-gradient(ellipse_at_35%_60%,rgba(232,121,166,0.12),rgba(10,10,12,0)_65%)] blur-3xl" />
        <div className="absolute left-1/2 top-2 -translate-x-1/2 text-[10px] uppercase tracking-[0.35em] text-ink-faint">
          fog of war
        </div>
      </div>
    </ViewportPortal>
  );
};

/* --------------------------------- shell ---------------------------------- */

const Canvas = ({ snap }: { snap: MapSnapshot }) => {
  const { nodes, edges } = useMemo(() => buildGraph(snap), [snap]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showOos, setShowOos] = useState(false);
  const { fitView } = useReactFlow();
  const inited = useNodesInitialized();
  const onInit = useCallback(() => fitView({ padding: 0.12 }), [fitView]);
  const open = openId ? ticketById(snap, openId) : undefined;
  const p = progress(snap);
  const front = frontier(snap);

  useMemo(() => {
    if (inited) setTimeout(() => fitView({ padding: 0.12, duration: 400 }), 0);
  }, [inited, fitView]);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={onInit}
        minZoom={0.2}
        maxZoom={1.6}
        nodesDraggable={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => setOpenId(n.type === "ticket" ? n.id : null)}
        onPaneClick={() => setOpenId(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="#221f29" />
        <FogVeil nodes={nodes} />
      </ReactFlow>

      {/* floating chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4">
        <div className="pointer-events-auto max-w-md rounded-xl border border-hair bg-panel/80 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-ink-faint">
            <span className="text-accent">◐</span> foglight
            <span className="font-mono normal-case tracking-normal text-ink-faint">
              {snap.tracker}:{snap.title}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-dim">
            {snap.destination}
          </p>
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex items-center gap-3 rounded-xl border border-hair bg-panel/80 px-3.5 py-2 text-[11px] backdrop-blur-md">
            <span className="font-mono tabular-nums text-decided">
              {p.closed}/{p.total}
            </span>
            <span className="text-ink-faint">decided</span>
            <span className="h-3 w-px bg-hair" />
            <span className="font-mono tabular-nums text-accent">{front.length}</span>
            <span className="text-ink-faint">takeable</span>
            <span className="h-3 w-px bg-hair" />
            <span className="font-mono tabular-nums text-ink-dim">{p.fog}</span>
            <span className="text-ink-faint">fog</span>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {(["frontier", "claimed", "closed", "blocked", "invalid"] as const).map((k) => (
              <span
                key={k}
                className="flex items-center gap-1.5 rounded-full border border-hair bg-panel/80 px-2 py-1 text-[10px] text-ink-dim backdrop-blur-md"
              >
                <span className={cn("size-1.5 rounded-full", stateStyle[k].dot)} />
                {stateStyle[k].label}
              </span>
            ))}
          </div>
          <button
            onClick={() => setShowOos((v) => !v)}
            className="rounded-full border border-hair bg-panel/80 px-2.5 py-1 text-[10px] text-ink-faint backdrop-blur-md hover:text-ink-dim"
          >
            out of scope ({snap.outOfScope.length})
          </button>
          {showOos ? (
            <div className="w-72 rounded-xl border border-hair bg-panel px-3.5 py-3">
              <ul className="space-y-2">
                {snap.outOfScope.map((o) => (
                  <li key={o.id} className="text-[11px] leading-snug">
                    <span className="text-ink-dim line-through decoration-ink-faint/60">
                      {o.term}
                    </span>
                    <span className="block text-ink-faint">{o.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {snap.warnings.length ? (
        <div className="absolute bottom-4 left-4 max-w-sm rounded-lg border border-invalid/40 bg-invalid/[0.07] px-3 py-2 text-[11px] leading-snug text-invalid/90">
          <span className="font-semibold">{snap.warnings.length} warning</span> {snap.warnings[0]}
        </div>
      ) : null}

      {/* ticket sheet */}
      {open ? (
        <aside className="absolute inset-y-0 right-0 w-[420px] overflow-y-auto border-l border-hair bg-panel px-5 py-5">
          <div className="flex items-start justify-between">
            <span className="font-mono text-xs text-ink-faint">{open.id}</span>
            <button onClick={() => setOpenId(null)} className="text-ink-faint hover:text-ink">
              ✕
            </button>
          </div>
          <h2 className="mt-3 text-lg leading-tight font-semibold">{open.title}</h2>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-wider">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5",
                stateStyle[open.malformed ? "invalid" : stateOf(open, snap)].border,
                stateStyle[open.malformed ? "invalid" : stateOf(open, snap)].text,
              )}
            >
              {stateStyle[open.malformed ? "invalid" : stateOf(open, snap)].label}
            </span>
            <span className="rounded-full border border-hair px-2 py-0.5 text-ink-dim">
              {typeGlyph[open.type]} {typeLabel[open.type]}
            </span>
            {open.assignee ? (
              <span className="rounded-full border border-hair px-2 py-0.5 text-ink-dim">
                {open.assignee}
              </span>
            ) : null}
          </div>
          <h3 className="mt-5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">question</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">{open.question}</p>
          {open.blockedBy.length ? (
            <>
              <h3 className="mt-5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                blocked by
              </h3>
              <ul className="mt-1.5 space-y-1">
                {open.blockedBy.map((b) => {
                  const bt = ticketById(snap, b);
                  return (
                    <li key={b} className="text-[13px]">
                      <button
                        onClick={() => setOpenId(b)}
                        className="text-ink-dim underline decoration-hair-bright hover:text-ink"
                      >
                        {bt?.title ?? b}
                      </button>{" "}
                      <span
                        className={cn(
                          "text-[11px]",
                          bt?.status === "closed" ? "text-decided" : "text-ink-faint",
                        )}
                      >
                        ({bt?.status})
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
          {open.resolution ? (
            <>
              <h3 className="mt-5 text-[10px] uppercase tracking-[0.2em] text-decided">
                resolution
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">{open.resolution}</p>
            </>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
};

export const VariantA = ({ snap }: { snap: MapSnapshot }) => (
  <ReactFlowProvider>
    <Canvas snap={snap} />
  </ReactFlowProvider>
);
