// THROWAWAY PROTOTYPE — Riff B: "Violet Hour".
// Palette: the whole room shifts indigo; lavender accent, claimed hands its
// purple to teal. Rail interior: iOS-style inset grouped sections — each
// section is its own rounded glass-on-glass group with the header inside,
// instead of full-width hairline dividers.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CaretRight, Lighthouse, Target, Warning } from "@phosphor-icons/react";
import { useState } from "react";
import { decisionsSoFar, frontier, stateOf, type MapSnapshot, type Ticket } from "@/lib/domain";
import { GlassShell, type RailContext } from "@/canvas/GlassShell";
import { Meter, Row } from "@/canvas/railBits";
import { cn } from "@/lib/utils";

const Group = ({
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
  const id = `vh-${label.replace(/\s+/g, "-")}`;

  return (
    <section className="mb-2 overflow-hidden rounded-[14px] bg-white/[0.04] ring-1 ring-white/[0.06]">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-ink-faint hover:text-ink-dim active:bg-white/[0.04]"
        >
          <span className={cn("t-label", tint)}>{label}</span>
          <span className="t-mono ml-auto text-[10px]">{count}</span>
          <CaretRight
            size={11}
            weight="bold"
            className={cn(
              "shrink-0 transition-transform duration-[var(--dur-state)] ease-[var(--ease-out)] motion-reduce:transition-none",
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
            <div className="pb-2">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
};

const Rail = ({ snap, sel, pick }: RailContext) => {
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
        selectionId="violet-selection"
      />
    ));

  return (
    <>
      <header className="px-4 pb-3.5 pt-4">
        <div className="flex items-center gap-2">
          <Lighthouse size={16} className="text-accent" weight="regular" />
          <span className="t-title text-[13px] font-semibold tracking-tight">foglight</span>
          <span className="t-mono ml-auto truncate text-[10px] text-ink-faint">{snap.tracker}</span>
        </div>
        <h1 className="t-title mt-3 text-[15px] font-semibold">{snap.title}</h1>
        <div className="mt-3 rounded-[14px] bg-destination/[0.08] px-3 py-2.5 ring-1 ring-destination/20">
          <div className="flex items-center gap-1.5">
            <Target size={13} className="text-destination" />
            <span className="t-label text-destination">destination</span>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-dim">{snap.destination}</p>
        </div>
        <Meter snap={snap} />
      </header>

      <div className="edge-fade-top min-h-0 flex-1 overflow-y-auto px-3 pt-1">
        <Group label="frontier" count={front.length} tint="text-accent">
          {front.length ? (
            rows(front)
          ) : (
            <p className="px-3 py-1.5 text-[11.5px] text-ink-faint">
              Nothing takeable. Every open ticket is claimed or blocked.
            </p>
          )}
        </Group>
        <Group label="claimed" count={claimed.length} tint="text-claimed">
          {rows(claimed)}
        </Group>
        <Group label="blocked" count={blocked.length} tint="text-ink-faint" defaultOpen={false}>
          {rows(blocked)}
        </Group>
        <Group label="decisions so far" count={done.length} tint="text-decided" defaultOpen={false}>
          {rows(done)}
        </Group>
        <Group
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
        </Group>
        <Group
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
        </Group>
        <div className="h-2" />
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

export const VioletHour = ({ snap }: { snap: MapSnapshot }) => (
  <GlassShell
    snap={snap}
    themeClass="theme-violet"
    renderRail={(ctx) => <Rail {...ctx} />}
  />
);
