/**
 * A ticket's prose, as an accordion **inside the rail row** — never a sheet and
 * never a modal, so the graph is never occluded by the thing you clicked on it
 * (SPEC.md §8).
 *
 * The body is fetched separately from the snapshot and is usually already warm
 * (the prefetch queue ran after first paint). When it isn't — or when the
 * fetch fails, or the ticket vanished between the snapshot and the request —
 * the error and its retry live *here*, inside the accordion. The card stays on
 * the graph either way: the structure is still true even when the prose isn't
 * readable.
 */
import { ArrowClockwise, Warning } from "@phosphor-icons/react";
import type { ResourceId, TicketNode } from "@foglight/core/domain";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTicketBody } from "@/lib/bodies.js";

/** `## Question` / `## Resolution`, shown as the two things a ticket holds. */
const sectionOf = (markdown: string, heading: string): string | null => {
  const pattern = new RegExp(`^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s|\\Z)`, "im");
  const match = pattern.exec(markdown);
  const text = match?.[1]?.replace(/<!--[\s\S]*?-->/g, "").trim();

  return text === undefined || text === "" ? null : text;
};

const Body = ({ mapId, ticket }: { mapId: ResourceId; ticket: TicketNode }) => {
  const query = useTicketBody(mapId, ticket.id, ticket.bodyHash);

  if (query.isPending) {
    return <p className="text-[11.5px] text-ink-faint">Reading…</p>;
  }

  if (query.isError) {
    return (
      <div className="flex items-start gap-1.5">
        <p className="text-[11.5px] leading-snug text-invalid/90">
          Could not read this ticket&apos;s body.
        </p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="t-label ml-auto flex shrink-0 items-center gap-1 text-ink-faint hover:text-ink-dim"
        >
          <ArrowClockwise size={11} />
          retry
        </button>
      </div>
    );
  }

  const markdown = query.data?.markdown ?? "";
  const question = sectionOf(markdown, "Question");
  const resolution = sectionOf(markdown, "Resolution");

  return (
    <>
      {question !== null ? (
        <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-ink-dim">{question}</p>
      ) : null}
      {ticket.malformed !== undefined ? (
        <p className="mt-2 flex gap-1.5 text-[11px] leading-snug text-invalid">
          <Warning size={13} className="mt-[1px] shrink-0" />
          {ticket.malformed}
        </p>
      ) : null}
      {resolution !== null ? (
        <p className="mt-2.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-decided/85">
          {resolution}
        </p>
      ) : null}
    </>
  );
};

export const TicketDetail = ({
  ticket,
  mapId,
  open,
}: {
  ticket: TicketNode;
  mapId: ResourceId;
  open: boolean;
}) => {
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
                  // Exits are faster than entrances.
                  opacity: { duration: 0.16 },
                }
          }
          style={{ overflow: "hidden" }}
        >
          <div className="mx-2 mb-2 mt-1.5 border-l border-hair pl-3">
            <Body mapId={mapId} ticket={ticket} />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
