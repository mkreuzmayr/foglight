// THROWAWAY PROTOTYPE — Variant D: "Cockpit, refined".
// B's stance, rebuilt: rail answers "what do I do next", canvas answers "what's
// the shape", selection is shared, flow reads left to right. What changed is
// craft, not structure — see README for the decision list.
//
// Motion here is bridging, not expression (see the opportunities report):
//   1. relayout on a change signal  → positions interpolated so edges stay glued
//   2. rail detail open/close       → accordion, enter 240ms / exit 160ms
//   3. selection                    → one indicator that slides between rows
//   4. nodes arriving               → 260ms ease-out, 40ms stagger, from 0.97
//   5. caret                        → 90° rotate, 180ms
//   6. unrelated edges              → recede to 0.25 so lineage reads first
//   7. edges arriving/leaving       → the line draws itself, and retracts along
//                                     the same path when its ticket goes away
// Everything else is deliberately still.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useNodes,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CaretRight, Lighthouse, Target, Warning, Waves, type Icon } from "@phosphor-icons/react";
import {
  decisionsSoFar,
  frontier,
  progress,
  stateOf,
  ticketById,
  type MapSnapshot,
  type Ticket,
  type TicketState,
} from "@/lib/domain";
import { stateIcon, stateStyle, typeIcon, typeLabel } from "@/lib/tokens";
import { layout } from "@/lib/layout";
import { useSnapshotDiff } from "@/lib/useSnapshotDiff";
import { DrawnEdge } from "@/components/DrawnEdge";
import { cn } from "@/lib/utils";

const RAIL_W = 348;
const NODE_W = 232;

const visualState = (t: Ticket, snap: MapSnapshot): TicketState | "invalid" =>
  t.malformed ? "invalid" : stateOf(t, snap);

/* =============================================================== graph nodes */

/** Set by useSnapshotDiff on whatever has just arrived, left, or morphed. */
type Lifecycle = { enterDelay?: number; exiting?: boolean; morph?: boolean };

const lifecycle = (data: Lifecycle) => ({
  className: data.exiting ? "node-exiting" : data.morph ? "node-morph" : undefined,
  style: { ["--enter-delay" as string]: `${data.enterDelay ?? 0}ms` },
});

type TicketNodeData = Lifecycle & { ticket: Ticket; snap: MapSnapshot };

const TicketNode = ({ data, selected }: NodeProps & { data: TicketNodeData }) => {
  const { ticket, snap } = data;
  const s = stateStyle[visualState(ticket, snap)];
  const TypeIcon: Icon = typeIcon[ticket.type];
  const life = lifecycle(data);

  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div
        className={cn(
          "node-card relative flex items-start gap-2.5 overflow-hidden bg-panel/90 py-2.5 pl-3.5 pr-3",
          "rounded-[var(--r-surface)] border",
          s.border,
          visualState(ticket, snap) === "blocked" && "opacity-65",
          selected && "bg-panel-2 ring-1 ring-ink/45",
          life.className,
        )}
        style={{ width: NODE_W, ...life.style }}
      >
        {/* state as a spine, not as a badge: readable at any zoom */}
        <span className={cn("absolute inset-y-0 left-0 w-[2px]", s.dot)} />
        <TypeIcon size={15} className="mt-[3px] shrink-0 text-ink-faint" weight="regular" />
        <span className="min-w-0 flex-1">
          <span className="t-title block truncate text-[12.5px] font-medium text-ink">
            {ticket.title}
          </span>
          <span className="mt-1 flex items-center gap-1.5">
            <span className="t-mono text-[10px] text-ink-faint">{ticket.shortId}</span>
            <span className="size-[3px] rounded-full bg-hair-bright" />
            <span className={cn("text-[10px]", s.text)}>{s.label}</span>
            {ticket.assignee && ticket.status === "open" ? (
              <span className="truncate text-[10px] text-ink-faint">{ticket.assignee}</span>
            ) : null}
          </span>
        </span>
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  );
};

const FogNode = ({ data }: NodeProps & { data: Lifecycle & { term: string } }) => (
  <>
    <Handle type="target" position={Position.Left} />
    <div
      className={cn(
        "node-card flex items-center gap-2 rounded-[var(--r-surface)] border border-dashed border-hair-bright/60 bg-white/[0.015] px-3 py-2.5",
        lifecycle(data).className,
      )}
      style={{ width: NODE_W - 24, ...lifecycle(data).style }}
    >
      <Waves size={14} className="shrink-0 text-ink-faint" />
      <span className="t-title truncate text-[12px] text-ink-dim italic">{data.term}</span>
    </div>
    <Handle type="source" position={Position.Right} />
  </>
);

const DestinationNode = ({
  data,
}: NodeProps & { data: Lifecycle & { reached: number; total: number } }) => (
  <>
    <Handle type="target" position={Position.Left} />
    <div
      className="node-card flex w-[104px] flex-col items-center gap-2 rounded-[var(--r-surface)] border border-destination/35 bg-destination/[0.07] px-3 py-4"
      style={lifecycle(data).style}
    >
      <Target size={22} className="text-destination" weight="regular" />
      <span className="t-label text-destination">destination</span>
      <span className="t-mono text-[11px] text-ink-faint">
        {data.reached}/{data.total}
      </span>
    </div>
  </>
);

const nodeTypes = {
  ticket: TicketNode as never,
  fog: FogNode as never,
  destination: DestinationNode as never,
};

const edgeTypes = { drawn: DrawnEdge as never };

/* ==================================================================== graph */

const buildGraph = (snap: MapSnapshot) => {
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
      target: "__destination",
      type: "drawn",
      style: { stroke: "var(--color-hair)", strokeDasharray: "2 6", opacity: 0.7 },
    });
  });

  nodes.push({
    id: "__destination",
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
const decorateFirstPaint = (g: { nodes: Node[]; edges: Edge[] }) => {
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

const FogVeil = () => {
  const fog = useNodes().filter((n) => n.type === "fog" && !n.data.exiting);
  if (!fog.length) return null;
  const left = Math.min(...fog.map((n) => n.position.x)) - 72;
  const top = Math.min(...fog.map((n) => n.position.y)) - 96;
  const right = Math.max(...fog.map((n) => n.position.x + (n.width ?? NODE_W))) + 200;
  const bottom = Math.max(...fog.map((n) => n.position.y + (n.height ?? 46))) + 96;
  return (
    <ViewportPortal>
      <div
        className="pointer-events-none"
        style={{ position: "absolute", left, top, width: right - left, height: bottom - top }}
      >
        <div className="fog-veil absolute inset-0 bg-[radial-gradient(ellipse_at_40%_50%,rgba(183,155,255,0.13),transparent_70%)] blur-2xl" />
        <div className="fog-veil-2 absolute inset-y-6 inset-x-16 bg-[radial-gradient(ellipse_at_65%_45%,rgba(232,121,166,0.10),transparent_65%)] blur-3xl" />
      </div>
    </ViewportPortal>
  );
};

/* ===================================================================== rail */

const Meter = ({ snap }: { snap: MapSnapshot }) => {
  const p = progress(snap);
  return (
    <div className="mt-3.5">
      <div className="flex h-[3px] gap-[3px] overflow-hidden rounded-full">
        {snap.tickets.map((t) => (
          <span
            key={t.id}
            className={cn("flex-1 rounded-full", stateStyle[visualState(t, snap)].dot)}
            style={{ opacity: t.status === "closed" ? 1 : 0.35 }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10.5px] text-ink-faint">
        <span className="t-mono">
          {p.closed}/{p.total} decided
        </span>
        <span>{p.fog} patches of fog</span>
      </div>
    </div>
  );
};

const Section = ({
  label,
  count,
  tint,
  defaultOpen = true,
  children,
}: {
  label: string;
  count: number;
  tint: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const reduce = useReducedMotion();
  const id = label.replace(/\s+/g, "-");

  return (
    <section className="border-b border-hair/70">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-ink-faint hover:text-ink-dim active:bg-panel-2"
        >
          <CaretRight
            size={11}
            className={cn(
              "shrink-0 transition-transform duration-[var(--dur-state)] ease-[var(--ease-out)] motion-reduce:transition-none",
              tint,
              open && "rotate-90",
            )}
            weight="bold"
          />
          <span className="t-label">{label}</span>
          <span className="t-mono ml-auto text-[10px]">{count}</span>
        </button>
      </h2>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={id}
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={
              reduce
                ? { duration: 0 }
                : {
                    height: { duration: 0.24, ease: [0.23, 1, 0.32, 1] },
                    opacity: { duration: 0.16 },
                  }
            }
            style={{ overflow: "hidden" }}
          >
            <div className="pb-2">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
};

const Row = ({
  ticket,
  snap,
  selected,
  onSelect,
}: {
  ticket: Ticket;
  snap: MapSnapshot;
  selected: boolean;
  onSelect: () => void;
}) => {
  const state = visualState(ticket, snap);
  const s = stateStyle[state];
  const TypeIcon: Icon = typeIcon[ticket.type];
  const StateIcon: Icon = stateIcon[state];
  const reduce = useReducedMotion();

  return (
    <div className="px-2">
      <button
        type="button"
        // Respond on pointer-down, not on click — untransitioned, so it's instant.
        onPointerDown={onSelect}
        aria-current={selected ? "true" : undefined}
        className="relative flex w-full items-start gap-2.5 rounded-[var(--r-control)] px-2 py-2 text-left"
      >
        {selected ? (
          <motion.span
            layoutId="rail-selection"
            className="absolute inset-0 -z-10 rounded-[var(--r-control)] bg-panel-2 ring-1 ring-hair"
            transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.22 }}
          />
        ) : null}
        <StateIcon size={13} className={cn("mt-[3px] shrink-0", s.text)} weight="regular" />
        <span className="min-w-0 flex-1">
          <span className="t-title block text-[12.5px] text-ink">{ticket.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-faint">
            <span className="t-mono">{ticket.shortId}</span>
            <TypeIcon size={11} weight="regular" />
            <span>{typeLabel[ticket.type]}</span>
            {ticket.assignee ? <span>{ticket.assignee}</span> : null}
            {state === "blocked" ? <span>waits on {ticket.blockedBy.join(", ")}</span> : null}
          </span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {selected ? (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={
              reduce
                ? { duration: 0 }
                : {
                    height: { duration: 0.24, ease: [0.23, 1, 0.32, 1] },
                    // exits are faster than entrances
                    opacity: { duration: 0.16 },
                  }
            }
            style={{ overflow: "hidden" }}
          >
            <div className="mx-2 mb-2 mt-1.5 border-l border-hair pl-3">
              <p className="text-[11.5px] leading-relaxed text-ink-dim">{ticket.question}</p>
              {ticket.malformed ? (
                <p className="mt-2 flex gap-1.5 text-[11px] leading-snug text-invalid">
                  <Warning size={13} className="mt-[1px] shrink-0" />
                  {ticket.malformed}
                </p>
              ) : null}
              {ticket.resolution ? (
                <p className="mt-2.5 text-[11.5px] leading-relaxed text-decided/85">
                  {ticket.resolution}
                </p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

/* ==================================================================== shell */

const Inner = ({ snap }: { snap: MapSnapshot }) => {
  const target = useMemo(() => buildGraph(snap), [snap]);
  // Seed once; every later snapshot is applied to React Flow's store as a
  // diff (useSnapshotDiff) — never by handing it a rebuilt array, which is
  // what remounted every edge and replayed every animation (see probe.ts).
  const seed = useRef<ReturnType<typeof decorateFirstPaint>>(undefined);
  seed.current ??= decorateFirstPaint(target);
  const [sel, setSel] = useState<string | null>("005");
  const reduce = useReducedMotion() ?? false;
  const rf = useReactFlow();
  const railRef = useRef<HTMLDivElement>(null);

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
    rf.fitView({ nodes: [{ id }], padding: 3.2, duration: 320, maxZoom: 1.15 });
  };

  const p = progress(snap);
  const front = frontier(snap);
  const claimed = snap.tickets.filter((t) => stateOf(t, snap) === "claimed");
  const blocked = snap.tickets.filter((t) => stateOf(t, snap) === "blocked");
  const done = decisionsSoFar(snap);

  const rows = (list: Ticket[]) =>
    list.map((t) => (
      <Row
        key={t.id}
        ticket={t}
        snap={snap}
        selected={sel === t.shortId}
        onSelect={() => pick(t.shortId)}
      />
    ));

  return (
    <div className="flex h-full bg-ground">
      <aside
        className="material-rail relative z-10 flex shrink-0 flex-col border-r border-hair"
        style={{ width: RAIL_W }}
        aria-label="Map index"
      >
        <header className="px-4 pb-4 pt-4">
          <div className="flex items-center gap-2">
            <Lighthouse size={16} className="text-accent" weight="regular" />
            <span className="t-title text-[13px] font-semibold tracking-tight">foglight</span>
            <span className="t-mono ml-auto truncate text-[10px] text-ink-faint">
              {snap.tracker}
            </span>
          </div>
          <h1 className="t-title mt-3 text-[15px] font-semibold">{snap.title}</h1>
          <div className="mt-3 rounded-[var(--r-surface)] border border-destination/25 bg-destination/[0.05] px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <Target size={13} className="text-destination" />
              <span className="t-label text-destination">destination</span>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-dim">{snap.destination}</p>
          </div>
          <Meter snap={snap} />
        </header>

        <div ref={railRef} className="edge-fade-top min-h-0 flex-1 overflow-y-auto">
          <Section label="frontier" count={front.length} tint="text-accent">
            {front.length ? (
              rows(front)
            ) : (
              <p className="px-4 py-2 text-[11.5px] text-ink-faint">
                Nothing takeable. Every open ticket is claimed or blocked.
              </p>
            )}
          </Section>
          <Section label="claimed" count={claimed.length} tint="text-claimed">
            {rows(claimed)}
          </Section>
          <Section label="blocked" count={blocked.length} tint="text-ink-faint" defaultOpen={false}>
            {rows(blocked)}
          </Section>
          <Section
            label="decisions so far"
            count={done.length}
            tint="text-decided"
            defaultOpen={false}
          >
            {rows(done)}
          </Section>
          <Section
            label="not yet specified"
            count={snap.fog.length}
            tint="text-ink-dim"
            defaultOpen={false}
          >
            {snap.fog.map((f) => (
              <div key={f.id} className="px-4 py-1.5">
                <div className="t-title text-[12px] text-ink-dim italic">{f.term}</div>
                <div className="mt-0.5 text-[10.5px] leading-snug text-ink-faint">
                  hangs on {f.hangsOn.join(", ")}
                </div>
              </div>
            ))}
          </Section>
          <Section
            label="out of scope"
            count={snap.outOfScope.length}
            tint="text-ink-faint"
            defaultOpen={false}
          >
            {snap.outOfScope.map((o) => (
              <div key={o.id} className="px-4 py-1.5">
                <div className="text-[12px] text-ink-faint line-through decoration-hair-bright">
                  {o.term}
                </div>
                <div className="mt-0.5 text-[10.5px] leading-snug text-ink-faint/85">
                  {o.reason}
                </div>
              </div>
            ))}
          </Section>
        </div>

        {snap.warnings.length ? (
          <div className="border-t border-invalid/25 bg-invalid/[0.05] px-4 py-3">
            {snap.warnings.map((w) => (
              <p key={w} className="flex gap-1.5 text-[10.5px] leading-snug text-invalid/90">
                <Warning size={12} className="mt-[1px] shrink-0" />
                {w}
              </p>
            ))}
          </div>
        ) : null}
      </aside>

      <div className={cn("relative min-w-0 flex-1", sel && "edges-dimmed")}>
        <ReactFlow
          defaultNodes={seed.current.nodes}
          defaultEdges={seed.current.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={() => rf.fitView({ padding: 0.16 })}
          minZoom={0.25}
          maxZoom={1.5}
          nodesDraggable={false}
          onNodeClick={(_, n) => (n.type === "ticket" ? pick(n.id) : setSel(null))}
          onPaneClick={() => setSel(null)}
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="#1b1a20" />
          <FogVeil />
        </ReactFlow>

        {/* Legend, as translucent chrome over the canvas rather than a bar that
            eats a strip of it. Fixed to the screen, not the graph. */}
        <div className="material-rail pointer-events-none absolute bottom-4 right-4 flex items-center gap-3 rounded-full border border-hair px-3.5 py-2">
          {(["frontier", "claimed", "closed", "blocked", "invalid"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-[10px] text-ink-dim">
              <span className={cn("size-1.5 rounded-full", stateStyle[k].dot)} />
              {stateStyle[k].label}
            </span>
          ))}
          <span className="h-3 w-px bg-hair" />
          <span className="t-mono text-[10px] text-ink-faint">{p.total} tickets</span>
        </div>
      </div>
    </div>
  );
};

export const VariantD = ({ snap }: { snap: MapSnapshot }) => (
  <ReactFlowProvider>
    <Inner snap={snap} />
  </ReactFlowProvider>
);
