---
title: "Live-update transport and cadence"
labels: [wayfinder:grilling]
status: closed
assignee: michaelk
blocked-by: [6]
---

## Question

The adapter side of liveness is settled ([Tracker adapter interface design](004-tracker-adapter-interface.md)): each adapter emits a `Stream<ChangeSignal>` of bare invalidation ticks, and foglight re-snapshots and diffs. What remains is everything downstream of that tick.

Narrowed by [Headless mode and Tailscale design](006-headless-tailscale-mode.md): the Electron GUI runs the same HTTP server as headless and its renderer is an ordinary HTTP client, so desktop and headless **do** share one path and Electron IPC is not a candidate transport. What is left is the choice *within* HTTP.

Pin down: the transport carrying changes to the browser (SSE — which the Effect research names as the low-friction pick — versus WebSocket); the GitHub polling cadence and whether it adapts (foreground map vs background picker, rate-limit headroom); the file-watch debounce window for local-markdown, given an agent session may rewrite several ticket files in quick succession; and how a diffed snapshot is applied to the graph without re-running layout on every tick or losing the user's viewport.

Grill with /grilling + /domain-modeling.

## Resolution

Settled over five grilling rounds (17 decisions). Guiding principle: **every
event is a complete truth** — no event is load-bearing, so a missed one costs
nothing and reconnect resync is not a special case.

### Transport

- **SSE, not WebSocket.** The feed is one-directional because the *product* is:
  v1 is read-only, so the client has nothing to send upstream. `EventSource`
  auto-reconnect comes free and proxies cleanly through `tailscale serve`.
  Manual `data: ...\n\n` framing is the only cost (`@effect/experimental/Sse`
  has an encoder). The day foglight writes to a tracker is the day this is
  revisited — and that is already out of scope.
- **One connection per tab, query-scoped**: `GET /api/events?map=<id>`, carrying
  typed `maps` (descriptor list) and `map` (snapshot) events. Two endpoints
  would mean two reconnect state machines and two liveness indicators for one
  underlying watcher. Decisive fallout: the subscriber set *is* the server's
  presence signal — how many clients are connected and which map is foregrounded
  both read straight off it, which is exactly what the adaptive poll cadence
  needs. Switching maps in the picker reopens the stream with a new `map` param.
- **Full snapshot on every event, never a delta**, carrying a monotonic
  `revision`. Same shape as the initial GET, so there is one decode path and one
  diff site (the client's `useSnapshotDiff`). Rejected server-computed diffs:
  two places computing diffs, and one missed event desyncs until a reload.
- **`: ping` comment frame every 20s, and `retry:` set explicitly.** Two bytes,
  never reaches the client's event handlers, and keeps both the proxy and the
  browser's connection tracking honest. Without it a silently dead `EventSource`
  is precisely the failure the liveness indicator cannot catch.

### The snapshot/body split

**The snapshot is pure structure; all prose is fetched separately.** This
refines [Tracker adapter interface design](004-tracker-adapter-interface.md):
raw markdown still rides on the adapter's model, it just no longer rides on the
wire.

- **On the snapshot** — everything needed to *draw* the map: ids, titles, type,
  status, claim, blocking edges, section membership, warnings, the destination
  line (the descriptor already carries it), and a **`bodyHash` per ticket**.
- **Fetched** — everything needed to *read*: the map body's decision gists, fog
  and out-of-scope prose, and each ticket's question and resolution. Two
  per-resource endpoints, gzipped: `GET /api/maps/:id/body` and
  `GET /api/maps/:id/tickets/:tid/body`. Rejected a bulk endpoint (any single
  edit re-downloads the lot) and a batch POST (POST-for-reads defeats HTTP
  caching).
- **`bodyHash` is the staleness rule, not a TTL.** Bodies cache under
  `(id, bodyHash)`; a resolution changes the hash on the next snapshot and
  invalidates by construction. Adapters already read full bodies to parse
  metadata, so the hash is free.
- **All bodies prefetched after first paint**, on a throttled, low-priority,
  cancellable background queue. Only *changed* hashes refetch thereafter, so the
  first paint pays and steady state is near-zero.
- A failed body fetch — or a ticket that vanished between snapshot and fetch —
  renders an inline error with retry inside the accordion; the card stays on the
  graph. Degrade, don't fail, as everywhere else.

### Client stack

- **Effect on the server; `effect-query` bridging to TanStack Query on the
  client**, for end-to-end type safety. **`HttpApi` for `/api/*`** (it is what
  the bridge derives client types from), **`HttpRouter` for static `dist/`
  serving and the SSE route** — a wildcard file route has no schema, and a
  perpetual stream is not a request/response shape `HttpApi` models.
  - *Flagged, accepted:* `effect-query` is a third-party single-repo project on
    the critical path, and Effect lands in the client bundle. Sharing `Schema`
    definitions with a plain fetch client gets most of the typing without the
    runtime — the fallback if the bridge goes unmaintained.
  - Effect ships no first-class client query story: `@effect-atom/atom-react`
    (Tim Smart, personal project) is the Effect-native alternative and was
    rejected as less mature than TanStack Query.
- **Subscribe first, then GET.** `streamedQuery` looks like the fit but is not —
  still experimental, a query stays `fetching` until the stream *ends*, and the
  docs address neither perpetual streams nor reconnection. So: open the
  `EventSource`, then fire the typed GET; pushed snapshots land via
  `setQueryData` with `staleTime: Infinity`; a GET response older than the
  newest pushed `revision` is discarded. The SSE feed stays a plain
  `EventSource` regardless — the bridge covers request/response only.

### Cadence

- **Local-markdown: 300ms trailing debounce** (`Stream.debounce`). An agent
  rewriting several files mid-resolution can produce a torn read; that shows as
  a malformed ticket and self-corrects ~300ms later. Rejected warning
  suppression — a timer whose only job is hiding a state that genuinely exists
  on disk, in a viewer whose pitch is that a map's defects are worth seeing.
- **GitHub: ETag-conditional, adaptive, three-state** — open map 30s,
  picker-only 5 min, **zero connected clients → paused**, with an immediate poll
  on first connect. Exponential backoff to a 5 min ceiling on errors, honours
  `Retry-After` on secondary limits. `304`s do not count against the 5000/hr
  budget. The pause rule is what makes a headless VPS left running for days
  cost nothing.
- **One snapshot per tick per map, `PubSub` fan-out, latest snapshot cached in
  memory.** Load scales with maps *watched*, not clients — the multi-device
  tailnet case is the one this exists for — and a new connection is served from
  cache, which is also what makes "immediate poll on first connect" cheap rather
  than a stampede.

### Applying a snapshot

- **Dagre re-runs only when structure changes.** Hash node ids + edge pairs; an
  identical hash patches node `data` in place and skips layout entirely, so a
  typo fix in a title cannot move a card. (Status changes count as structural
  where they change rank or section.)
- **The viewport never moves on its own.** Someone reading a ticket while an
  agent lands three resolutions does not get the canvas yanked; the rail — the
  always-on-screen "what do I pick up next" surface — is where off-screen change
  is announced.
- **Connection state is live / reconnecting / offline in the rail header.**
  Never a modal, never an overlay: the map stays fully interactive on the last
  snapshot, marked stale. Retry forever with capped backoff, plus a manual
  "retry now" in the offline state, so a flapping tailnet heals without a reload.
