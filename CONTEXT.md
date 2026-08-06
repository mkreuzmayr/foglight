# Foglight — ubiquitous language

Foglight renders wayfinder maps; it adopts wayfinder's vocabulary verbatim and adds only what the viewer itself needs. UI labels use these exact terms.

## Glossary

- **Map** — a single wayfinder effort: a destination plus the tickets charting the way to it. Lives on a repo's tracker; the unit foglight displays, one at a time.
- **Destination** — what reaching the end of a map looks like. Anchors the map view.
- **Ticket** — a child issue of the map; a question whose resolution is a decision. Typed as research, prototype, grilling, or task.
- **Blocking** — a dependency edge between tickets: a ticket is unblocked only when every ticket blocking it is closed. The edges of foglight's graph.
- **Frontier** — the open, unblocked, unclaimed tickets: the edge of the known, what's takeable now.
- **Claim** — the assignee on an open ticket; marks a session working it. Unassigned = unclaimed.
- **Decisions so far** — the closed tickets: the route actually walked, each holding its resolution.
- **Fog (of war)** — in-scope questions not yet sharp enough to be tickets (the map's "Not yet specified"). Rendered at the edge of the graph, beyond the frontier.
- **Out of scope** — work consciously ruled beyond the destination. Never graduates into tickets.
- **Tracker adapter** — foglight's read-only interface to wherever a map physically lives (local-markdown files, GitHub Issues). Normalizes tracker specifics into the terms above.
- **Headless mode** — foglight running as a plain server (no Electron window) on a remote machine, UI reached via browser, typically over a tailnet.
- **Viewer** — what foglight v1 is: it reads and renders maps, never writes to the tracker.
