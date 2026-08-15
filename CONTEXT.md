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
- **Detected tracker** — the single tracker adapter foglight resolved for a project, by auto-detection or by explicit override. One project has one tracker; each project's adapter runs independently of the others'. Detection is live: it re-runs as the project is read, so a tracker can appear or disappear over a project's life.
- **Map picker** — how a person reaches a different map: Cmd+K (or the rail's title switcher), listing every attached project's maps. At one project the grouping disappears; a session with exactly one reachable map opens it.
- **Remembered map** — the last map a person had open, stored as its project-qualified id. Kept when its project detaches so it can reopen on re-attach; never replaced by a different project's map.
- **Map descriptor** — a map at its lowest resolution: enough to list and choose it (name, destination, how much is done) without loading it.
- **Map snapshot** — a whole map as read at one instant: its sections, every ticket open and closed, and every blocking edge. Structure only — enough to *draw* the map; the prose is its bodies, read separately.
- **Body** — the prose of a map or a ticket: a map's decision gists, fog and out-of-scope text; a ticket's question and resolution. What you *read*, as against the snapshot's structure, which is what gets drawn. Fetched on its own, so a snapshot can move without a body moving and vice versa.
- **Change signal** — a tracker's notification that something in it moved. It carries no detail; foglight responds by taking a fresh snapshot.
- **Malformed ticket** — a ticket foglight could not fully understand. It still appears on the graph, marked, rather than being hidden — a map's defects are part of what the viewer is for.
- **Rail** — the always-present list beside the graph, ordered by the map's sections. Not a secondary "list view": it is the half of the cockpit that answers "what do I pick up next", and the only place out-of-scope entries and parse warnings can appear, since neither has a position on a dependency graph.
- **Graduation** — wayfinder's own verb, and a visual rule in foglight: when fog becomes a ticket, the fog node *becomes* the ticket card in place and moves to its new rank. A graduated ticket is continuous with the patch it came from, never a departure plus an arrival.
- **Project** — a folder registered with the running serve session. Each project resolves its own detected tracker and contributes its maps to the map picker, grouped under the folder's basename.
- **Empty project** — a project whose folder has no detected tracker. It registers and stays on the session, marked with a warning, and becomes an ordinary project the moment detection lands — or demotes back if the tracker disappears. A forced tracker that cannot resolve is not empty: it stays registered in error.
- **Serve session** — the span during which foglight is being served headless: it begins with the first `foglight serve` and ends when the last one detaches. Projects are registered only for the life of the session; nothing about them persists past it.
- **Serve daemon** — the background process that hosts the server for a serve session. Spawned by the first `foglight serve`; gone when the session ends. There is at most one per user per machine. The desktop window does not share it — it keeps a private instance.
- **Attacher** — a resident `foglight serve` process. Every serve, including the first, is an attacher; its lifetime *is* its project's registration, so Ctrl-C detaches the project. One attacher per project: a second serve on an already-registered path is refused.
- **Attacher channel** — the connection an attacher holds open to the serve daemon. Registration is implicit in it: opening the channel registers the project, and the channel closing — however the attacher dies — unregisters it. The only surface through which projects are registered.
- **Headless mode** — foglight running without a desktop window, its viewer reached by browser instead; the usual case is a remote machine on a tailnet. Not a separate architecture: the desktop app is a client of the same server, so headless is the ordinary case and the window is the addition.
- **Viewer** — what foglight v1 is: it reads and renders maps, never writes to the tracker.
