---
title: "Project-grouped map picker"
labels: [wayfinder:prototype]
status: closed
assignee: michaelk
blocked-by: [3]
---

## Question

Prototype the Cmd+K picker with project-grouped sections and settle its behavior:

- How groups render and how filtering interacts with them (filter across all projects, group headers sticky?).
- Cold start and edge cases: one project/one map (skip picker?), a project whose tracker failed detection, an empty project.
- What happens live when a project attaches/detaches while the picker — or its map — is open (the open map's project detaches: cross-fade to what?).
- Rail header: it currently shows the one tracker; does it now show the project too?

## Asset

Prototype at `prototype/picker-projects/` (`pnpm dev`, port 5206). Winning combination is `?variant=K`: E's jump-pane picker, G's comfortable rail air, K's named title switcher. Full exploration (A–K) and screenshots in `shots/` remain as the primary source. Served at https://cachyharness.tail71b0eb.ts.net:5206/.

Round 4a: three structures — **A** flat stream, **B** sticky sections, **C** two-pane.
Round 4b: "mix A and C" → **D** chips, **E** jump pane, **F** path rows. **E won** the picker.
Round 4c/4d: structural sidebars and picker-panel whitespace rejected.
Round 4e: **G** comfortable rail air won (airy/vast dropped).
Round 4f/4g: header toggle — **G** crumb, **H** title, **K** named (H + project inside), **I** split, **J** icon. **K won.**

## Resolution

Verdict 2026-08-14, walked through the prototype with Michael. The shipped shape is **E's picker + G's air + K's header**.

**Picker (E — Jump pane).** Not sticky group headers. A left project pane (All maps selected on open, then one row per project: dot, name, count) scopes a right-hand flat list; unscoped rows carry the project as trailing metadata. Typing searches **globally** and collapses the panes into one result list (scope only shapes browsing). ←→ cycles scope while the query is empty. Degraded projects (`no-tracker`, `error`) stay in the pane and explain themselves on the right when selected — they are not footer notes and they do not drop out. At n=1 the pane disappears.

**Rail header (K, at G's comfortable air).** Yes, it shows the project. The map title is the switcher: one control with the project name above the title and a caret, brand row (foglight + tracker kind) still above it. Click opens the same picker as ⌘K. Comfortable header padding (not the tight E baseline, not the vast end).

**Cold start.** A session with exactly one reachable map opens it outright; the picker is skipped and never forced; grouping affordances hide.

**Live attach/detach** (ticket 003's rules, confirmed in the prototype): the open map's project detaches → cross-fade to the **empty state**, picker auto-opens, the remembered map id is **kept** and the map reopens itself if that project re-attaches. A project attaching while the picker is open appears immediately. A tracker landing in an empty project promotes it live.

Name collisions were not visually prototyped; the descriptor already carries `path` — [Implement grouped picker and client project handling](007-implement-picker-client.md) should disambiguate with path when two projects share a basename.

Losing structures, for the record: sticky sections (B), chips (D), path-prefixed rows (F), quiet crumb (G), title-only switcher with a static caption (H), split chip+title (I), dedicated icon button (J).
