---
title: "Headless mode and Tailscale design"
labels: [wayfinder:grilling]
status: closed
assignee: michaelk
blocked-by: [1]
---

## Question

How does headless mode work on a VPS/VM? Pin down: what `npx foglight --headless` (flag name TBD) serves and to whom, what "Tailscale support" concretely means here (bind to tailnet interface, tsnet-style embedding, or just docs for serving over an existing tailnet — how does t3code do it?), the auth story for a browser hitting a remote foglight, and how headless and Electron modes share one codebase given the packaging facts from the Electron research.

## Resolution

### Mode selection and codebase sharing

- **`npx foglight serve`** runs headless; bare **`npx foglight`** launches the Electron GUI. A subcommand, not a `--headless` flag, and no environment auto-detection — headless is a mode, not a modifier, and a command that silently changes behaviour based on `DISPLAY`/SSH is a trap.
- **The GUI always runs the same HTTP server.** One `AppLayer` (from [Effect.js backend architecture facts](002-effect-backend-architecture.md)): `NodeRuntime.runMain(Layer.launch(AppLayer))` headless, `ManagedRuntime.make(AppLayer)` in the Electron main process. The renderer is an ordinary client loading `http://127.0.0.1:<port>`. This makes headless the *default* architecture and the desktop window merely a client of it, so the remote path cannot rot from disuse.
- **Headless serves the identical Vite bundle and API.** No trimmed "remote" UI: the cockpit from [Map graph UI prototype](005-map-graph-ui-prototype.md) is the product, and forking it doubles the v1 surface for no gain. Mobile ergonomics, if wanted, are responsive work on the one UI.
- **One repo per instance**, at cwd (optional path argument), exactly like the GUI. Multiplicity *within* a repo belongs to [Map picker and multi-map UX](008-map-picker-ux.md).

### Networking

- Default bind **`127.0.0.1`**. `--host` widens it. `0.0.0.0` is **allowed but prints a prominent startup banner** naming exactly what is exposed (map contents, read-only, no auth) and pointing at the Tailscale flags — refusing outright would be paternalistic for a viewer that executes nothing.
- **`serve` defaults to port 4747**, `--port` overrides, and a collision **fails loudly**. Chosen over auto-increment because a drifting port invalidates the URL just printed and any `tailscale serve` mapping aimed at it. 4747 avoids common dev ports (3000/5173/8080) and t3code's 3773.
- **The GUI takes an OS-ephemeral port and accepts no `--port` flag.** Its port is an internal detail; exposing it would invite treating the desktop app as a server, which is what `serve` is for.
- **foglight never terminates TLS.** Plain HTTP only; HTTPS is Tailscale's or a reverse proxy's job. No certificate management, renewal, or trust-store surface in a read-only viewer.

### Tailscale support

Thin shell-outs to the `tailscale` CLI. **tsnet-style embedding is not available** — tsnet is a Go library with no Node binding, so it would mean a sidecar binary or an FFI bridge.

- **`--tailscale`** resolves and binds the tailnet address via `tailscale ip -4`.
- **`--tailscale-serve`** (with **`--tailscale-serve-port`**) runs `tailscale serve` so Tailscale terminates HTTPS, yielding a MagicDNS `https://machine.tailnet.ts.net/` URL. This is the flag that earns its keep: it is the difference between an `IP:port` and a URL openable on a phone.
- Both fail with a clean message when Tailscale is absent or down.
- **The mapping is torn down on exit** (best-effort — `SIGKILL` and crashes cannot be caught), because `tailscale serve` config persists until explicitly turned off and a published HTTPS URL pointing at a dead port is a confusing footgun.

### Auth

**None at the application layer. Binding is the boundary.** On a tailnet, Tailscale has already authenticated the device, so a pairing token would mostly re-authenticate an authenticated user. This is the one conscious departure from t3code, whose one-time owner pairing tokens guard an agent, a shell, and write access to repos — foglight v1 writes nothing and executes nothing, so the worst case is disclosure of map contents. Recorded as [ADR 0001](../../docs/adr/0001-no-app-layer-auth-for-headless-foglight.md), including the trigger that forces a revisit.

### Startup output

`foglight serve` prints the reachable URL (the MagicDNS one under `--tailscale-serve`) plus a terminal QR code, since the phone browser is the main reason the tailnet path exists.

### t3code precedent (the ticket's open factual question)

`npx t3 serve` binds via `--host` (docs recommend `"$(tailscale ip -4)"` or `127.0.0.1` behind an SSH tunnel), offers `--tailscale-serve` / `--tailscale-serve-port` delegating HTTPS to Tailscale, shells out to the `tailscale` CLI rather than embedding it, defaults to port 3773, and prints a connection string, one-time owner pairing token, URL and QR code; `t3 auth` inspects and revokes sessions. Sources: [remote access docs](https://t3codedocs.com/docs/remote-access/), [repo docs](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md), [CLI reference](https://t3codedocs.com/docs/cli/).

### Consequences for the map

- [Live-update transport and cadence](007-live-update-transport.md) is unblocked and **narrower**: one HTTP transport serves both modes, so its "do desktop and headless share one path / is Electron IPC a second path" sub-question is settled *no* before it starts.
- Ruled out of scope: the remote-connect Electron GUI (`--connect <url>` against a remote server, as t3code offers) and multi-repo serving.
- The **CLI surface** fog patch narrows to the tracker-override flag alone; `serve`, `--port`, `--host`, the Tailscale flags and the repo path argument are settled here.
