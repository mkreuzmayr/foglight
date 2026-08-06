---
title: "Graph rendering library options"
labels: [wayfinder:research]
status: closed
assignee: research-agent
blocked-by: []
---

## Question

Which React library should render the map's dependency graph? Compare @xyflow/react (React Flow) against alternatives (d3-based, sigma, custom SVG) for: DAG auto-layout (elkjs/dagre integration), styling nodes with tailwind/shadcn components, rendering non-node decoration (a "fog" region at the graph's edge), live incremental updates without layout thrash, and licence/maintenance health. Surface the facts; the choice itself is made on the UI prototype ticket.

_Findings will land in `research/graph-rendering.md`._

## Resolution

Findings in [`research/graph-rendering.md`](../../research/graph-rendering.md) (verified against primary sources 2026-08-06):

- **@xyflow/react (React Flow) 12.11.2** — MIT, 59 kB gzip, very active. No built-in layout but officially documents dagre and elkjs pairing. Custom nodes are plain React DOM, so tailwind/shadcn apply directly. `<ViewportPortal />` renders arbitrary React in graph coordinates — a direct fit for the fog region.
- **Layout engines**: `@dagrejs/dagre` 3.1.0 (MIT, 16 kB gzip, no incremental mode); **elkjs** 0.12.0 (EPL-2.0/GPL-3.0, ~460 kB gzip, web-worker, the only engine with position-preserving incremental layout); **d3-dag** 1.2.2 (MIT, 42 kB gzip, layout-only, positions itself as a dagre replacement for React Flow).
- **sigma** (WebGL, non-DOM nodes) and **reagraph** (three.js meshes) are poor fits for shadcn-styled nodes; **custom SVG** re-implements what React Flow gives free.

Open framing for the prototype ticket: React Flow's layout-engine choice — dagre vs elkjs vs d3-dag (incremental stability vs bundle size/licence).
