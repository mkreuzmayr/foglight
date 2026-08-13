// THROWAWAY PROTOTYPE — the settled rail: Harbor's interior, picked in round
// two. A segmented control (Next / All / Decided) with a sliding glass thumb
// filters one continuous list; the header condenses to a progress ring beside
// a two-line destination. Fixed in this round — only the colour system varies.
import { motion, useReducedMotion } from "motion/react";
import { Lighthouse, Target, Warning } from "@phosphor-icons/react";
import { useState } from "react";
import {
  decisionsSoFar,
  frontier,
  progress,
  stateOf,
  type Ticket,
} from "@/lib/domain";
import type { RailContext } from "@/canvas/GlassShell";
import { Row } from "@/canvas/railBits";
import { cn } from "@/lib/utils";

type Segment = "next" | "all" | "decided";

const SEGMENTS: Array<{ key: Segment; label: string }> = [
  { key: "next", label: "Next" },
  { key: "all", label: "All" },
  { key: "decided", label: "Decided" },
];

const Ring = ({ closed, total }: { closed: number; total: number }) => {
  const r = 13;
  const c = 2 * Math.PI * r;
  const frac = total === 0 ? 0 : closed / total;
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" className="shrink-0 -rotate-90">
      <circle cx="17" cy="17" r={r} fill="none" strokeWidth="3" className="stroke-hair-bright" />
      <circle
        cx="17"
        cy="17"
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        className="stroke-accent transition-[stroke-dashoffset] duration-[var(--dur-move)] ease-[var(--ease-in-out)] motion-reduce:transition-none"
      />
    </svg>
  );
};

const MiniHeader = ({ label, tint }: { label: string; tint?: string }) => (
  <div className={cn("t-label px-4 pb-1 pt-3 text-ink-faint", tint)}>{label}</div>
);

export const HarborRail = ({ snap, sel, pick }: RailContext) => {
  const [seg, setSeg] = useState<Segment>("next");
  const reduce = useReducedMotion();

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
        selectionId="harbor-selection"
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
        <div className="mt-3 flex items-center gap-3">
          <Ring closed={p.closed} total={p.total} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Target size={12} className="shrink-0 text-destination" />
              <span className="t-mono text-[10.5px] text-ink-faint">
                {p.closed}/{p.total} decided, {p.fog} fog
              </span>
            </div>
            <p
              className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-dim"
              title={snap.destination}
            >
              {snap.destination}
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Filter tickets"
          className="mt-3.5 flex rounded-full bg-white/[0.05] p-[3px] ring-1 ring-white/[0.07]"
        >
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={seg === s.key}
              onClick={() => setSeg(s.key)}
              className={cn(
                "relative flex-1 rounded-full py-1 text-center text-[11px]",
                seg === s.key ? "font-medium text-ink" : "text-ink-faint hover:text-ink-dim",
              )}
            >
              {seg === s.key ? (
                <motion.span
                  layoutId="harbor-thumb"
                  className="absolute inset-0 rounded-full bg-white/[0.09] ring-1 ring-white/10"
                  transition={
                    reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.3 }
                  }
                />
              ) : null}
              <span className="relative">{s.label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="edge-fade-top min-h-0 flex-1 overflow-y-auto pb-2">
        {seg === "next" ? (
          <>
            {front.length ? (
              rows(front)
            ) : (
              <p className="px-4 py-2 text-[11.5px] text-ink-faint">
                Nothing takeable. Every open ticket is claimed or blocked.
              </p>
            )}
            {claimed.length ? (
              <>
                <MiniHeader label="claimed" tint="text-claimed" />
                {rows(claimed)}
              </>
            ) : null}
            {blocked.length ? (
              <>
                <MiniHeader label="blocked" />
                {rows(blocked)}
              </>
            ) : null}
          </>
        ) : null}

        {seg === "all" ? (
          <>
            <MiniHeader label="frontier" tint="text-accent" />
            {rows(front)}
            <MiniHeader label="claimed" tint="text-claimed" />
            {rows(claimed)}
            <MiniHeader label="blocked" />
            {rows(blocked)}
            <MiniHeader label="decisions so far" tint="text-decided" />
            {rows(done)}
            <MiniHeader label="not yet specified" />
            {snap.fog.map((f) => (
              <div key={f.id} className="px-4 py-1.5">
                <div className="t-title text-[12px] italic text-ink-dim">{f.term}</div>
                <div className="mt-0.5 text-[10.5px] leading-snug text-ink-faint">
                  hangs on {f.hangsOn.join(", ")}
                </div>
              </div>
            ))}
            <MiniHeader label="out of scope" />
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

        {seg === "decided" ? (
          done.length ? (
            rows(done)
          ) : (
            <p className="px-4 py-2 text-[11.5px] text-ink-faint">Nothing decided yet.</p>
          )
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
