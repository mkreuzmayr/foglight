// THROWAWAY PROTOTYPE — Variant A: "Daylight".
// The cockpit as a macOS-native light app: a translucent source-list rail over
// a soft grey ground, paper-white canvas, cards lifted by tinted shadows
// instead of borders doing all the work, SF (system-ui) type, sentence-case
// section headers. Brand pink recalibrated for white. Structure and every
// canvas animation are the shipped cockpit's, untouched.
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

const Meter = ({ snap }: { snap: MapSnapshot }) => {
  const p = progress(snap);
  return (
    <div className="mt-3.5">
      <div className="flex h-[3px] gap-[3px] overflow-hidden rounded-full">
        {snap.tickets.map((t) => (
          <span
            key={t.id}
            className={cn("flex-1 rounded-full", stateStyle[visualState(t, snap)].dot)}
            style={{ opacity: t.status === "closed" ? 1 : 0.3 }}
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
  const id = `dl-${label.replace(/\s+/g, "-")}`;

  return (
    <section className="px-2 pb-1">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          className="pressable flex w-full items-center gap-1.5 rounded-[var(--r-control)] px-2 py-1.5 text-left text-ink-faint hover:text-ink-dim"
        >
          <span className="t-label">{label}</span>
          <span className="t-mono text-[10px]">{count}</span>
          <CaretRight
            size={10}
            weight="bold"
            className={cn(
              "ml-auto shrink-0 transition-transform duration-[var(--dur-state)] ease-[var(--ease-out)] motion-reduce:transition-none",
              open && "rotate-90",
            )}
          />
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
            <div className="pb-1">{children}</div>
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
    <div>
      <button
        type="button"
        onPointerDown={onSelect}
        aria-current={selected ? "true" : undefined}
        className="pressable relative flex w-full items-start gap-2.5 rounded-[var(--r-control)] px-2 py-[7px] text-left"
      >
        {selected ? (
          <motion.span
            layoutId="daylight-selection"
            className="absolute inset-0 -z-10 rounded-[var(--r-control)] bg-accent-soft"
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
            <div className="mx-2 mb-2 mt-1 border-l-2 border-accent-soft pl-3">
              <p className="text-[11.5px] leading-relaxed text-ink-dim">{ticket.question}</p>
              {ticket.malformed ? (
                <p className="mt-2 flex gap-1.5 text-[11px] leading-snug text-invalid">
                  <Warning size={13} className="mt-[1px] shrink-0" />
                  {ticket.malformed}
                </p>
              ) : null}
              {ticket.resolution ? (
                <p className="mt-2 text-[11.5px] leading-relaxed text-decided">
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
    <div className="theme-daylight flex h-full">
      <aside
        className="material-rail relative z-10 flex shrink-0 flex-col border-r border-hair"
        style={{ width: RAIL_W }}
        aria-label="Map index"
      >
        <header className="px-4 pb-3 pt-4">
          <div className="flex items-center gap-1.5">
            <Lighthouse size={15} className="text-accent" weight="fill" />
            <span className="text-[12px] font-semibold tracking-[-0.01em] text-ink-dim">
              foglight
            </span>
            <span className="t-mono ml-auto truncate text-[10px] text-ink-faint">
              {snap.tracker}
            </span>
          </div>
          <h1 className="t-title mt-2.5 text-[17px] font-semibold tracking-[-0.02em]">
            {snap.title}
          </h1>
          <div className="mt-3 rounded-[var(--r-surface)] bg-destination/[0.08] px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <Target size={13} className="text-destination" />
              <span className="t-label text-destination">Destination</span>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-dim">{snap.destination}</p>
          </div>
          <Meter snap={snap} />
        </header>

        <div className="edge-fade-top min-h-0 flex-1 overflow-y-auto pt-1">
          <Section label="Frontier" count={front.length}>
            {front.length ? (
              rows(front)
            ) : (
              <p className="px-2 py-1.5 text-[11.5px] text-ink-faint">
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
              <div key={f.id} className="px-2 py-1.5">
                <div className="t-title text-[12px] italic text-ink-dim">{f.term}</div>
                <div className="mt-0.5 text-[10.5px] leading-snug text-ink-faint">
                  hangs on {f.hangsOn.join(", ")}
                </div>
              </div>
            ))}
          </Section>
          <Section label="Out of scope" count={snap.outOfScope.length} defaultOpen={false}>
            {snap.outOfScope.map((o) => (
              <div key={o.id} className="px-2 py-1.5">
                <div className="text-[12px] text-ink-faint line-through decoration-hair-bright">
                  {o.term}
                </div>
                <div className="mt-0.5 text-[10.5px] leading-snug text-ink-faint/85">{o.reason}</div>
              </div>
            ))}
          </Section>
        </div>

        {snap.warnings.length ? (
          <div className="border-t border-invalid/20 bg-invalid/[0.04] px-4 py-3">
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

        <div className="material-chip pointer-events-none absolute bottom-4 right-4 flex items-center gap-3 rounded-full px-3.5 py-2">
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
    </div>
  );
};

export const Daylight = ({ snap }: { snap: MapSnapshot }) => (
  <ReactFlowProvider>
    <Inner snap={snap} />
  </ReactFlowProvider>
);
