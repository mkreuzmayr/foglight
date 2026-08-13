// THROWAWAY PROTOTYPE — Variant C: "Graphite".
// The cockpit as a macOS pro app (Final Cut / Logic grammar): a unified
// toolbar across the top, an opaque graphite rail, and the canvas set into a
// darker viewer well with a status bar along its bottom edge instead of a
// floating legend. Denser rows, tabular numbers, Apple system blue as the
// accent — the "what if foglight went full Apple" question. Structure and
// every canvas animation are the shipped cockpit's, untouched.
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

const RAIL_W = 312;

const Section = ({
  label,
  count,
  defaultOpen = true,
  children,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const reduce = useReducedMotion();
  const id = `gr-${label.replace(/\s+/g, "-")}`;

  return (
    <section className="border-b border-hair/70">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          className="flex w-full items-center gap-1.5 px-3 py-[7px] text-left text-ink-faint hover:text-ink-dim active:bg-panel-2"
        >
          <CaretRight
            size={10}
            weight="bold"
            className={cn(
              "shrink-0 transition-transform duration-[var(--dur-state)] ease-[var(--ease-out)] motion-reduce:transition-none",
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
            <div className="pb-1.5">{children}</div>
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
    <div className="px-1.5">
      <button
        type="button"
        onPointerDown={onSelect}
        aria-current={selected ? "true" : undefined}
        className="pressable relative flex w-full items-start gap-2 rounded-[var(--r-control)] px-1.5 py-[5px] text-left"
      >
        {selected ? (
          <motion.span
            layoutId="graphite-selection"
            className="absolute inset-0 -z-10 rounded-[var(--r-control)] bg-accent-soft ring-1 ring-accent/30"
            transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.3 }}
          />
        ) : null}
        <StateIcon size={12} className={cn("mt-[3px] shrink-0", s.text)} weight="regular" />
        <span className="min-w-0 flex-1">
          <span className="t-title block text-[12px] text-ink">{ticket.title}</span>
          <span className="mt-px flex flex-wrap items-center gap-1.5 text-[10px] text-ink-faint">
            <span className="t-mono">{ticket.shortId}</span>
            <TypeIcon size={10.5} weight="regular" />
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
            <div className="mx-1.5 mb-2 mt-1 border-l border-hair-bright pl-2.5">
              <p className="text-[11px] leading-relaxed text-ink-dim">{ticket.question}</p>
              {ticket.malformed ? (
                <p className="mt-1.5 flex gap-1.5 text-[10.5px] leading-snug text-invalid">
                  <Warning size={12} className="mt-[1px] shrink-0" />
                  {ticket.malformed}
                </p>
              ) : null}
              {ticket.resolution ? (
                <p className="mt-2 text-[11px] leading-relaxed text-decided/85">
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
    <div className="theme-graphite flex h-full flex-col">
      {/* Unified toolbar: identity left, subject centre, progress right. */}
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-hair bg-panel px-3.5">
        <span className="flex items-center gap-1.5">
          <Lighthouse size={14} className="text-accent" weight="fill" />
          <span className="text-[12px] font-semibold tracking-[-0.01em] text-ink-dim">
            foglight
          </span>
        </span>
        <span className="t-title min-w-0 flex-1 truncate text-center text-[12.5px] font-medium text-ink">
          {snap.title}
        </span>
        <span className="t-mono flex shrink-0 items-center gap-2 text-[10.5px] text-ink-faint">
          <span>
            {p.closed}/{p.total} decided
          </span>
          <span className="h-3 w-px bg-hair-bright" />
          <span>{snap.tracker}</span>
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className="material-rail relative z-10 flex shrink-0 flex-col border-r border-hair"
          style={{ width: RAIL_W }}
          aria-label="Map index"
        >
          <div className="border-b border-hair px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <Target size={12} className="text-destination" />
              <span className="t-label text-destination">Destination</span>
            </div>
            <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-ink-dim">
              {snap.destination}
            </p>
            <div className="mt-2.5 flex h-[3px] gap-[2px] overflow-hidden rounded-full">
              {snap.tickets.map((t) => (
                <span
                  key={t.id}
                  className={cn("flex-1 rounded-full", stateStyle[visualState(t, snap)].dot)}
                  style={{ opacity: t.status === "closed" ? 1 : 0.3 }}
                />
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <Section label="Frontier" count={front.length}>
              {front.length ? (
                rows(front)
              ) : (
                <p className="px-3 py-1.5 text-[11px] text-ink-faint">
                  Nothing takeable. Every open ticket is claimed or blocked.
                </p>
              )}
            </Section>
            <Section label="Claimed" count={claimed.length}>
              {rows(claimed)}
            </Section>
            <Section label="Blocked" count={blocked.length} defaultOpen={false}>
              {rows(blocked)}
            </Section>
            <Section label="Decisions so far" count={done.length} defaultOpen={false}>
              {rows(done)}
            </Section>
            <Section label="Not yet specified" count={snap.fog.length} defaultOpen={false}>
              {snap.fog.map((f) => (
                <div key={f.id} className="px-3 py-1">
                  <div className="t-title text-[11.5px] italic text-ink-dim">{f.term}</div>
                  <div className="mt-0.5 text-[10px] leading-snug text-ink-faint">
                    hangs on {f.hangsOn.join(", ")}
                  </div>
                </div>
              ))}
            </Section>
            <Section label="Out of scope" count={snap.outOfScope.length} defaultOpen={false}>
              {snap.outOfScope.map((o) => (
                <div key={o.id} className="px-3 py-1">
                  <div className="text-[11.5px] text-ink-faint line-through decoration-hair-bright">
                    {o.term}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-snug text-ink-faint/85">{o.reason}</div>
                </div>
              ))}
            </Section>
          </div>

          {snap.warnings.length ? (
            <div className="border-t border-invalid/25 bg-invalid/[0.05] px-3 py-2.5">
              {snap.warnings.map((w) => (
                <p key={w} className="flex gap-1.5 text-[10px] leading-snug text-invalid/90">
                  <Warning size={11} className="mt-[1px] shrink-0" />
                  {w}
                </p>
              ))}
            </div>
          ) : null}
        </aside>

        {/* The canvas as a viewer well: inset, darker than the chrome. */}
        <div className="min-w-0 flex-1 p-2.5">
          <div
            className={cn(
              "relative flex h-full flex-col overflow-hidden rounded-[10px] border border-black/40 bg-[var(--canvas)] shadow-[inset_0_1px_8px_rgba(0,0,0,0.35)]",
              sel && "edges-dimmed",
            )}
          >
            <div className="min-h-0 flex-1">
              <ReactFlow
                defaultNodes={seed.nodes}
                defaultEdges={seed.edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                fitViewOptions={{ padding: 0.16 }}
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

            {/* Status bar, not a floating pill: pro apps dock their readouts. */}
            <div className="flex h-7 shrink-0 items-center gap-3 border-t border-hair bg-panel/95 px-3">
              {(["frontier", "claimed", "closed", "blocked", "invalid"] as const).map((k) => (
                <span key={k} className="flex items-center gap-1.5 text-[10px] text-ink-dim">
                  <span className={cn("size-1.5 rounded-full", stateStyle[k].dot)} />
                  {stateStyle[k].label}
                </span>
              ))}
              <span className="t-mono ml-auto text-[10px] text-ink-faint">
                {p.total} tickets · {p.fog} fog
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Graphite = ({ snap }: { snap: MapSnapshot }) => (
  <ReactFlowProvider>
    <Inner snap={snap} />
  </ReactFlowProvider>
);
