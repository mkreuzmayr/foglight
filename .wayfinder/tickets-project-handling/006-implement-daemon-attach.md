---
title: "Implement daemon spawn and attach CLI"
labels: [wayfinder:task]
status: closed
assignee: michaelk
blocked-by: [1, 2, 5]
---

## Question

Land the new `foglight serve` in `packages/foglight` (and daemon entry where decided): detached daemon spawn, lock/state discovery, resident attachers registering their folder via the server's registration API, last-detach shutdown, the `foglight status` command, and the decided failure/flag behaviors — per [Daemon–attacher protocol and lifecycle](002-daemon-attacher-lifecycle.md) and the facts in `research/daemon-discovery.md`. Cross-platform: verified on Linux locally; Windows/macOS behavior implemented per the research findings with the platform-specific seams isolated and unit-tested.

## Resolution

Landed 2026-08-14 in `packages/foglight`. Hidden `foglight daemon` is the spawned entry; attachers are `foglight serve`. Electron is unchanged (n=1 in-process).

- **Discovery.** `O_EXCL` claim + IPC socket (UDS / Windows named pipe) in the platform runtime dir; `FOGLIGHT_RUNTIME_DIR` isolates a session. Handshake is the truth; a dead pid steals a stale claim.
- **Wire.** NDJSON hello / hello-reply / event / log-line / shutdown-request, schema-validated. Registration is the socket: hello names the path, close detaches. Second serve on a taken path errors. Status is the same hello with no path.
- **Lifecycle.** First serve spawns a detached daemon (raw `child_process`, stdio to the log file). Last attacher out is claim-file-first then tailscale teardown then exit. Crash and version-skew share the respawn+re-register loop; conflicting `--port`/`--host`/`--tailscale*` warn-and-proceed.
- **Verified.** Unit tests for layout (linux/mac/win), claim, protocol, and the attacher loop against a fake daemon. One Linux integration test drives two real `foglight serve` processes through `dist/cli.js`.

