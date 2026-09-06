/**
 * The one place `frontier` and `unblocked` are computed (SPEC.md §5).
 *
 * Adapters report facts; the shared domain derives meaning. No adapter may
 * return a "frontier" field, and the client must not recompute one — both
 * would be a second definition of a word the map already owns.
 */
import type { MapSnapshot, TicketNode, TicketState } from "./model.js";

/** Index by shortId once; blocking edges are expressed in shortIds. */
const indexTickets = (snapshot: MapSnapshot): ReadonlyMap<string, TicketNode> =>
  new Map(snapshot.tickets.map((t) => [t.shortId, t]));

/**
 * Unblocked when every ticket blocking it is closed.
 *
 * A blocker that does not exist is a dangling edge: `loadMap` already dropped
 * it with a warning, so anything still named here and missing is treated as
 * *not* blocking — the ticket stays visible and takeable rather than being
 * silently pinned shut by a typo.
 */
export const isUnblocked = (ticket: TicketNode, snapshot: MapSnapshot): boolean => {
  const byShortId = indexTickets(snapshot);

  return ticket.blockedBy.every((id) => {
    const blocker = byShortId.get(id);

    return blocker === undefined || blocker.status === "closed";
  });
};

export const stateOf = (ticket: TicketNode, snapshot: MapSnapshot): TicketState => {
  if (ticket.malformed !== undefined) {
    return "invalid";
  }

  if (ticket.status === "closed") {
    return "closed";
  }

  if (!isUnblocked(ticket, snapshot)) {
    return "blocked";
  }

  return ticket.assignee === null ? "frontier" : "claimed";
};

/** Open, unblocked, unclaimed — the edge of the known, takeable now. */
export const frontier = (snapshot: MapSnapshot): readonly TicketNode[] =>
  snapshot.tickets.filter((t) => stateOf(t, snapshot) === "frontier");

export const claimed = (snapshot: MapSnapshot): readonly TicketNode[] =>
  snapshot.tickets.filter((t) => stateOf(t, snapshot) === "claimed");

export const blocked = (snapshot: MapSnapshot): readonly TicketNode[] =>
  snapshot.tickets.filter((t) => stateOf(t, snapshot) === "blocked");

/** The route actually walked. */
export const decisionsSoFar = (snapshot: MapSnapshot): readonly TicketNode[] =>
  snapshot.tickets.filter((t) => t.status === "closed");

export const progress = (snapshot: MapSnapshot) => ({
  closed: decisionsSoFar(snapshot).length,
  total: snapshot.tickets.length,
  fog: snapshot.fog.length,
});

export const ticketByShortId = (snapshot: MapSnapshot, shortId: string): TicketNode | undefined =>
  indexTickets(snapshot).get(shortId);

export const ticketById = (snapshot: MapSnapshot, id: string): TicketNode | undefined =>
  snapshot.tickets.find((t) => t.id === id);
