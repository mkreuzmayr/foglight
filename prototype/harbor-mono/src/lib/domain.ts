// THROWAWAY PROTOTYPE — domain types trimmed to what the view needs.
// Mirrors the model settled in ticket 004 (Tracker adapter interface design).

export type TicketType = "research" | "prototype" | "grilling" | "task";

export type Ticket = {
  id: string; // qualified readable id, e.g. local:.wayfinder/tickets/005-…
  shortId: string; // what we actually show: "005"
  title: string;
  type: TicketType;
  status: "open" | "closed";
  assignee: string | null;
  blockedBy: string[];
  question: string;
  /** one-line gist as it appears in Decisions so far (closed tickets only) */
  gist?: string;
  resolution?: string;
  /** non-fatal parse failure — the node still renders, marked (CONTEXT.md: malformed ticket) */
  malformed?: string;
  /**
   * The fog entry this ticket graduated out of, if any. Wayfinder's own verb:
   * resolving a ticket "graduates" fog into fresh tickets. The viewer uses it
   * for continuity — the fog node *becomes* the ticket instead of being
   * replaced by it.
   */
  graduatedFrom?: string;
};

export type FogEntry = {
  id: string;
  term: string;
  detail: string;
  /** which open tickets this patch hangs on — gives the fog real position on the graph */
  hangsOn: string[];
};

export type OutOfScopeEntry = { id: string; term: string; reason: string };

export type MapSnapshot = {
  id: string;
  title: string;
  destination: string;
  tracker: "local" | "github";
  tickets: Ticket[];
  fog: FogEntry[];
  outOfScope: OutOfScopeEntry[];
  warnings: string[];
  readAt: string;
};

/** Derived once, here — not per adapter, not per view (ticket 004). */
export const isUnblocked = (t: Ticket, snap: MapSnapshot) =>
  t.blockedBy.every((id) => snap.tickets.find((x) => x.shortId === id)?.status === "closed");

export type TicketState =
  | "closed"
  | "frontier" // open, unblocked, unclaimed — takeable now
  | "claimed" // open, unblocked, someone's on it
  | "blocked";

export const stateOf = (t: Ticket, snap: MapSnapshot): TicketState => {
  if (t.status === "closed") return "closed";
  if (!isUnblocked(t, snap)) return "blocked";
  return t.assignee ? "claimed" : "frontier";
};

export const frontier = (snap: MapSnapshot) =>
  snap.tickets.filter((t) => stateOf(t, snap) === "frontier");

export const decisionsSoFar = (snap: MapSnapshot) =>
  snap.tickets.filter((t) => t.status === "closed");

export const progress = (snap: MapSnapshot) => {
  const closed = decisionsSoFar(snap).length;
  return { closed, total: snap.tickets.length, fog: snap.fog.length };
};

export const ticketById = (snap: MapSnapshot, shortId: string) =>
  snap.tickets.find((t) => t.shortId === shortId);
