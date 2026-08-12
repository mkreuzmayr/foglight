---
title: "Tracker adapter interface design"
labels: [wayfinder:grilling]
status: closed
assignee: michaelk
blocked-by: []
---

## Question

What is the read-only tracker adapter's interface? Pin down: the operations foglight needs (load map, list child tickets, blocking edges, claims, resolution content, change events for liveness), the normalized domain model both adapters map into (how local-markdown frontmatter and GitHub Issues labels/assignees/sub-issues each express map, ticket, type, claim, blocking), how adapters are discovered/configured per repo, and error surfaces (missing map, bad auth, malformed tickets). Grill with /grilling + /domain-modeling; record new terms in CONTEXT.md.

## Resolution

> **Partially reversed by [Map picker and multi-map UX](008-map-picker-ux.md).**
> Two decisions below no longer hold: adapters are **not** both live at once,
> and there **is** a precedence rule. Foglight resolves exactly one adapter per
> repo — `.wayfinder/` wins over a GitHub `origin`, `--tracker` forces it — so
> `listMaps()` reads one adapter rather than unioning, and `TrackerRegistry` is
> renamed the **detected tracker**. Everything else here stands, including
> lightweight `listMaps`, whole-map `loadMap`, bare change ticks, hybrid
> normalization, qualified ids, and the failure taxonomy.

Settled over four grilling rounds (16 decisions). Guiding principle throughout: **adapters report facts; the shared domain derives meaning.**

### Shape

- **`TrackerAdapter` is a plain record of Effect-returning functions, not a service.** Foglight needs N adapters discovered at runtime, and Effect `Layer`s are singleton-per-tag — so adapters are *values*. Only **`TrackerRegistry`** earns a service tag: it does discovery and holds the live adapters.
- **Discovery is automatic, with a `--tracker` override and no config file in v1.** `.wayfinder/` present → local-markdown; GitHub `origin` remote → GitHub adapter. Both can be live simultaneously (this repo is exactly that case), so there is no precedence rule — the picker unions across them.

### Operations

- `listMaps() → MapDescriptor[]` — lightweight (id, title, destination, open/closed counts) so the picker never triggers a full load. Results unioned across all detected adapters.
- `loadMap(id) → MapSnapshot` — whole-map read: map sections, **all** tickets (open and closed), all blocking edges. Maps are tens of tickets and local-markdown globs the directory regardless; a snapshot also makes liveness a trivial re-read-and-diff. Rejected lazy detail-on-click: a second round-trip precisely when the user is waiting.
- `changes() → Stream<ChangeSignal>` — bare invalidation ticks ("something moved"), at **adapter** level with map id as a filter, feeding both the open map and the picker. Only the tick is tracker-specific (local: debounced `FileSystem.watch`; GitHub: ETag-conditional polling); diffing is shared. One watcher/poller therefore serves list *and* map — a separate registry-level stream would poll the same endpoint twice.

### Normalization

- **Hybrid**: adapters extract only *metadata* (type, status, claim, blocking edges) — that's the sole genuine difference between trackers (frontmatter vs labels / assignees / sub-issues API / native issue-dependencies API). A **shared parser** handles map and ticket *bodies*, since both trackers use identical body conventions (the same wayfinder skill writes them). Raw markdown rides along on the model for rendering.
- **`frontier` and `unblocked` are derived once, in a shared domain module,** from status/assignee/blocked-by. Deliberately *not* from GitHub's native `issue_dependencies_summary.blocked_by`, convenient as it is: two adapters deriving the term independently would eventually disagree, and the whole point of "frontier" is that it doesn't.

### Identity

Qualified, human-readable ids — `github:owner/repo#42`, `local:.wayfinder/map.md`, `local:.wayfinder/map.md#fog/live-update-mechanics`. Stable by construction across reloads (so graph layout doesn't thrash on every tick) and deep-linkable in a URL, which matters once headless mode means people share links.

Fog and out-of-scope entries key on a **slug from their bolded lead term** — surviving both reordering and prose edits — with a content-hash fallback where a map doesn't follow that convention. This creates a convention worth stating in the spec: *fog entries should lead with a bold term.* Rejected warning on non-conforming entries: every wayfinder map written before this convention exists would light up.

### Failure

Degrade, don't fail — foglight is a diagnostic instrument for the map, so a broken ticket is exactly what you want to *see*.

- **Fatal (tagged errors the UI switches on):** `MapNotFound`, `MapUnparseable`, `TrackerUnauthenticated`, `TrackerUnreachable`.
- **Non-fatal:** `MalformedTicket` collected onto `snapshot.warnings[]`; the ticket renders as an `invalid` node carrying its parse error, and dangling edges drop with a warning.
- **Tickets are truth for existence and status; Decisions-so-far supplies only the gist.** Wayfinder itself says the map is an index, not a store. A drift between them is a warning and the node falls back to rendering its own resolution — which makes foglight a quiet lint on the maps it displays.

### GitHub specifics

- **Auth**: `GITHUB_TOKEN`/`GH_TOKEN` via Effect's `HttpClient` first, `gh` CLI shell-out as fallback, else a named `TrackerUnauthenticated` state the UI renders. Env-first because headless-on-a-VPS is an explicit destination requirement and is precisely where `gh` is least likely installed and logged in.
- **Scope**: the current clone's `origin` only. Reading arbitrary `owner/repo` invites the hosted-viewer shape that is explicitly out of scope; the override flag is a small addition later if ever wanted.

### Deferred elsewhere

Whether a **list view** exists alongside the graph was raised here and moved to [Map graph UI prototype](005-map-graph-ui-prototype.md) — the snapshot serves both views identically, so it is purely a UI decision best made against something concrete.
