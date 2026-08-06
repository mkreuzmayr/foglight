---
title: "Electron-via-npx packaging feasibility"
labels: [wayfinder:research]
status: open
assignee:
blocked-by: []
---

## Question

How does an Electron app get shipped so `npx foglight` launches it, and can the same npm package also run headless (no Electron) on a VPS? Specifically: Electron as an npm dependency vs prebuilt binaries, download size and first-run cost of npx-fetching Electron, making Electron an optional dependency so headless installs skip the ~100MB+ binary, and precedents of npm packages that do this well. Surface the facts the packaging and headless-mode decisions wait on.
