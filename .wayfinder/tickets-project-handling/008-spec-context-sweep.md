---
title: "Fold project handling into SPEC.md and CONTEXT.md"
labels: [wayfinder:task]
status: closed
assignee: michaelk
blocked-by: [6, 7]
---

## Question

With the code landed, sweep the documents back into truth: rewrite SPEC.md's "one repo per instance" architecture (§2), the CLI surface (§3), detection (§4) and picker (§8-ish) sections to describe the shipped project handling; reconcile CONTEXT.md's project/serve-session/daemon/attacher entries against what was actually built; note the reversal of the v1 map's "multi-repo serving" out-of-scope ruling.

## Resolution

Folded 2026-08-14. [`SPEC.md`](../../SPEC.md) now describes the shipped serve: one daemon per user per machine, resident attachers, live per-project detection, project-prefixed ids, SSE `projects`, and E's jump-pane picker. [`CONTEXT.md`](../../CONTEXT.md) reconciled against the code (grouping hides at one *project*; empty vs error; Electron does not share the daemon). The v1 map's **multi-repo serving** out-of-scope ruling is reversed in §1 — session-scoped, not a persistent registry.

**The map's destination is reached.** Cross-checkout GitHub map dedup stays in Not yet specified, deferred until it hurts.
