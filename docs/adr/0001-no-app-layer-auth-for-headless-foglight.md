# No application-layer auth for headless foglight

Headless foglight (`foglight serve`) has **no application-layer authentication**: it binds to `127.0.0.1` by default, and the network boundary it is bound to *is* the authorization boundary. On a tailnet — the intended remote deployment — Tailscale has already authenticated the device, so an in-app credential would largely re-authenticate an already-authenticated user.

This is a deliberate deviation from the obvious precedent. t3code, whose shape foglight otherwise follows closely, issues a one-time owner pairing token exchanged for a per-device session, with `t3 auth` to revoke. That ceremony is proportionate to what t3code serves: an agent, a shell, and write access to repositories — "anyone holding one gets your agent, your repos and your shell." foglight v1 is strictly read-only: it never writes to the tracker and executes nothing on behalf of a viewer. The worst case is **disclosure** of map contents, not compromise.

## Considered options

- **Pairing token + device sessions** (t3code's model) — rejected as machinery disproportionate to a read-only viewer, and largely redundant behind a tailnet.
- **Shared secret via `--token`/env var** — rejected for v1 as the cheap hedge we don't yet need, but it is the option to reach for first if the trade-off below shifts.
- **Bind-only** — chosen.

## Consequences

- Anyone who can reach the port can read the whole map: destination, open tickets, decisions, and what was ruled out of scope. On a private repo that is genuine business intelligence, and it is the accepted cost here.
- `--host 0.0.0.0` is permitted but prints a prominent warning naming exactly what is exposed. foglight does not refuse it; the operator owns the box.
- `tailscale serve` is one flag away from `tailscale funnel`, which would publish to the open internet with no credential in front. Documentation must say so plainly.

## Revisit when

foglight gains **any write capability** — claiming, closing, or editing tickets from the UI (today explicitly out of scope), or driving agent sessions. At that point the threat model becomes t3code's and this decision does not survive it.
