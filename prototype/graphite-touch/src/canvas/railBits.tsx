// THROWAWAY PROTOTYPE — rail pieces shared by riffs that keep the baseline row
// anatomy (state icon, title, metadata line, accordion detail inside the row).
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Warning, type Icon } from "@phosphor-icons/react";
import { progress, type MapSnapshot, type Ticket } from "@/lib/domain";
import { stateIcon, stateStyle, typeIcon, typeLabel } from "@/lib/tokens";
import { visualState } from "@/canvas/nodes";
import { cn } from "@/lib/utils";

export const Meter = ({ snap }: { snap: MapSnapshot }) => {
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

export const Detail = ({ ticket, open }: { ticket: Ticket; open: boolean }) => {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open ? (
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
  );
};

export const Row = ({
  ticket,
  snap,
  selected,
  onSelect,
  selectionId,
}: {
  ticket: Ticket;
  snap: MapSnapshot;
  selected: boolean;
  onSelect: () => void;
  /** layoutId for the sliding selection pill — unique per mounted rail */
  selectionId: string;
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
            layoutId={selectionId}
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
      <Detail ticket={ticket} open={selected} />
    </div>
  );
};
