// THROWAWAY PROTOTYPE — Riff D: "Ember".
// Palette: warm charcoal; the brand pink warms toward rose and the fog glows
// like banked coals. Rail interior: no accordions and no group chrome — one
// continuous list under sticky mini-headers, rows carrying state as a colour
// spine (like the canvas cards) instead of an icon, and the destination
// collapsed to a single disclosure line.
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
import { stateStyle, typeIcon, typeLabel } from "@/lib/tokens";
import { GlassShell, type RailContext } from "@/canvas/GlassShell";
import { Detail, Meter } from "@/canvas/railBits";
import { visualState } from "@/canvas/nodes";
import { cn } from "@/lib/utils";

const SpineRow = ({
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
  const reduce = useReducedMotion();

  return (
    <div className="px-2">
      <button
        type="button"
        onPointerDown={onSelect}
        aria-current={selected ? "true" : undefined}
        className="pressable relative flex w-full items-start gap-2.5 rounded-[var(--r-control)] py-2 pl-3.5 pr-2 text-left"
      >
        {selected ? (
          <motion.span
            layoutId="ember-selection"
            className="absolute inset-0 -z-10 rounded-[var(--r-control)] bg-white/[0.06] ring-1 ring-white/10"
            transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.3 }}
          />
        ) : null}
        {/* State as a spine, matching the canvas cards' vocabulary. */}
        <span
          className={cn("absolute inset-y-1.5 left-0 w-[2px] rounded-full", s.dot)}
          style={{ opacity: state === "blocked" ? 0.45 : 1 }}
        />
        <span className="min-w-0 flex-1">
          <span className="t-title block text-[12.5px] text-ink">{ticket.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-faint">
            <span className="t-mono">{ticket.shortId}</span>
            <span className={cn("text-[10px]", s.text)}>{s.label}</span>
            <TypeIcon size={11} weight="regular" />
            <span>{typeLabel[ticket.type]}</span>
            {ticket.assignee ? <span>{ticket.assignee}</span> : null}
            {state === "blocked" ? <span>waits on {ticket.blockedBy.join(", ")}</span> : null}
          </span>
        </span>
      </button>
      <Detail ticket={ticket} open={selected} />
    </div>
  );
};

const Sticky = ({ label, tint }: { label: string; tint?: string }) => (
  <div className="sticky top-0 z-10 -mx-px bg-panel/70 px-4 py-1.5 backdrop-blur-md">
    <span className={cn("t-label text-ink-faint", tint)}>{label}</span>
  </div>
);

const Rail = ({ snap, sel, pick }: RailContext) => {
  const [destOpen, setDestOpen] = useState(false);
  const reduce = useReducedMotion();

  const p = progress(snap);
  const front = frontier(snap);
  const claimed = snap.tickets.filter((t) => stateOf(t, snap) === "claimed");
  const blocked = snap.tickets.filter((t) => stateOf(t, snap) === "blocked");
  const done = decisionsSoFar(snap);

  const rows = (list: Ticket[]) =>
    list.map((t) => (
      <SpineRow
        key={t.id}
        ticket={t}
        snap={snap}
        selected={sel === t.shortId}
        onSelect={() => pick(t.shortId)}
      />
    ));

  return (
    <>
      <header className="px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <Lighthouse size={16} className="text-accent" weight="regular" />
          <span className="t-title text-[13px] font-semibold tracking-tight">foglight</span>
          <span className="t-mono ml-auto truncate text-[10px] text-ink-faint">{snap.tracker}</span>
        </div>
        <h1 className="t-title mt-3 text-[15px] font-semibold">{snap.title}</h1>

        {/* Destination as one honest line; the prose one disclosure away. */}
        <button
          type="button"
          onClick={() => setDestOpen((v) => !v)}
          aria-expanded={destOpen}
          className="mt-2.5 flex w-full items-center gap-1.5 rounded-[var(--r-control)] text-left"
        >
          <Target size={12} className="shrink-0 text-destination" />
          <span className="t-label text-destination">destination</span>
          <span className="t-mono ml-auto text-[10.5px] text-ink-faint">
            {p.closed}/{p.total} decided
          </span>
          <CaretRight
            size={10}
            weight="bold"
            className={cn(
              "shrink-0 text-ink-faint transition-transform duration-[var(--dur-state)] ease-[var(--ease-out)] motion-reduce:transition-none",
              destOpen && "rotate-90",
            )}
          />
        </button>
        <AnimatePresence initial={false}>
          {destOpen ? (
            <motion.div
              key="dest"
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
              <p className="pt-1.5 text-[11.5px] leading-relaxed text-ink-dim">
                {snap.destination}
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <Meter snap={snap} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <Sticky label="frontier" tint="text-accent" />
        {front.length ? (
          rows(front)
        ) : (
          <p className="px-4 py-2 text-[11.5px] text-ink-faint">
            Nothing takeable. Every open ticket is claimed or blocked.
          </p>
        )}
        {claimed.length ? (
          <>
            <Sticky label="claimed" tint="text-claimed" />
            {rows(claimed)}
          </>
        ) : null}
        {blocked.length ? (
          <>
            <Sticky label="blocked" />
            {rows(blocked)}
          </>
        ) : null}
        {done.length ? (
          <>
            <Sticky label="decisions so far" tint="text-decided" />
            {rows(done)}
          </>
        ) : null}
        {snap.fog.length ? (
          <>
            <Sticky label="not yet specified" />
            {snap.fog.map((f) => (
              <div key={f.id} className="px-4 py-1.5">
                <div className="t-title text-[12px] italic text-ink-dim">{f.term}</div>
                <div className="mt-0.5 text-[10.5px] leading-snug text-ink-faint">
                  hangs on {f.hangsOn.join(", ")}
                </div>
              </div>
            ))}
          </>
        ) : null}
        {snap.outOfScope.length ? (
          <>
            <Sticky label="out of scope" />
            {snap.outOfScope.map((o) => (
              <div key={o.id} className="px-4 py-1.5">
                <div className="text-[12px] text-ink-faint line-through decoration-hair-bright">
                  {o.term}
                </div>
                <div className="mt-0.5 text-[10.5px] leading-snug text-ink-faint/85">{o.reason}</div>
              </div>
            ))}
          </>
        ) : null}
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
    </>
  );
};

export const Ember = ({ snap }: { snap: MapSnapshot }) => (
  <GlassShell snap={snap} themeClass="theme-ember" renderRail={(ctx) => <Rail {...ctx} />} />
);
