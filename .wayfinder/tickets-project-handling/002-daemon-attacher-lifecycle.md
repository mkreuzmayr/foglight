---
title: "Daemon–attacher protocol and lifecycle"
labels: [wayfinder:grilling]
status: closed
assignee: michaelk
blocked-by: [1]
---

## Question

Decide the contract between the serve daemon and its attachers, informed by the discovery research:

- Which channel the attacher holds open (socket/pipe/HTTP) and what flows over it — registration, liveness, log/event stream back to the attacher's terminal?
- What a resident `foglight serve` actually displays: the session URL + QR once, a log tail, project events?
- Refcounting: two serves in the same folder — second is a no-op resident? What does detach mean then?
- Last-detach shutdown: immediate, or a grace period so `Ctrl-C && foglight serve` doesn't churn the daemon?
- Daemon crash while attachers live: do attachers notice and respawn, error out, or hold?
- Flag ownership: `--port`/`--host`/`--tailscale*` honored only by the daemon-spawning first serve; what exactly a later attacher with conflicting flags prints. Tailscale teardown when the daemon exits (see the fog note on tailscale ownership).
- Daemon logging/observability surface, if any (`foglight status`?) — graduate or discard the fog notes on observability and failure UX.

Constraint from [Multi-project domain and API rework](003-multi-project-domain.md): the attacher channel **must carry project registration** (add/remove, idempotent by canonical path) — the browser-facing HTTP API stays read-only, so this channel is the only registration surface. Attacher refcounting for a twice-attached folder is decided here, not there.

## Resolution

Grilled 2026-08-14. All facts weighed from `research/daemon-discovery.md`.

- **Channel: IPC-native.** Unix domain socket (Linux/macOS) / named pipe (Windows) via Node `net`'s `{ path }`; Effect's `NodeSocket`/`NodeSocketServer` pass it through. Owner-only filesystem permissions are the access control. Stale-UDS handling copies Turborepo's sequence: acquire `O_EXCL` claim → unlink stale socket → bind. The browser-facing HTTP port stays TCP and read-only.
- **Wire format: NDJSON**, one JSON object per line with a `type` field, schema-validated with `effect/Schema` at both ends. Streams (events, log lines) are native; the channel stays debuggable with `nc`/`socat`. Message set follows mechanically: hello / hello-reply / event / log-line / shutdown-request.
- **Registration is implicit in the channel.** The handshake names the attacher's canonical path (or no path, for `foglight status`); the daemon replies OK or rejects; the registration lives exactly as long as the socket — socket close is the unregister, covering even SIGKILL. No register/unregister messages exist.
- **Second serve on an already-registered path errors out**: "this path is already registered". No refcounting, no spectator mode — one attacher per project.
- **Resident display: minimal, `--verbose` for logs.** Session URL + QR once, then one line per lifecycle event (project joined/left, daemon exiting). `--verbose` streams the daemon's log over the channel, dev-server style.
- **Last-detach shutdown is immediate.** No grace period, no idle timer — session-scoped means session-scoped. Browser tabs recover via SSE auto-reconnect when a new session starts.
- **Exit is claim-file-first.** The daemon removes its claim file, then runs teardown (tailscale etc.), then exits. A connecting attacher therefore either wins the `O_EXCL` claim and spawns fresh or connects to a fully-live daemon — it can never join a dying one, which dissolves the `Ctrl-C && foglight serve` race with no cancelable-shutdown state machine.
- **Daemon crash while attachers live: respawn + re-register.** Attachers see the socket close, race on the `O_EXCL` claim (same code path as first-serve), the winner spawns a fresh daemon, and every survivor re-registers its own project — the session rebuilds itself from the attachers. Each prints one line, since the URL may change.
- **Version skew at handshake: graceful restart.** A mismatched attacher asks the daemon to shut down gracefully; the crash-recovery path then respawns at the new version and survivors re-register. Sessions self-heal to the newest binary; rare in practice because sessions are short-lived.
- **Flags: warn-and-proceed, daemon-owned.** A later attacher's conflicting `--port`/`--host`/`--tailscale*` prints one warning naming the daemon's actual value, then attaches. Flags transfer ownership to the daemon at spawn: it tears the tailscale mapping down at exit regardless of which attacher carried the flag. A respawned daemon re-asserts or clears the mapping, which also bounds leaks from crashes.
- **Observability: daemon log file + `foglight status`.** The detached spawn's stdio points at a log file in the platform state dir. `foglight status` is a one-shot client of the same handshake: prints daemon pid, session URL, and projects with their attachers ("no session" when the claim is absent). Lands with the attach CLI (ticket 006).

Fog resolved by this ticket: *daemon observability* (log file + status + `--verbose`), *failure UX* (stale locks via handshake validation, crash via respawn+re-register, exit race via claim-file-first), and *tailscale ownership* (daemon-owned, torn down at exit, re-asserted on respawn).
