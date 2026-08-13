// THROWAWAY PROTOTYPE — Variant B: "Nightfall".
// The cockpit as a dark glass instrument: the canvas runs edge to edge and the
// rail floats over it as an inset translucent panel — content visibly pans
// underneath the material. Brand type (Geist) and brand pink stay; small-caps
// labels stay. Structure and every canvas animation are the shipped cockpit's.
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CaretRight, Lighthouse, Target, Warning, type Icon } from "@phosphor-icons/react";
import { useState } from "react";
import {
  decisionsSoFar,
  frontier,
  progress,
  stateOf,
  type MapSnapshot,
  type Ticket,
} from "@/lib/domain";
import { stateIcon, stateStyle, typeIcon, typeLabel } from "@/lib/tokens";
import { FogVeil, edgeTypes, nodeTypes, visualState } from "@/canvas/nodes";
import { useCockpit } from "@/canvas/useCockpit";
import { cn } from "@/lib/utils";

const RAIL_W = 336;
const RAIL_INSET = 16;

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
  const id = `nf-${label.replace(/\s+/g, "-")}`;

  return (
    <section className="border-b border-hair/60 last:border-b-0">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-ink-faint hover:text-ink-dim active:bg-white/[0.04]"
        >
          <CaretRight
            size={11}
            weight="bold"
            className={cn(
              "shrink-0 transition-transform duration-[var(--dur-state)] ease-[var(--ease-out)] motion-reduce:transition-none",
              tint,
              open && "rotate-90",
            )}
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
        onPointerDown={onSelect}
        aria-current={selected ? "true" : undefined}
        className="pressable relative flex w-full items-start gap-2.5 rounded-[var(--r-control)] px-2 py-2 text-left"
      >
        {selected ? (
          <motion.span
            layoutId="nightfall-selection"
            className="absolute inset-0 -z-10 rounded-[var(--r-control)] bg-white/[0.07] ring-1 ring-white/10"
            transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.3 }}
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
                    opacity: { duration: 0.16 },
                  }
            }
            style={{ overflow: "hidden" }}
          >
            <div className="mx-2 mb-2 mt-1.5 border-l border-hair-bright/60 pl-3">
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

const Inner = ({ snap }: { snap: MapSnapshot }) => {
  const { seed, sel, setSel, pick } = useCockpit(snap);

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
    <div className="theme-nightfall relative h-full overflow-hidden">
      {/* Full-bleed canvas; the rail is a material floating over it. */}
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
        <header className="px-4 pb-4 pt-4">
          <div className="flex items-center gap-2">
            <Lighthouse size={16} className="text-accent" weight="regular" />
            <span className="t-title text-[13px] font-semibold tracking-tight">foglight</span>
            <span className="t-mono ml-auto truncate text-[10px] text-ink-faint">
              {snap.tracker}
            </span>
          </div>
          <h1 className="t-title mt-3 text-[15px] font-semibold">{snap.title}</h1>
          <div className="mt-3 rounded-[var(--r-surface)] border border-destination/25 bg-destination/[0.06] px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <Target size={13} className="text-destination" />
              <span className="t-label text-destination">destination</span>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-dim">{snap.destination}</p>
          </div>
          <Meter snap={snap} />
        </header>

        <div className="edge-fade-top min-h-0 flex-1 overflow-y-auto">
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
                <div className="t-title text-[12px] italic text-ink-dim">{f.term}</div>
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
                <div className="mt-0.5 text-[10.5px] leading-snug text-ink-faint/85">{o.reason}</div>
              </div>
            ))}
          </Section>
        </div>

        {snap.warnings.length ? (
          <div className="border-t border-invalid/25 bg-invalid/[0.06] px-4 py-3">
            {snap.warnings.map((w) => (
              <p key={w} className="flex gap-1.5 text-[10.5px] leading-snug text-invalid/90">
                <Warning size={12} className="mt-[1px] shrink-0" />
                {w}
              </p>
            ))}
          </div>
        ) : null}
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

export const Nightfall = ({ snap }: { snap: MapSnapshot }) => (
  <ReactFlowProvider>
    <Inner snap={snap} />
  </ReactFlowProvider>
);
