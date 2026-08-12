/**
 * The cockpit (SPEC.md §8): a permanent rail beside a left-to-right React Flow
 * graph, selection shared both ways.
 *
 * The two halves answer different questions, and neither is a mode:
 *   - **the graph** answers "what is the shape of this effort"
 *   - **the rail** answers "what do I pick up next" — and owns what the graph
 *     structurally cannot show: out-of-scope entries, which have no position
 *     on a dependency graph, and parse warnings
 *
 * There is no view toggle. Both, always.
 *
 * React Flow runs **uncontrolled** here, and every snapshot is applied to its
 * store as a diff (`useSnapshotDiff`). This is not a preference — handing it a
 * rebuilt nodes array forces a re-measure, during which `EdgeWrapper` returns
 * `null` and every custom edge remounts, replaying every animation so the
 * whole map appears to redraw.
 */
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
import { CaretRight, Target, Warning, Waves, type Icon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  blocked as blockedTickets,
  claimed as claimedTickets,
  decisionsSoFar,
  frontier as frontierTickets,
  progress,
  stateOf,
  type MapSnapshot,
  type ResourceId,
  type TicketNode as Ticket,
} from "@foglight/core/domain";
import { DrawnEdge } from "@/components/DrawnEdge";
import { RailHeader } from "@/components/RailHeader";
import { TicketDetail } from "@/components/TicketDetail";
import {
  buildGraph,
  decorateFirstPaint,
  structureHash,
  DESTINATION_ID,
  NODE_W,
} from "@/lib/graph.js";
import { stateIcon, stateStyle, typeIcon, typeLabel } from "@/lib/tokens";
import { useSnapshotDiff } from "@/lib/useSnapshotDiff";
import { cn } from "@/lib/utils";
import type { ConnectionState } from "@/lib/live.js";

const RAIL_W = 348;

/* =============================================================== graph nodes */

/** Set by `useSnapshotDiff` on whatever has just arrived, left, or morphed. */
type Lifecycle = { enterDelay?: number; exiting?: boolean; morph?: boolean };

const lifecycle = (data: Lifecycle) => ({
  className: data.exiting ? "node-exiting" : data.morph ? "node-morph" : undefined,
  style: { ["--enter-delay" as string]: `${data.enterDelay ?? 0}ms` },
});

type TicketNodeData = Lifecycle & { ticket: Ticket; snapshot: MapSnapshot };

const TicketCard = ({ data, selected }: NodeProps & { data: TicketNodeData }) => {
  const { ticket, snapshot } = data;
  const state = stateOf(ticket, snapshot);
  const style = stateStyle[state];
  const TypeIcon: Icon = typeIcon[ticket.type];
  const life = lifecycle(data);

  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div
        className={cn(
          "node-card relative flex items-start gap-2.5 overflow-hidden bg-panel/90 py-2.5 pl-3.5 pr-3",
          "rounded-[var(--r-surface)] border",
          style.border,
          state === "blocked" && "opacity-65",
          selected && "bg-panel-2 ring-1 ring-ink/45",
          life.className,
        )}
        style={{ width: NODE_W, ...life.style }}
      >
        {/* State as a spine, not a badge: readable at any zoom, and never in
            competition with the title. */}
        <span className={cn("absolute inset-y-0 left-0 w-[2px]", style.dot)} />
        <TypeIcon size={15} className="mt-[3px] shrink-0 text-ink-faint" weight="regular" />
        <span className="min-w-0 flex-1">
          <span className="t-title block truncate text-[12.5px] font-medium text-ink">
            {ticket.title}
          </span>
          <span className="mt-1 flex items-center gap-1.5">
            <span className="t-mono text-[10px] text-ink-faint">{ticket.shortId}</span>
            <span className="size-[3px] rounded-full bg-hair-bright" />
            <span className={cn("text-[10px]", style.text)}>{style.label}</span>
            {ticket.assignee !== null && ticket.status === "open" ? (
              <span className="truncate text-[10px] text-ink-faint">{ticket.assignee}</span>
            ) : null}
          </span>
        </span>
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  );
};

const FogCard = ({ data }: NodeProps & { data: Lifecycle & { term: string } }) => (
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
      <span className="t-title truncate text-[12px] italic text-ink-dim">{data.term}</span>
    </div>
    <Handle type="source" position={Position.Right} />
  </>
);

const DestinationCard = ({
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
  ticket: TicketCard as never,
  fog: FogCard as never,
  destination: DestinationCard as never,
};

const edgeTypes = { drawn: DrawnEdge as never };

/**
 * The fog veil — the only perpetual animation in the app, because "unresolved"
 * is the one state that should not sit perfectly still. Rendered through
 * `<ViewportPortal />` so it lives in graph coordinates and pans with the map.
 */
const FogVeil = () => {
  const fog = useNodes().filter((n) => n.type === "fog" && n.data["exiting"] !== true);
  if (fog.length === 0) return null;
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
        <div className="fog-veil-2 absolute inset-x-16 inset-y-6 bg-[radial-gradient(ellipse_at_65%_45%,rgba(232,121,166,0.10),transparent_65%)] blur-3xl" />
      </div>
    </ViewportPortal>
  );
};

/* ===================================================================== rail */

const Meter = ({ snapshot }: { snapshot: MapSnapshot }) => {
  const p = progress(snapshot);
  return (
    <div className="mt-3.5">
      {/* One tick per ticket, not a percentage bar: it shows *shape* as well
          as progress — where the decided ones sit in the route. */}
      <div className="flex h-[3px] gap-[3px] overflow-hidden rounded-full">
        {snapshot.tickets.map((ticket) => (
          <span
            key={ticket.id}
            className={cn("flex-1 rounded-full", stateStyle[stateOf(ticket, snapshot)].dot)}
            style={{ opacity: ticket.status === "closed" ? 1 : 0.35 }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10.5px] text-ink-faint">
        <span className="t-mono">
          {p.closed}/{p.total} decided
        </span>
        <span>
          {p.fog} {p.fog === 1 ? "patch" : "patches"} of fog
        </span>
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
  const id = `section-${label.replace(/\s+/g, "-")}`;

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
  snapshot,
  selected,
  onSelect,
}: {
  ticket: Ticket;
  snapshot: MapSnapshot;
  selected: boolean;
  onSelect: () => void;
}) => {
  const state = stateOf(ticket, snapshot);
  const style = stateStyle[state];
  const TypeIcon: Icon = typeIcon[ticket.type];
  const StateIcon: Icon = stateIcon[state];
  const reduce = useReducedMotion();

  return (
    <div className="px-2">
      <button
        type="button"
        // Respond on pointer-down, untransitioned, so selection feels instant.
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
        <StateIcon size={13} className={cn("mt-[3px] shrink-0", style.text)} weight="regular" />
        <span className="min-w-0 flex-1">
          <span className="t-title block text-[12.5px] text-ink">{ticket.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-faint">
            <span className="t-mono">{ticket.shortId}</span>
            <TypeIcon size={11} weight="regular" />
            <span>{typeLabel[ticket.type]}</span>
            {ticket.assignee !== null ? <span>{ticket.assignee}</span> : null}
            {state === "blocked" ? <span>waits on {ticket.blockedBy.join(", ")}</span> : null}
          </span>
        </span>
      </button>
      {/* Detail is an accordion **inside the row** — never a sheet or a modal,
          so the graph is never occluded by the thing you clicked on it. */}
      <TicketDetail ticket={ticket} mapId={snapshot.id} open={selected} />
    </div>
  );
};

/* ==================================================================== shell */

export type CockpitProps = {
  snapshot: MapSnapshot;
  maps: ReadonlyArray<{ id: ResourceId; title: string; destination: string }>;
  connection: ConnectionState;
  stale: boolean;
  onRetry: () => void;
  selected: ResourceId | null;
  onSelect: (id: ResourceId | null) => void;
  onOpenMap: (id: ResourceId) => void;
};

const Inner = (props: CockpitProps) => {
  const { snapshot, selected, onSelect } = props;
  const target = useMemo(() => buildGraph(snapshot), [snapshot]);
  // Seed once. Every later snapshot is a diff against React Flow's own store.
  const seed = useRef<ReturnType<typeof decorateFirstPaint>>(undefined);
  seed.current ??= decorateFirstPaint(target);
  const reduce = useReducedMotion() ?? false;
  const rf = useReactFlow();

  // Layout only re-runs when the *structure* moved. A typo fix must not move
  // a card, so `data` is patched in place under an unchanged hash.
  const hash = structureHash(snapshot);
  const laidOut = useRef<{ hash: string; graph: { nodes: Node[]; edges: Edge[] } }>(undefined);
  if (laidOut.current === undefined || laidOut.current.hash !== hash) {
    laidOut.current = { hash, graph: target };
  } else {
    laidOut.current = {
      hash,
      graph: {
        nodes: laidOut.current.graph.nodes.map((node) => {
          const next = target.nodes.find((n) => n.id === node.id);
          return next === undefined ? node : { ...node, data: next.data };
        }),
        edges: target.edges,
      },
    };
  }

  useSnapshotDiff(laidOut.current.graph, reduce);

  // Selection lives in the store too, identity-stable where unchanged so
  // untouched nodes and edges skip rendering entirely.
  useEffect(() => {
    rf.setNodes((ns) =>
      ns.map((n) =>
        n.selected === (n.id === selected) ? n : { ...n, selected: n.id === selected },
      ),
    );
    rf.setEdges((es) =>
      es.map((e) => {
        const cls =
          selected !== null && (e.source === selected || e.target === selected)
            ? "edge-lit"
            : undefined;
        return e.className === cls ? e : { ...e, className: cls };
      }),
    );
  }, [selected, rf]);

  const pick = (id: ResourceId) => {
    onSelect(id);
    // The viewport never moves on its own — but it may move because a person
    // asked for this ticket. That is not the same thing (SPEC.md §8).
    rf.fitView({ nodes: [{ id: String(id) }], padding: 3.2, duration: 320, maxZoom: 1.15 });
  };

  const p = progress(snapshot);
  const front = frontierTickets(snapshot);
  const claimed = claimedTickets(snapshot);
  const blocked = blockedTickets(snapshot);
  const done = decisionsSoFar(snapshot);

  const rows = (list: ReadonlyArray<Ticket>) =>
    list.map((ticket) => (
      <Row
        key={ticket.id}
        ticket={ticket}
        snapshot={snapshot}
        selected={selected === ticket.id}
        onSelect={() => pick(ticket.id)}
      />
    ));

  return (
    <div className="flex h-full bg-ground">
      <aside
        className="material-rail relative z-10 flex shrink-0 flex-col border-r border-hair"
        style={{ width: RAIL_W }}
        aria-label="Map index"
      >
        <RailHeader
          snapshot={snapshot}
          maps={props.maps}
          connection={props.connection}
          stale={props.stale}
          onRetry={props.onRetry}
          onOpenMap={props.onOpenMap}
        />
        <div className="px-4 pb-4">
          <div className="rounded-[var(--r-surface)] border border-destination/25 bg-destination/[0.05] px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <Target size={13} className="text-destination" />
              <span className="t-label text-destination">destination</span>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-dim">
              {snapshot.destination}
            </p>
          </div>
          <Meter snapshot={snapshot} />
        </div>

        {/* Ordered by the map's own sections — this ordering *is* the answer to
            "what do I pick up next". */}
        <div className="edge-fade-top min-h-0 flex-1 overflow-y-auto">
          <Section label="frontier" count={front.length} tint="text-accent">
            {front.length > 0 ? (
              rows(front)
            ) : (
              <p className="px-4 py-2 text-[11.5px] text-ink-faint">
                {snapshot.tickets.length === 0
                  ? "No tickets on this map yet."
                  : done.length === snapshot.tickets.length
                    ? "Every ticket is decided. The way to the destination is clear."
                    : "Nothing takeable. Every open ticket is claimed or blocked."}
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
            count={snapshot.fog.length}
            tint="text-ink-dim"
            defaultOpen={false}
          >
            {snapshot.fog.map((patch) => (
              <div key={patch.id} className="px-4 py-1.5">
                <div className="t-title text-[12px] italic text-ink-dim">{patch.term}</div>
                <div className="mt-0.5 text-[10.5px] leading-snug text-ink-faint">
                  {patch.hangsOn.length > 0
                    ? `hangs on ${patch.hangsOn.join(", ")}`
                    : "not yet hanging on anything"}
                </div>
              </div>
            ))}
          </Section>
          {/* Out of scope has no position on a dependency graph — the rail is
              the only place it can appear at all. */}
          <Section
            label="out of scope"
            count={snapshot.outOfScope.length}
            tint="text-ink-faint"
            defaultOpen={false}
          >
            {snapshot.outOfScope.map((entry) => (
              <div key={entry.id} className="px-4 py-1.5">
                <div className="text-[12px] text-ink-faint line-through decoration-hair-bright">
                  {entry.term}
                </div>
              </div>
            ))}
          </Section>
        </div>

        {snapshot.warnings.length > 0 ? (
          <div className="max-h-40 shrink-0 overflow-y-auto border-t border-invalid/25 bg-invalid/[0.05] px-4 py-3">
            {snapshot.warnings.map((warning) => (
              <p
                key={`${warning.kind}-${warning.message}`}
                className="flex gap-1.5 text-[10.5px] leading-snug text-invalid/90"
              >
                <Warning size={12} className="mt-[1px] shrink-0" />
                {warning.message}
              </p>
            ))}
          </div>
        ) : null}
      </aside>

      <div className={cn("relative min-w-0 flex-1", selected !== null && "edges-dimmed")}>
        <ReactFlow
          defaultNodes={seed.current.nodes}
          defaultEdges={seed.current.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          // The `fitView` *prop*, not a fitView call on init: React Flow defers
          // it until nodes have measured, whereas `onInit` fires before that
          // and fits to placeholder dimensions. This is the only automatic
          // viewport move in the app — thereafter the viewport never moves on
          // its own (SPEC.md §8).
          fitView
          fitViewOptions={{ padding: 0.16 }}
          minZoom={0.25}
          maxZoom={1.5}
          nodesDraggable={false}
          onNodeClick={(_, node) =>
            node.type === "ticket" ? pick(node.id as ResourceId) : onSelect(null)
          }
          onPaneClick={() => onSelect(null)}
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="#1b1a20" />
          <FogVeil />
        </ReactFlow>

        {/* Translucent chrome over the canvas rather than a bar eating a strip. */}
        <div className="material-rail pointer-events-none absolute bottom-4 right-4 flex items-center gap-3 rounded-full border border-hair px-3.5 py-2">
          {(["frontier", "claimed", "closed", "blocked", "invalid"] as const).map((key) => (
            <span key={key} className="flex items-center gap-1.5 text-[10px] text-ink-dim">
              <span className={cn("size-1.5 rounded-full", stateStyle[key].dot)} />
              {stateStyle[key].label}
            </span>
          ))}
          <span className="h-3 w-px bg-hair" />
          <span className="t-mono text-[10px] text-ink-faint">
            {p.total} {p.total === 1 ? "ticket" : "tickets"}
          </span>
        </div>
      </div>
    </div>
  );
};

/**
 * Keyed on the map id so a switch **replaces** rather than mutates: a
 * different map is a different subject, so the graph is rebuilt from a fresh
 * seed and cross-faded rather than glided (SPEC.md §9).
 */
export const Cockpit = (props: CockpitProps) => (
  <ReactFlowProvider key={String(props.snapshot.id)}>
    <Inner {...props} />
  </ReactFlowProvider>
);

export { DESTINATION_ID };
