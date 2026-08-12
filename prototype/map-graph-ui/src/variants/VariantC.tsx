// THROWAWAY PROTOTYPE — Variant C: "Route bands".
// Stance: topology is secondary; *progress along the route* is the story. Nodes
// are wide list rows, positioned by band (walked → here → ahead → fog) rather
// than by a layout engine, so the arrangement never moves when the map changes —
// only which band a row sits in. Dependencies still render as edges, but each row
// also states them in words, so the graph is a garnish on a list rather than the
// other way round.
import { useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { progress, stateOf, ticketById, type MapSnapshot, type Ticket } from "@/lib/domain";
import { stateStyle, typeGlyph, typeLabel } from "@/lib/tokens";
import { cn } from "@/lib/utils";

const ROW_W = 560;
const ROW_H = 78;
const GAP_Y = 14;
const BAND_PAD = 58;

type BandKey = "walked" | "here" | "ahead" | "fog";

const BANDS: { key: BandKey; label: string; hint: string; tint: string }[] = [
  {
    key: "walked",
    label: "walked",
    hint: "decisions so far — the route actually taken",
    tint: "text-decided",
  },
  {
    key: "here",
    label: "here",
    hint: "frontier & claimed — what a session can pick up",
    tint: "text-accent",
  },
  {
    key: "ahead",
    label: "ahead",
    hint: "blocked — waiting on something above",
    tint: "text-ink-dim",
  },
  {
    key: "fog",
    label: "fog",
    hint: "not yet specified — in scope, not yet sharp",
    tint: "text-ink-faint",
  },
];

const bandOf = (t: Ticket, snap: MapSnapshot): BandKey => {
  const s = stateOf(t, snap);
  if (s === "closed") return "walked";
  if (s === "blocked") return "ahead";
  return "here";
};

/* ---------------------------------- rows ---------------------------------- */

const RowNode = ({
  data,
  selected,
}: NodeProps & { data: { ticket: Ticket; snap: MapSnapshot } }) => {
  const { ticket, snap } = data;
  const state = ticket.malformed ? "invalid" : stateOf(ticket, snap);
  const s = stateStyle[state];
  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div
        className={cn(
          "flex h-[78px] w-[560px] items-center gap-4 border-l-2 bg-panel/90 px-4",
          "rounded-r-md",
          s.border.replace("border-", "border-l-"),
          state === "blocked" && "opacity-70",
          state === "frontier" && "bg-accent-soft/20",
          selected && "bg-panel-2 ring-1 ring-ink/40",
        )}
      >
        <span className="w-9 shrink-0 font-mono text-[11px] text-ink-faint">{ticket.shortId}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium">{ticket.title}</span>
          <span className="mt-0.5 block truncate text-[11px] leading-snug text-ink-dim">
            {ticket.gist ??
              (ticket.malformed
                ? `⚠ ${ticket.malformed}`
                : ticket.blockedBy.length && state === "blocked"
                  ? `waits on ${ticket.blockedBy
                      .map((b) => ticketById(snap, b)?.title ?? b)
                      .join(", ")}`
                  : ticket.question)}
          </span>
        </span>
        <span className="flex w-[104px] shrink-0 flex-col items-end gap-1 text-[10px]">
          <span className={cn("uppercase tracking-wider", s.text)}>{s.label}</span>
          <span className="font-mono text-ink-faint">
            {typeGlyph[ticket.type]} {typeLabel[ticket.type]}
          </span>
          {ticket.assignee ? <span className="text-ink-faint">{ticket.assignee}</span> : null}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
};

const FogRow = ({
  data,
}: NodeProps & { data: { term: string; detail: string; hangsOn: string[] } }) => (
  <>
    <Handle type="target" position={Position.Top} />
    <div className="flex h-[78px] w-[560px] items-center gap-4 rounded-r-md border-l-2 border-l-hair-bright/50 bg-white/[0.02] px-4">
      <span className="w-9 shrink-0 text-center text-ink-faint">≈</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-ink-dim italic">
          {data.term}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-ink-faint">{data.detail}</span>
      </span>
      <span className="w-[104px] shrink-0 text-right text-[10px] text-ink-faint">
        hangs on {data.hangsOn.join(", ")}
      </span>
    </div>
  </>
);

const nodeTypes = { row: RowNode as never, fogrow: FogRow as never };

/* --------------------------------- layout --------------------------------- */

const build = (snap: MapSnapshot) => {
  const buckets: Record<BandKey, { id: string; type: string; data: unknown }[]> = {
    walked: [],
    here: [],
    ahead: [],
    fog: [],
  };

  for (const t of snap.tickets)
    buckets[bandOf(t, snap)].push({ id: t.shortId, type: "row", data: { ticket: t, snap } });
  for (const f of snap.fog)
    buckets.fog.push({
      id: f.id,
      type: "fogrow",
      data: { term: f.term, detail: f.detail, hangsOn: f.hangsOn },
    });

  const nodes: Node[] = [];
  const bandRanges: Record<BandKey, { top: number; bottom: number }> = {} as never;
  let y = 0;
  for (const b of BANDS) {
    const top = y;
    y += BAND_PAD;
    for (const item of buckets[b.key]) {
      nodes.push({
        id: item.id,
        type: item.type,
        position: { x: 0, y },
        data: item.data as never,
        width: ROW_W,
        height: ROW_H,
        draggable: false,
      });
      y += ROW_H + GAP_Y;
    }
    if (!buckets[b.key].length) y += 40;
    y += 18;
    bandRanges[b.key] = { top, bottom: y };
  }

  const edges: Edge[] = [];
  for (const t of snap.tickets)
    for (const b of t.blockedBy)
      edges.push({
        id: `${b}->${t.shortId}`,
        source: b,
        target: t.shortId,
        type: "smoothstep",
        style: {
          stroke:
            ticketById(snap, b)?.status === "closed"
              ? "var(--color-decided)"
              : "var(--color-hair-bright)",
          strokeWidth: 1.2,
        },
      });
  for (const f of snap.fog)
    for (const h of f.hangsOn)
      edges.push({
        id: `${h}->${f.id}`,
        source: h,
        target: f.id,
        type: "smoothstep",
        style: { stroke: "var(--color-hair)", strokeDasharray: "3 5" },
      });

  return { nodes, edges, bandRanges, height: y };
};

const Bands = ({ ranges }: { ranges: Record<BandKey, { top: number; bottom: number }> }) => (
  <ViewportPortal>
    {BANDS.map((b) => {
      const r = ranges[b.key];
      return (
        <div
          key={b.key}
          className="pointer-events-none"
          style={{
            position: "absolute",
            left: -280,
            top: r.top,
            width: ROW_W + 560,
            height: r.bottom - r.top,
          }}
        >
          <div
            className={cn(
              "absolute inset-y-0 left-0 right-0 border-t border-dashed border-hair",
              b.key === "fog" &&
                "bg-[linear-gradient(180deg,rgba(196,163,255,0.10),rgba(10,10,12,0))]",
            )}
          />
          {b.key === "fog" ? (
            <div className="fog-veil absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,rgba(232,121,166,0.10),rgba(10,10,12,0)_70%)] blur-2xl" />
          ) : null}
          <div className="absolute left-6 top-4 w-[220px] text-right">
            <div className={cn("text-[11px] uppercase tracking-[0.28em]", b.tint)}>{b.label}</div>
            <div className="mt-1 text-[10.5px] leading-snug text-ink-faint">{b.hint}</div>
          </div>
        </div>
      );
    })}
  </ViewportPortal>
);

/* --------------------------------- shell ---------------------------------- */

const Inner = ({ snap }: { snap: MapSnapshot }) => {
  const { nodes, edges, bandRanges } = useMemo(() => build(snap), [snap]);
  const [sel, setSel] = useState<string | null>(null);
  const [oosOpen, setOosOpen] = useState(false);
  const { fitView } = useReactFlow();
  const p = progress(snap);
  const open = sel ? ticketById(snap, sel) : undefined;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-5 border-b border-hair bg-panel px-6 py-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-ink-faint">
          <span className="text-accent">◐</span> foglight
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold">{snap.title}</span>
            <span className="font-mono text-[10px] text-ink-faint">{snap.id}</span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-ink-dim">
            <span className="text-destination">★ destination — </span>
            {snap.destination}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[10px]">
          <span className="rounded-full border border-decided/40 px-2 py-1 font-mono text-decided">
            {p.closed}/{p.total} decided
          </span>
          <button
            onClick={() => setOosOpen((v) => !v)}
            className="rounded-full border border-hair px-2 py-1 text-ink-faint hover:text-ink-dim"
          >
            out of scope ({snap.outOfScope.length})
          </button>
        </div>
      </header>

      {oosOpen ? (
        <div className="shrink-0 border-b border-hair bg-panel-2 px-6 py-3">
          <ul className="flex flex-wrap gap-x-6 gap-y-1.5">
            {snap.outOfScope.map((o) => (
              <li key={o.id} className="text-[11px]">
                <span className="text-ink-dim line-through decoration-ink-faint/60">{o.term}</span>
                <span className="ml-2 text-ink-faint">{o.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={nodes.map((n) => ({ ...n, selected: n.id === sel }))}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={() => fitView({ padding: 0.06 })}
          minZoom={0.25}
          maxZoom={1.4}
          nodesDraggable={false}
          panOnScroll
          zoomOnScroll={false}
          onNodeClick={(_, n) => setSel(n.type === "row" ? n.id : null)}
          onPaneClick={() => setSel(null)}
        >
          <Background variant={BackgroundVariant.Lines} gap={64} size={1} color="#151319" />
          <Bands ranges={bandRanges} />
        </ReactFlow>

        {open ? (
          <div className="absolute inset-x-0 bottom-0 max-h-[46%] overflow-y-auto border-t border-hair bg-panel px-6 py-4">
            <div className="flex items-start gap-3">
              <span className="font-mono text-[11px] text-ink-faint">{open.shortId}</span>
              <h2 className="flex-1 text-[15px] font-semibold">{open.title}</h2>
              <button onClick={() => setSel(null)} className="text-ink-faint hover:text-ink">
                ✕
              </button>
            </div>
            <p className="mt-2.5 max-w-3xl text-[12.5px] leading-relaxed text-ink-dim">
              {open.question}
            </p>
            {open.resolution ? (
              <p className="mt-3 max-w-3xl border-t border-hair pt-3 text-[12.5px] leading-relaxed text-decided/90">
                {open.resolution}
              </p>
            ) : null}
            {open.malformed ? (
              <p className="mt-3 text-[12px] text-invalid">⚠ {open.malformed}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const VariantC = ({ snap }: { snap: MapSnapshot }) => (
  <ReactFlowProvider>
    <Inner snap={snap} />
  </ReactFlowProvider>
);
