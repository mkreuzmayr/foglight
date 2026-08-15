# Foglight v1 — Specification

Foglight is a **read-only viewer for wayfinder maps**: it renders a map as a
live-updating dependency graph beside an always-present rail, in wayfinder's own
vocabulary. It ships on npm as `foglight`; `npx foglight` opens a desktop
window, `npx foglight serve` runs the same thing headless for a browser on a
VPS or tailnet.

This spec is the destination of the wayfinder map at `.wayfinder/map.md`,
extended by `.wayfinder/project-handling.map.md`. It is written so a build
session needs no other input. Supporting depth, where it exists, is linked —
but every decision the build must honour is stated here.

**Normative companions:**

- [`CONTEXT.md`](CONTEXT.md) — the ubiquitous language. UI labels use these
  exact terms; code names should too.
- [ADR 0001](docs/adr/0001-no-app-layer-auth-for-headless-foglight.md) — no
  app-layer auth, and the trigger that forces a revisit.
- `prototype/map-graph-ui/` (branch `prototype/map-graph-ui`) — the settled
  cockpit (variant D), its README documenting every motion value, and the
  headless-Chromium probes kept as regression checks.
- `prototype/picker-projects/` — the settled project picker (E's jump pane,
  K's named rail switcher at G's air) and its Chromium probes.
- `research/` — verified facts behind the library choices (2026-08-06) and
  daemon discovery (2026-08-14, `research/daemon-discovery.md`).

## 1. Product boundaries

- **v1 is strictly read-only.** Foglight never writes to the tracker and
  executes nothing on behalf of a viewer. This assumption is load-bearing: it
  justifies the no-auth stance (§7), the one-directional SSE transport (§6),
  and the failure posture throughout.
- **Out of scope for v1** (ruled on the maps; none of these may creep in):
  write operations (claiming/closing/editing from the UI), driving agent
  sessions, hosted/SaaS deployment, trackers beyond local-markdown and GitHub
  Issues, a remote-connect Electron GUI (`--connect <url>`), the Electron GUI
  attaching to or sharing the serve daemon, a persistent project registry
  across sessions, and remote / multi-machine project registration.
- **Multi-repo serving is in scope, session-scoped.** The v1 map ruled it
  out (one repo per instance). That ruling is **reversed**: one serve daemon
  per user per machine hosts every attached project for the life of the
  serve session, and nothing about them persists past the last detach.
- **Degrade, don't fail.** Foglight is a diagnostic instrument for the map: a
  broken ticket is something to *see*, not hide. Malformed tickets render
  marked; dangling edges drop with a warning; drift between a map's
  Decisions-so-far and its tickets is a warning, with tickets as the truth.

## 2. Architecture: one server, two faces

There is exactly one architecture: an Effect HTTP server that serves the API,
the SSE feed, and the static client bundle. **Headless is the default shape;
the desktop window is merely a client of it.**

- A shared **`AppLayer`** composes everything. The **serve daemon** launches
  it with `ManagedRuntime.make(AppLayer)` and **no initial project** —
  attachers register folders over the attacher channel. The Electron main
  process launches the *same layer* with `ManagedRuntime.make(AppLayer)` and
  an `initialProject`, disposed on quit. Single-project is the n=1 case of
  the same server, not a second path.
- The Electron renderer is an ordinary HTTP client loading
  `http://127.0.0.1:<port>` — no IPC transport, no preload API surface. The
  GUI's server takes an **OS-ephemeral port** and accepts no `--port` flag.
  **The GUI does not attach to or share the serve daemon**; it keeps a
  private in-process instance.
- Headless serves the **identical Vite bundle and API**. There is no trimmed
  "remote" UI and exactly one client build.
- **One serve daemon per user per machine**, discovered via an `O_EXCL`
  claim file in the platform runtime dir — not via the HTTP port. The first
  `foglight serve` claims and spawns a detached daemon; every further serve
  attaches as a resident process and registers its folder as a project.
  Projects live only for the serve session: the daemon exits when the last
  attacher detaches, and a fresh session starts empty.

**Caveats the build must expect** (from `research/effect-backend.md`, effect
3.22.1 / @effect/platform 0.97.1): all `@effect/platform` HTTP/Socket modules
are officially **"unstable"**, and Effect 4 (in beta) folds platform into core
with new module paths — pin versions and expect migration churn. There is no
official Effect–Electron integration; the wiring above is by hand and
unproblematic.

## 3. Repo layout and toolchain

A **pnpm monorepo publishing exactly one package**. Root `package.json` is
`private: true`; pnpm is pinned via `packageManager` (its strict
`node_modules` is what enforces the package boundaries).

| Package             | Contents                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`     | The domain: wayfinder vocabulary types, snapshot schema, project identity (`idFor`, `qualify`), the `frontier`/`unblocked` derivation, body parser, and both tracker adapters. |
| `packages/server`   | Effect HTTP server, project session, SSE, file watching, GitHub polling.                                                                                                       |
| `packages/client`   | The Vite/React cockpit. Depends on `core` for **types only**.                                                                                                                   |
| `packages/electron` | Electron main process: window spawning, lifecycle. n=1 in-process; does not speak to the serve daemon.                                                                         |
| `packages/foglight` | The only published package: the `bin`, argv dispatch, daemon spawn/attach, assembled build.                                                                                    |

**Toolchain:** Turborepo for tasks; **tsdown** (Rolldown) for the Node bundle;
Vite for the client; Vitest + oxlint + oxfmt for test and lint. Vite+ was
considered and rejected (pre-1.0 at decision time) — the toolchain must be the
least interesting part of this spec. **Node engine floor: 24**, declared in
`engines` without `engine-strict`.

## 4. CLI surface

One bin, `foglight`, dispatching on `argv[2]`:

- **`foglight [path]`** — launch the Electron GUI on the repo at `path`
  (default cwd). Ephemeral port, no port flag. Private in-process server;
  does not attach to the serve daemon.
- **`foglight serve [path]`** — headless. A subcommand, not a `--headless`
  flag, and **no environment auto-detection** (no `DISPLAY`/SSH sniffing).
  Every serve is a **resident attacher**: it stays until Ctrl-C, and its
  lifetime *is* its project's registration. The daemon is nobody's
  foreground process.
  - The **first** serve `O_EXCL`-claims the runtime dir and spawns a
    **detached daemon** (hidden `foglight daemon`, not a user-facing
    command) over a Unix-domain socket (Linux/macOS) or named pipe
    (Windows). The daemon hosts `AppLayer`.
  - **Further** serves attach to that daemon and register their folder as a
    project. A second serve on an already-registered path errors out
    ("this path is already registered") — no refcounting, no spectator
    mode.
  - Discovery is via the claim file and IPC socket in the **platform
    runtime dir**, regardless of port: Linux `$XDG_RUNTIME_DIR/foglight`,
    macOS `~/Library/Application Support/foglight` (socket under
    `$TMPDIR`), Windows `%LOCALAPPDATA%\foglight`. `FOGLIGHT_RUNTIME_DIR`
    isolates a session. Handshake is the truth; a dead pid steals a stale
    claim.
  - Last attacher out is **claim-file-first**, then Tailscale teardown,
    then exit. No grace period. A connecting attacher either wins the claim
    and spawns fresh or connects to a fully-live daemon — it can never join
    a dying one. Browser tabs recover via SSE auto-reconnect when a new
    session starts.
  - Daemon crash and version-skew at handshake share the same recovery:
    attachers see the socket close, race the claim, the winner respawns,
    and every survivor re-registers. Sessions self-heal to the newest
    binary.
  - `--port` — default **4747**; a collision on the daemon's bind **fails
    loudly** (no auto-increment: a drifting port invalidates the printed
    URL and any `tailscale serve` mapping aimed at it). A later attacher
    whose `--port`/`--host`/`--tailscale*` disagree with the daemon
    **warns and proceeds** — flags transfer ownership to the daemon at
    spawn.
  - `--host` — default `127.0.0.1`. `0.0.0.0` is allowed but prints a
    prominent startup banner naming exactly what is exposed (map contents,
    read-only, no auth) and pointing at the Tailscale flags.
  - `--tailscale` — resolve and bind the tailnet address via
    `tailscale ip -4`.
  - `--tailscale-serve` (with `--tailscale-serve-port`) — run
    `tailscale serve` so Tailscale terminates HTTPS, yielding a MagicDNS
    `https://machine.tailnet.ts.net/` URL. Torn down on daemon exit,
    best-effort — daemon-owned regardless of which attacher carried the
    flag. Both Tailscale flags fail with a clean message when the
    `tailscale` CLI is absent or down. (tsnet embedding is Go-only;
    shell-outs are the design, not a shortcut.)
  - `--verbose` — stream the daemon log over the attacher channel,
    dev-server style. Without it, the attacher prints the session URL + QR
    once, then one line per lifecycle event (project joined/left, daemon
    exiting).
- **`foglight status`** — a one-shot of the same handshake with no path:
  prints daemon pid, session URL, and projects, or `no session` when the
  claim is absent.
- **`--tracker local|github`** (GUI and serve) — force the tracker choice
  for that project (§5).

The wire is **NDJSON** over the IPC socket, one JSON object per line with a
`type` field, schema-validated with `effect/Schema` at both ends: hello /
hello-reply / event / log-line / shutdown-request. Registration is implicit
in the channel — the handshake names the canonical path (or no path, for
status); socket close unregisters, covering even SIGKILL. Owner-only
filesystem permissions are the access control. Effect's `Command` cannot
detach: the one spawn call is raw `child_process.spawn`. Detached spawn
survives terminal close, not logout — which fits session-scoped
persistence. The detached spawn's stdio points at a log file in the runtime
dir (`daemon.log`).

`foglight serve` prints the reachable URL — the MagicDNS one under
`--tailscale-serve` — **plus a terminal QR code** (the phone browser is the
main reason the tailnet path exists).

**Foglight never terminates TLS.** Plain HTTP only; HTTPS is Tailscale's or a
reverse proxy's job.

Documentation must state plainly that `tailscale serve` is one flag away from
`tailscale funnel`, which would publish the map to the open internet with no
credential in front (ADR 0001).

**Reference project: t3code.** Foglight's headless and Tailscale surface
deliberately mirrors `npx t3 serve` — `--host` binding (docs recommend
`"$(tailscale ip -4)"` or `127.0.0.1` behind an SSH tunnel),
`--tailscale-serve`/`--tailscale-serve-port` delegating HTTPS to Tailscale,
shell-outs to the `tailscale` CLI rather than embedding, and a printed URL +
QR code on startup. When something here is ambiguous, consult t3code's
[remote access docs](https://t3codedocs.com/docs/remote-access/),
[repo docs](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md),
and [CLI reference](https://t3codedocs.com/docs/cli/). The one deliberate
departure is auth (§7, ADR 0001): t3code's pairing tokens guard an agent, a
shell, and write access; foglight is read-only and uses none.

## 5. Tracker adapters

Guiding principle: **adapters report facts; the shared domain derives
meaning.**

### Detection — one project, one tracker

Foglight resolves **exactly one adapter per project**:

1. `.wayfinder/` present → **local-markdown**;
2. else a GitHub `origin` remote → **GitHub Issues**;
3. `--tracker local|github` forces the choice.

Local wins because `.wayfinder/` is a deliberate artifact, works offline, and
nearly every repo has a GitHub remote that would otherwise hijack detection.
**Within a project**, adapters are never live side by side and nothing ever
unions across them. **Across projects**, each adapter runs independently —
two attached folders can be local-markdown and GitHub at once. (An earlier
design had both adapters live *in one repo* with the picker unioning; it was
**reversed** — do not resurrect `TrackerRegistry`-as-collection. The service
is the **detected tracker**, per project.)

Detection is **live**. A folder with no detectable tracker **registers
anyway** as an empty project (`state: no-tracker`) with a warning; the
attacher stays resident. Detection re-runs as part of the project's read
loop, so a `.wayfinder/` created later brings the project alive via a
`projects` event; a tracker that disappears demotes it back. A forced
`--tracker` that cannot resolve still attaches, `state: error`. Degrade,
don't fail, both ways.

No config file in v1. The GitHub adapter reads the current clone's `origin`
only — no arbitrary `owner/repo` flag. The daemon starts with **no
project**; Electron (and any n=1 client) passes `initialProject`.

### Shape and operations

`TrackerAdapter` is a **plain record of Effect-returning functions, not a
service** (adapters are values; Effect Layers are singleton-per-tag).
Detection returns one adapter per project; the session holds them. Three
operations:

- **`listMaps() → MapDescriptor[]`** — lightweight: id, title, destination,
  open/closed counts, last-changed timestamp. Deliberately **no frontier
  count** (it would force reading every ticket's dependencies, undoing the
  lightweight contract). Never triggers a full load. Adapters stay
  project-blind; the session stamps a project reference (id + name) on each
  descriptor. HTTP `GET /api/maps` is one flat aggregated list the picker
  groups client-side. A failing project contributes zero descriptors plus a
  warning — the list never fails whole. `GET /api/projects` lists
  `{ id, name, path, state, trackerKind? }`.
- **`loadMap(id) → MapSnapshot`** — whole-map read: map sections, **all**
  tickets open and closed, all blocking edges, warnings. No lazy
  detail-on-click.
- **`changes() → Stream<ChangeSignal>`** — bare invalidation ticks
  ("something moved"), no payload. Adapter-level with map id as filter, so one
  watcher/poller serves both the open map and the picker. Only the tick is
  tracker-specific; diffing is shared.

### Normalization — hybrid

Adapters extract only **metadata** (type, status, claim, blocking edges) —
frontmatter for local-markdown; labels / assignees / sub-issues / native issue
dependencies for GitHub. A **shared parser** in `core` handles map and ticket
**bodies**, since both trackers use identical body conventions (the same
wayfinder skill writes them). Raw markdown rides along on the model.

**`frontier` and `unblocked` are derived once, in `core`,** from
status/assignee/blocked-by — never from GitHub's native
`issue_dependencies_summary.blocked_by`, so the term cannot mean two things.

### Identity

A project's id is a slug of the folder basename plus a short hash of the
canonical path (`foglight-3f2a`) — readable, unique, and stable across
sessions so remembered maps and bookmarked URLs survive re-attach. Display
name is the plain basename, disambiguated in the UI only on collision. The
absolute path rides on the project toward the browser — the same audience
already sees full map contents, and it is the honest disambiguator.

Every `ResourceId` on the wire is **uniformly project-prefixed**:
`<project-id>:<existing-id>`, e.g. `foglight-3f2a:local:.wayfinder/map.md`,
`foglight-3f2a:github:owner/repo#42`. The first segment before the first
`:` is always the project. Adapters stay project-blind: the session
qualifies on the way out and strips on the way in. A resource means "this
map *as seen through* this project": two checkouts of one GitHub repo are
two resources. Aliasing identical GitHub maps across checkouts is deferred
until it hurts.

Qualified, human-readable ids remain stable by construction across reloads
(layout must not thrash on ticks) and deep-linkable.

Fog and out-of-scope entries key on a **slug from their bolded lead term**,
with a content-hash fallback for non-conforming entries. **Convention this
spec states for map authors: fog entries should lead with a bold term.** Do
not warn on non-conforming entries.

### Failure taxonomy

- **Fatal, tagged errors the UI switches on:** `MapNotFound`,
  `MapUnparseable`, `TrackerUnauthenticated`, `TrackerUnreachable`.
- **Non-fatal:** `MalformedTicket` collected onto `snapshot.warnings[]`; the
  ticket renders as an `invalid` node carrying its parse error; dangling edges
  drop with a warning.
- **Tickets are truth for existence and status; Decisions-so-far supplies only
  the gist.** Drift is a warning and the node falls back to its own
  resolution.

### GitHub auth

`GITHUB_TOKEN`/`GH_TOKEN` via Effect's `HttpClient` **first**, `gh` CLI
shell-out as fallback, else a named `TrackerUnauthenticated` state the UI
renders. Env-first because headless-on-a-VPS is exactly where `gh` is least
likely installed and logged in.

## 6. Live updates: snapshot, bodies, transport

Guiding principle: **every event is a complete truth** — no event is
load-bearing, a missed one costs nothing, reconnect resync is not a special
case.

### The snapshot/body split

- **`MapSnapshot` is pure structure** — everything needed to *draw*: ids,
  titles, type, status, claim, blocking edges, section membership, warnings,
  the destination line, and a **`bodyHash` per ticket**.
- **Bodies are everything needed to _read_** — the map body's decision gists,
  fog and out-of-scope prose, each ticket's question and resolution. Two
  gzipped per-resource endpoints: `GET /api/maps/:id/body` and
  `GET /api/maps/:id/tickets/:tid/body`. No bulk endpoint, no batch POST.
- **`bodyHash` is the staleness rule, not a TTL.** Bodies cache under
  `(id, bodyHash)`; adapters already read full bodies to parse metadata, so
  the hash is free.
- **All bodies prefetch after first paint** on a throttled, low-priority,
  cancellable background queue; only changed hashes refetch thereafter.
- A failed body fetch (or a ticket gone between snapshot and fetch) renders an
  inline error with retry inside the accordion; the card stays on the graph.

### Transport — SSE

- **SSE, not WebSocket** (the product is one-directional; `EventSource`
  auto-reconnect is free and proxies cleanly through `tailscale serve`).
  `@effect/experimental/Sse` has the encoder.
- **One connection per tab, query-scoped:** `GET /api/events?map=<id>`
  (or `/api/events` with no map, for the empty/picker state), carrying typed
  `maps` (descriptor list), `projects` (complete project list), and `map`
  (snapshot) events. The `projects` event fires on connect and again on
  attach, detach, and live promotion — same "every event is a complete
  truth" rule. The subscriber set **is** the server's presence signal —
  client count and foregrounded map read straight off it, feeding the poll
  cadence. Switching maps reopens the stream with a new `map` param.
- **Full snapshot on every event, never a delta**, with a monotonic
  `revision`. Same shape as the initial GET: one decode path, one diff site
  (the client's `useSnapshotDiff`).
- **`: ping` comment frame every 20s; `retry:` set explicitly.**

### Server stack

Effect end-to-end: **`HttpApi` for `/api/*`** (the bridge derives client types
from it), **`HttpRouter` for static `dist/` serving and the SSE route** (a
wildcard file route has no schema; a perpetual stream is not a
request/response shape). Static files via `HttpServerResponse.file` behind a
~20-line wildcard route. File watching via `FileSystem.watch`; GitHub polling
via `HttpClient` + `Schedule`; fan-out via `PubSub`.

### Client stack

**TanStack Query via the `effect-query` bridge.** Subscribe first, then GET:
open the `EventSource`, then fire the typed GET; pushed snapshots land via
`setQueryData` with `staleTime: Infinity`; a GET response older than the
newest pushed `revision` is discarded. The SSE feed stays a plain
`EventSource` (the bridge covers request/response only). Do **not** use
`streamedQuery` (experimental; a query stays `fetching` until the stream
ends).

*Flagged, accepted risk:* `effect-query` is a third-party single-repo project
on the critical path, and Effect lands in the client bundle. Fallback if it
goes unmaintained: share the `Schema` definitions with a plain fetch client.

### Cadence

- **Local-markdown: 300ms trailing debounce** (`Stream.debounce`). A torn read
  mid-rewrite shows as a malformed ticket and self-corrects on the next tick —
  do not suppress the warning.
- **GitHub: ETag-conditional, adaptive, per project** — a project whose map
  is on screen is **active** (30s); other connected projects are **idle**
  (5 min); **zero connected clients → paused**, immediate poll on first
  connect. Exponential backoff to a 5-min ceiling on errors; honour
  `Retry-After`. (`304`s don't count against the 5000/hr budget; the pause
  rule is what makes a VPS left running for days cost nothing.)
- **One snapshot per tick per map, `PubSub` fan-out, latest snapshot cached in
  memory.** Load scales with maps watched, not clients; new connections are
  served from cache.

## 7. Headless, networking, auth

Covered structurally in §2 and §4; the policy decisions:

- **No application-layer auth. Binding is the boundary** (ADR 0001). On a
  tailnet, Tailscale has already authenticated the device. Justified solely by
  v1 being read-only; the ADR names the revisit trigger — **any** write
  capability — and the first hedge to reach for (`--token` shared secret).
- Default bind `127.0.0.1`; widening is explicit and bannered.
- Anyone who can reach the port can read every attached project's maps. On a
  private repo that is genuine business intelligence; it is the accepted cost.

## 8. The client: cockpit UI

The settled view is the **cockpit**: a permanent rail beside a left-to-right
React Flow graph, selection shared both ways. Built with Vite + React +
Tailwind/shadcn in the t3code-like aesthetic; the reference implementation is
variant D on branch `prototype/map-graph-ui` (Geist Sans/Mono, Phosphor icons,
one accent, translucent rail — its README carries every motion value).

### The two halves

- **The graph answers "what is the shape of this effort".** Left to right:
  decisions behind, frontier at the working edge, fog beyond it, the
  **destination anchored at the right** as a node the route arrives at.
- **The rail answers "what do I pick up next" — and is not a secondary mode.**
  Always on screen, ordered by the map's own sections (frontier, claimed,
  blocked, decisions so far, not yet specified, out of scope). It owns what
  the graph structurally cannot show: **out-of-scope entries** (no position on
  a dependency graph) and **parse warnings**. No view toggle: both, always.

### Rendering and layout

- **React Flow (`@xyflow/react`)**, custom nodes as plain DOM so
  Tailwind/shadcn apply directly; `<ViewportPortal />` renders the fog veil in
  graph coordinates.
- **Layout engine: dagre (`@dagrejs/dagre`)**, not elkjs. Measured on the
  change signal, existing nodes travel 2–47px — the animated relayout absorbs
  it, so elkjs's position-preserving mode isn't worth its ~460 kB. This is the
  seam to revisit if maps get much larger.
- **Dagre re-runs only on structural change.** Hash node ids + edge pairs; an
  identical hash patches node `data` in place and skips layout, so a typo fix
  cannot move a card. Status changes count as structural where they change
  rank or section.
- **The viewport never moves on its own.** Off-screen change is announced in
  the rail, never by yanking the canvas.

### Visual language

- **State is colour + a 2px spine + a word** on each card — never a badge
  competing with the title. **Type is an icon plus a word, never colour**:
  colour belongs to state alone.
- **Ticket detail is an accordion inside the rail row** — never a sheet or
  modal; the graph is never occluded by the thing you clicked on it.
- **Malformed tickets render as a marked card** plus a rail warning.
- **Dark only** in v1.
- **Connection state (live / reconnecting / offline) lives in the rail
  header** — never a modal or overlay. The map stays fully interactive on the
  last snapshot, marked stale; retry forever with capped backoff plus a manual
  "retry now".

### Motion

**Motion is bridging, never decoration.** The eight moments and their exact
values are in the prototype README; the load-bearing rules:

- **A change signal must never redraw the map.** Nodes glide to new ranks
  (~320ms, positions interpolated in JS — React Flow derives edge paths from
  `node.position`, so CSS transforms would detach the lines); arriving edges
  draw themselves; departures ghost for one exit window.
- **Graduation is continuity:** a fog patch that becomes a ticket enters _at
  the patch's position_ and travels to its rank — never a fade-out/fade-in
  pair.
- **The fog veil is the only perpetual animation.**
- **Map switching cross-fades, never glides** (§9): a different map is a
  different subject, not a change.
- `prefers-reduced-motion` drops travel, keeps opacity.

### React Flow traps — do not rediscover these

Each cost real debugging time in the prototype; `probe*.ts` on the prototype
branch are the regression checks.

1. **Controlled mode replays every animation on any change.** A rebuilt nodes
   array forces re-measure; `EdgeWrapper` returns `null` while measuring, and
   every custom edge remounts. **Run React Flow uncontrolled**
   (`defaultNodes`/`defaultEdges` seed once) and apply snapshots as a **diff
   against its store** (`useSnapshotDiff`): update in place, append arrivals,
   flip departures to exiting ghosts, glide positions via `setNodes` on the
   store's own objects. Unchanged items keep object identity.
2. **`getTotalLength()`-based line drawing goes stale** the moment geometry
   moves. Use **`pathLength={1}`** so the draw is measurement-free.
3. **`rf.setNodes()` is not readable back via `rf.getNodes()` in the same
   tick.**
4. **Enter and exit need separate `@keyframes` names** — the spec only
   restarts an animation when its name changes, so a shared reversed keyframe
   swallows the exit.
5. **Verification needs a real browser.** jsdom cannot see SVG geometry,
   WAAPI, or layout, and React Flow renders no edges without measurement —
   keep headless-Chromium probes in the test suite.

## 9. Map picker and addressing

### URLs

**`/?map=<urlencoded id>&ticket=<urlencoded id>`** — query params, not path
routes (map ids contain `#`, `/`, and `:`), matching `GET /api/events?map=<id>`
exactly. **No `?project=` param**: ids are project-qualified, so one opaque
string still suffices and there are no expressible-but-invalid param pairs.
**No router library**: two search params read into state, no server
catch-all beside the static route. The `ticket` param selects a rail
accordion — links get pasted, especially from headless. An explicit `?map`
**always beats the remembered map**.

### The picker

- A **jump-pane dialog** (not a rail-header popover), opened by **`Cmd+K`**
  (not `Cmd+P` — it fights browser print, and headless-in-a-browser is the
  common case) or by clicking the rail's **named title switcher**. The
  switcher shows the project name above the map title, with a caret; the
  brand row still names the tracker. Header padding is the prototype's
  "comfortable air".
- **All-maps default.** A left project pane (dot, name, count) scopes a
  right-hand flat list; unscoped rows carry the project as trailing
  metadata. Typing searches **globally** (title, destination, project name)
  and collapses the panes into one result list — scope only shapes
  browsing. ←→ cycles scope while the query is empty. At one project the
  pane disappears.
- **Always-visible substring filter**, focused on open.
- Rows show title, truncated destination, decided/total. **No tracker
  badge** on rows (the tracker is uniform per project; shown once in the
  rail header) and **no frontier count** (§5). Colliding project basenames
  carry `path`.
- **Ordered most-recently-changed first** (file mtime / GitHub
  `updated_at`), ties alphabetical.
- Degraded projects (`no-tracker`, `error`) stay in the pane and explain
  themselves on the right when selected — they are not footer notes and they
  do not drop out.
- Liveness comes from the existing SSE connection's `maps` and `projects`
  events — no second subscription.

### Opening and switching

- **The last map is remembered in the browser** as its project-qualified
  id, with enough display copy (title, project name) to name it while
  detached.
- An explicit `?map` **always beats the remembered map**.
- If the remembered map's project is not attached, **keep the id** and wait
  — never silently open a different project's map, even if only one other
  map remains. The map reopens itself on re-attach.
- **Cold start** (no `?map`, nothing remembered): exactly one reachable map
  → open it (picker skipped, grouping hidden); more than one → the picker
  over an empty cockpit; zero → an empty state explaining where a map
  should live.
- **Detach of the open map** cross-fades to the empty state, auto-opens the
  picker, and names what is being remembered.
- **Switching is a full replace:** clear `?ticket`, refit the viewport,
  rebuild the rail, **cross-fade**.

## 10. Accessibility baseline

From the prototype, carried as requirements: sections are real
`aria-expanded` disclosures; rows carry `aria-current`; focus-visible rings
are global; rows respond on `pointerdown`, untransitioned;
`prefers-reduced-transparency` and `prefers-contrast: more` make the rail
solid; `hover:` styles gated behind `@media (hover: hover)`.

## 11. Packaging and release

### The published artifact

- **One `bin`, `foglight`** (matching the package name), dispatching per §4.
- **`electron` is a plain `dependency`.** Since Electron 42 the install is
  ~1 MB; the 120–145 MB binary fetches lazily on first GUI launch (cached per
  version). No `optionalDependencies` — that adds a "GUI silently unavailable"
  failure class for zero size win.
- **tsdown bundles `core`, `server`, the electron main process, and the npm
  runtime deps (`effect`, `@effect/platform`) in; `electron` stays external**
  — it is resolved for its **binary path**, not its code (the bin runs under
  plain Node; `require('electron')` from Node returns the executable path,
  which the script spawns with the app dir; runtime detection inside the app:
  `process.versions.electron`). Bundling erases every `workspace:*` dep, so
  the published package resolves none.
- **`files: ["dist"]`**; inside: `dist/cli.js` (the bin),
  `dist/electron/main.js`, `dist/client/` (the one Vite bundle, served as
  static assets by the same server in both modes). No `src`, no sourcemaps,
  **no `exports` field** — this is a CLI, not an import target.

### Facts the build must carry

- **The tarball is the entire download for headless users**: a VPS
  `npx foglight serve` pulls the tarball plus the ~1 MB electron shim and
  never touches the Electron binary. (Also keeps the Linux CI publish job
  fast.)
- **First GUI launch on an offline or GitHub-unreachable machine fails at
  launch, not at install.** That error message **must name `ELECTRON_MIRROR`
  and point at `foglight serve`** as the working alternative.
- Channel caveats for docs: no signed/Gatekeeper app via this channel; the
  Electron zip costs 2–3× its download size on disk.

### Release process

- **Semver via Changesets, starting at `0.x`** (the first real build will find
  what this spec got wrong; `0.x` buys room to fix it without a major per
  correction). Release PR accumulates changesets and generates
  `CHANGELOG.md`.
- **On a `v*` tag:** CI runs the full build and tests, then
  `npm publish --provenance` over **OIDC trusted publishing** — no long-lived
  `NPM_TOKEN`.
- **A smoke job `npx`s the resulting tarball and hits `foglight serve`** — a
  broken bin or mis-declared `files` is invisible to unit tests and visible to
  every user.

The npm name `foglight` was unclaimed as of 2026-08-06. The release itself
happens after the build, outside this spec's effort.
