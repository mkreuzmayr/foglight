// THROWAWAY PROTOTYPE — Variant B: "Cockpit".
// Stance: the graph answers "what's the shape", the rail answers "what do I do
// next" — so both are permanently on screen and selection is shared. The rail is
// the list view, ordered by the map's own sections; the canvas is left-to-right
// (route reads like a timeline) and carries no floating chrome at all.
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
import { stateStyle, typeGlyph, typeLabel } from "@/lib/tokens";
import { layout } from "@/lib/layout";
import { cn } from "@/lib/utils";

/* ------------------------------ compact nodes ----------------------------- */

const Pill = ({
  ticket,
  snap,
  selected,
}: {
  ticket: Ticket;
  snap: MapSnapshot;
  selected?: boolean;
}) => {
  const state = ticket.malformed ? "invalid" : stateOf(ticket, snap);
  const s = stateStyle[state];
  return (
    <div
      className={cn(
        "flex w-[210px] items-center gap-2.5 rounded-lg border bg-panel px-3 py-2.5",
        s.border,
        state === "blocked" && "opacity-60",
        state === "frontier" && "bg-accent-soft/25",
        selected && "ring-2 ring-ink/70",
      )}
    >
      <span className={cn("size-2 shrink-0 rounded-full", s.dot)} />
      <div className="min-w-0">
        <div className="truncate text-[12px] leading-tight font-medium">{ticket.title}</div>
        <div className="mt-0.5 font-mono text-[10px] text-ink-faint">
          {ticket.shortId} · {typeLabel[ticket.type]}
        </div>
      </div>
    </div>
  );
};

const TicketNode = ({
  data,
  selected,
}: NodeProps & { data: { ticket: Ticket; snap: MapSnapshot } }) => (
  <>
    <Handle type="target" position={Position.Left} />
    <Pill ticket={data.ticket} snap={data.snap} selected={selected} />
    <Handle type="source" position={Position.Right} />
  </>
);

const FogNode = ({ data }: NodeProps & { data: { term: string } }) => (
  <>
    <Handle type="target" position={Position.Left} />
    <div className="w-[190px] rounded-lg border border-dashed border-hair-bright/60 bg-white/[0.02] px-3 py-2.5 text-[12px] leading-tight text-ink-faint italic">
      {data.term}
    </div>
    <Handle type="source" position={Position.Right} />
  </>
);

const DestNode = () => (
  <>
    <Handle type="target" position={Position.Left} />
    <div className="grid h-[52px] w-[52px] place-items-center rounded-full border border-destination/50 bg-destination/10 text-xl text-destination">
      ★
    </div>
  </>
);

const nodeTypes = { ticket: TicketNode as never, fog: FogNode as never, dest: DestNode as never };

const buildGraph = (snap: MapSnapshot) => {
  const nodes: Node[] = snap.tickets.map((t) => ({
    id: t.shortId,
    type: "ticket",
    position: { x: 0, y: 0 },
    data: { ticket: t, snap },
    width: 210,
    height: 60,
  }));
  const edges: Edge[] = [];
  for (const t of snap.tickets)
    for (const b of t.blockedBy)
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
      });
  for (const f of snap.fog) {
    nodes.push({
      id: f.id,
      type: "fog",
      position: { x: 0, y: 0 },
      data: { term: f.term },
      width: 190,
      height: 52,
    });
    for (const h of f.hangsOn)
      edges.push({
        id: `${h}->${f.id}`,
        source: h,
        target: f.id,
        style: { stroke: "var(--color-hair)", strokeDasharray: "3 5" },
      });
    edges.push({
      id: `${f.id}->d`,
      source: f.id,
      target: "__d",
      style: { stroke: "var(--color-hair)", strokeDasharray: "2 6" },
    });
  }
  nodes.push({
    id: "__d",
    type: "dest",
    position: { x: 0, y: 0 },
    data: {},
    width: 52,
    height: 52,
  });
  return { nodes: layout(nodes, edges, { rankdir: "LR", ranksep: 96, nodesep: 22 }), edges };
};

const FogVeil = ({ nodes }: { nodes: Node[] }) => {
  const fogNodes = nodes.filter((n) => n.type === "fog");
  if (!fogNodes.length) return null;
  const x = Math.min(...fogNodes.map((n) => n.position.x)) - 60;
  const y = Math.min(...fogNodes.map((n) => n.position.y)) - 80;
  const right = Math.max(...fogNodes.map((n) => n.position.x + 190)) + 240;
  const bottom = Math.max(...fogNodes.map((n) => n.position.y + 52)) + 80;
  return (
    <ViewportPortal>
      <div
        className="pointer-events-none"
        style={{ position: "absolute", left: x, top: y, width: right - x, height: bottom - y }}
      >
        <div className="fog-veil absolute inset-0 bg-[linear-gradient(90deg,rgba(10,10,12,0),rgba(196,163,255,0.13)_40%,rgba(232,121,166,0.10))] blur-2xl" />
        <div className="absolute right-3 top-1 text-[10px] uppercase tracking-[0.3em] text-ink-faint">
          fog
        </div>
      </div>
    </ViewportPortal>
  );
};

/* ---------------------------------- rail ---------------------------------- */

const Section = ({
  label,
  count,
  accent,
  children,
  defaultOpen = true,
}: {
  label: string;
  count: number;
  accent: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-hair">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[10px] uppercase tracking-[0.18em] text-ink-faint hover:text-ink-dim"
      >
        <span className={cn("text-[13px] leading-none", accent)}>{open ? "▾" : "▸"}</span>
        {label}
        <span className="ml-auto font-mono tabular-nums">{count}</span>
      </button>
      {open ? <div className="pb-3">{children}</div> : null}
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
  const state: TicketState | "invalid" = ticket.malformed ? "invalid" : stateOf(ticket, snap);
  const s = stateStyle[state];
  return (
    <div>
      <button
        onClick={onSelect}
        className={cn(
          "flex w-full items-start gap-2.5 px-4 py-2 text-left hover:bg-panel-2",
          selected && "bg-panel-2",
        )}
      >
        <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", s.dot)} />
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] leading-snug text-ink">{ticket.title}</span>
          <span className="mt-0.5 block font-mono text-[10px] text-ink-faint">
            {ticket.shortId} · {typeGlyph[ticket.type]} {typeLabel[ticket.type]}
            {ticket.assignee ? ` · ${ticket.assignee}` : ""}
            {ticket.blockedBy.length && state === "blocked"
              ? ` · waits on ${ticket.blockedBy.join(", ")}`
              : ""}
          </span>
        </span>
      </button>
      {selected ? (
        <div className="mx-4 mb-2 rounded-lg border border-hair bg-panel-2 px-3 py-2.5">
          <p className="text-[11.5px] leading-relaxed text-ink-dim">{ticket.question}</p>
          {ticket.malformed ? (
            <p className="mt-2 text-[11px] text-invalid">⚠ {ticket.malformed}</p>
          ) : null}
          {ticket.resolution ? (
            <p className="mt-2 border-t border-hair pt-2 text-[11.5px] leading-relaxed text-decided/90">
              {ticket.resolution}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

/* --------------------------------- shell ---------------------------------- */

const Inner = ({ snap }: { snap: MapSnapshot }) => {
  const { nodes, edges } = useMemo(() => buildGraph(snap), [snap]);
  const [sel, setSel] = useState<string | null>("005");
  const { fitView } = useReactFlow();
  const p = progress(snap);
  const front = frontier(snap);
  const claimed = snap.tickets.filter((t) => stateOf(t, snap) === "claimed");
  const blocked = snap.tickets.filter((t) => stateOf(t, snap) === "blocked");
  const done = decisionsSoFar(snap);

  const pick = (id: string) => {
    setSel(id);
    fitView({ nodes: [{ id }], padding: 3, duration: 350, maxZoom: 1.2 });
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-[360px] shrink-0 flex-col overflow-y-auto border-r border-hair bg-panel">
        <header className="border-b border-hair px-4 py-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-ink-faint">
            <span className="text-accent">◐</span> foglight
          </div>
          <h1 className="mt-2 text-[15px] leading-tight font-semibold">{snap.title}</h1>
          <div className="mt-3 rounded-lg border border-destination/25 bg-destination/[0.05] px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-destination">
              ★ destination
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-dim">{snap.destination}</p>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-panel-2">
            <div
              className="h-full bg-decided"
              style={{ width: `${(p.closed / p.total) * 100}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-ink-faint">
            <span>{p.closed} decided</span>
            <span>
              {p.total - p.closed} open · {p.fog} fog
            </span>
          </div>
        </header>

        <Section label="frontier · takeable now" count={front.length} accent="text-accent">
          {front.map((t) => (
            <Row
              key={t.id}
              ticket={t}
              snap={snap}
              selected={sel === t.shortId}
              onSelect={() => pick(t.shortId)}
            />
          ))}
        </Section>
        <Section label="claimed" count={claimed.length} accent="text-claimed">
          {claimed.map((t) => (
            <Row
              key={t.id}
              ticket={t}
              snap={snap}
              selected={sel === t.shortId}
              onSelect={() => pick(t.shortId)}
            />
          ))}
        </Section>
        <Section label="blocked" count={blocked.length} accent="text-ink-faint" defaultOpen={false}>
          {blocked.map((t) => (
            <Row
              key={t.id}
              ticket={t}
              snap={snap}
              selected={sel === t.shortId}
              onSelect={() => pick(t.shortId)}
            />
          ))}
        </Section>
        <Section
          label="decisions so far"
          count={done.length}
          accent="text-decided"
          defaultOpen={false}
        >
          {done.map((t) => (
            <Row
              key={t.id}
              ticket={t}
              snap={snap}
              selected={sel === t.shortId}
              onSelect={() => pick(t.shortId)}
            />
          ))}
        </Section>
        <Section
          label="not yet specified"
          count={snap.fog.length}
          accent="text-ink-dim"
          defaultOpen={false}
        >
          {snap.fog.map((f) => (
            <div key={f.id} className="px-4 py-2">
              <div className="text-[12.5px] leading-snug text-ink-dim italic">{f.term}</div>
              <div className="mt-0.5 text-[10.5px] leading-snug text-ink-faint">
                hangs on {f.hangsOn.join(", ")}
              </div>
            </div>
          ))}
        </Section>
        <Section
          label="out of scope"
          count={snap.outOfScope.length}
          accent="text-ink-faint"
          defaultOpen={false}
        >
          {snap.outOfScope.map((o) => (
            <div key={o.id} className="px-4 py-2">
              <div className="text-[12.5px] text-ink-faint line-through">{o.term}</div>
              <div className="mt-0.5 text-[10.5px] leading-snug text-ink-faint/80">{o.reason}</div>
            </div>
          ))}
        </Section>
        {snap.warnings.length ? (
          <div className="mt-auto border-t border-invalid/30 bg-invalid/[0.06] px-4 py-3 text-[11px] leading-snug text-invalid/90">
            {snap.warnings.map((w) => (
              <div key={w}>⚠ {w}</div>
            ))}
          </div>
        ) : null}
      </aside>

      <div className="relative min-w-0 flex-1">
        <ReactFlow
          nodes={nodes.map((n) => ({ ...n, selected: n.id === sel }))}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={() => fitView({ padding: 0.14 })}
          minZoom={0.2}
          maxZoom={1.6}
          nodesDraggable={false}
          onNodeClick={(_, n) => n.type === "ticket" && setSel(n.id)}
        >
          <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="#221f29" />
          <FogVeil nodes={nodes} />
        </ReactFlow>
      </div>
    </div>
  );
};

export const VariantB = ({ snap }: { snap: MapSnapshot }) => (
  <ReactFlowProvider>
    <Inner snap={snap} />
  </ReactFlowProvider>
);
