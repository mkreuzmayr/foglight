# Graph rendering library options

Research for wayfinder ticket `003-graph-rendering-library`. Question: which React library should render foglight's dependency DAG (~10–100 nodes)? Facts and trade-offs only — the pick happens on the prototype ticket.

All npm/GitHub figures checked 2026-08-06 against the npm registry API, api.npmjs.org download counts, api.github.com, and bundlephobia.

## Candidates at a glance

| Library | Latest (published) | Licence | Size (min / gzip) | Stars | Downloads/wk | Last push |
|---|---|---|---|---|---|---|
| @xyflow/react (React Flow) | 12.11.2 (2026-07-06) | MIT | 184 kB / 59 kB | 37.9k | 10.2M | 2026-08-06 |
| elkjs (layout engine only) | 0.12.0 (2026-07-17) | EPL-2.0 OR GPL-3.0-or-later | 1.61 MB / ~460 kB (measured `gzip -c elk.bundled.js`) | 2.7k | 6.1M | 2026-08-05 |
| @dagrejs/dagre (layout only) | 3.1.0 (2026-08-02) | MIT | 46 kB / 16 kB | 5.7k | — | 2026-08-06 |
| d3-dag (layout only) | 1.2.2 (2026-07-05) | MIT | 136 kB / 42 kB | 1.5k | 54k | 2026-08-01 |
| sigma | 3.0.3 (2026-04-30) | MIT | 96 kB / 26 kB | 12.1k | 314k | 2026-07-08 |
| reagraph | 4.32.0 (2026-06-25) | Apache-2.0 | bundlephobia build failed; npm unpacked 687 kB **plus** three.js/react-three-fiber dep tree | 1.1k | 79k | 2026-06-25 |

Notes on the table:
- The unmaintained original `dagre` package (0.8.5, last publish 2019) is superseded by the actively maintained fork `@dagrejs/dagre` — use the scoped name if dagre is chosen. Source: npm registry metadata for both packages.
- elkjs ships `elk-worker.min.js` (1.6 MB) and "Web Workers are supported out of the box" (`workerUrl` option) — the heavy payload can be kept off the main thread and lazy-loaded. Source: [kieler/elkjs README](https://github.com/kieler/elkjs).
- elkjs's dual licence (EPL-2.0 OR GPL-3.0-or-later) lets you take it under EPL-2.0; fine for this project but worth flagging for downstream distribution review. Source: elkjs package.json `license` field.

## Criterion 1: DAG auto-layout (elkjs / dagre)

- **React Flow** has no built-in layout; its [layouting guide](https://reactflow.dev/learn/layouting/layouting) officially documents pairing it with external engines. Dagre is called "the simplest option … largely a drop-in solution"; elkjs is "the most configurable option available, but also the most complicated" (you'll "want to keep the original Java API reference handy"). Known dagre caveat from the same page: an open issue prevents correct layout of sub-flows when sub-flow nodes connect outside the sub-flow (irrelevant unless foglight uses nested groups).
- **d3-dag** is a layout-only alternative to dagre/elk: layered Sugiyama, Zherebko (linear), and Grid algorithms, TypeScript-first, and its README explicitly advertises "drop-in compatibility with React Flow as a dagre replacement" and a smaller bundle than elkjs. Source: [erikbrinkman/d3-dag README](https://github.com/erikbrinkman/d3-dag).
- **sigma** implements no layouts at all; layouts come from graphology's ecosystem (ForceAtlas2 etc. — force-directed, not layered/DAG). A layered look would still require dagre/elk feeding positions in. Source: [sigmajs.org](https://www.sigmajs.org/).
- **reagraph** ships built-in layouts including hierarchical 2D (top-down / left-right), tree, radial, force-directed; hierarchical/tree layouts are built on d3-hierarchy — which the React Flow docs note requires a single root and uniform node sizes, so it is tree-shaped rather than general-DAG-shaped. Sources: [reagraph layouts doc](https://reagraph.dev/docs/getting-started/Layouts), [React Flow layouting guide](https://reactflow.dev/learn/layouting/layouting).
- **Custom SVG**: you'd pair dagre/elkjs/d3-dag with hand-rolled SVG; the layout column of the problem is identical, you just own the render/pan/zoom/edge-routing layer yourself.

## Criterion 2: nodes as React components styled with tailwind/shadcn

- **React Flow**: first-class. "All you need to do is create a React component. React Flow will automatically wrap it in an interactive container" — registered via a `nodeTypes` map, styled with any CSS approach including Tailwind classes; nodes are real DOM. Source: [custom nodes doc](https://reactflow.dev/learn/customization/custom-nodes).
- **sigma**: renders everything in WebGL; nodes are *not* DOM/React components. Custom node appearance means writing custom WebGL node programs, which the sigma site itself describes as "way harder to develop" than d3-style customization; the same page recommends d3 over sigma for graphs of a few hundred nodes. `@react-sigma` wraps the canvas, not the nodes. Source: [sigmajs.org](https://www.sigmajs.org/).
- **reagraph**: renders via three.js/react-three-fiber (its dependency list: `three`, `@react-three/fiber`, `@react-three/drei`, `@react-spring/three`); nodes are WebGL meshes, so shadcn/Tailwind styling does not apply to node internals. Custom nodes are three-element overrides, not HTML. Source: reagraph package.json dependencies; reagraph docs "Custom Nodes" (advanced section).
- **d3/d3-dag + custom SVG**: SVG elements can carry Tailwind classes, but embedding real shadcn components inside nodes requires `<foreignObject>` (with its own quirks) or absolutely-positioned HTML overlays — i.e. you rebuild what React Flow's node container already does.

## Criterion 3: non-node decoration (the "fog" region)

- **React Flow** has explicit hooks for this:
  - [`<ViewportPortal />`](https://reactflow.dev/api-reference/components/viewport-portal) renders arbitrary `ReactNode`s *inside the flow's coordinate system*, "affected by zooming and panning" — a fog overlay drawn at graph coordinates beyond the frontier would pan/zoom with the nodes.
  - `<Background />` (customisable canvas background) and `<Panel />` (screen-fixed chrome) cover the other two coordinate spaces. Source: [ReactFlow API reference](https://reactflow.dev/api-reference/react-flow).
  - Since nodes/edges are DOM/SVG, a fog can also be plain CSS (gradient masks, blur, an SVG layer) — no custom renderer needed.
- **sigma**: decoration means custom WebGL layers/programs; possible but the highest-effort path here.
- **reagraph**: decoration would be three.js objects/shaders in the scene; a fog effect is natural to WebGL (three.js literally has scene fog) but couples the whole app to r3f.
- **custom SVG**: total freedom by definition — fog is just another `<g>` with gradients/filters — at the cost of owning everything else.

## Criterion 4: live incremental updates without layout thrash

Two separable sub-problems: (a) re-rendering when state changes, (b) keeping positions stable when the layout re-runs.

- **React Flow** supports controlled state (`nodes`/`edges` props + `onNodesChange`) or uncontrolled (`defaultNodes`); layout is app-triggered, so you decide when to recompute, and node positions can be animated between layouts. `onlyRenderVisibleElements` exists for large graphs but "adds an overhead" — likely unnecessary at 10–100 nodes. Source: [ReactFlow API reference](https://reactflow.dev/api-reference/react-flow).
- **Layout stability is an engine property, not a renderer property.** ELK's layered algorithm has documented interactive/incremental modes: the [interactive option](https://eclipse.dev/elk/reference/options/org-eclipse-elk-interactive.html) makes algorithms "modify the current layout as little as possible", and per the [advanced configuration docs](https://eclipse.dev/elk/documentation/tooldevelopers/usingeclipselayout/advancedconfiguration.html) incremental layout uses previous positions via `cycleBreaking.strategy: INTERACTIVE`, `layering.strategy: INTERACTIVE`, `crossingMinimization.semiInteractive: true`. Neither dagre nor d3-dag documents an equivalent previous-position-aware mode; adding a node can reshuffle the whole drawing (mitigable by animating transitions).
- **sigma/graphology**: force layouts are naturally incremental (simulation keeps running) but produce organic, non-layered drawings; nodes drift.
- **reagraph**: layouts recompute on graph change; no documented previous-position-preserving mode for its hierarchical layouts.
- **d3 force / custom**: same trade-off — force is incremental but not layered; layered needs an engine with interactive support (ELK) for stability.

## Criterion 5: bundle size, licence, maintenance health

See the table. Additional facts:

- **React Flow**: MIT, monorepo [xyflow/xyflow](https://github.com/xyflow/xyflow) pushed the day of writing, 138 open issues on 37.9k stars, 10.2M weekly downloads — by far the most-used option; core deps are just `zustand`, `classcat`, `@xyflow/system`.
- **elkjs**: GWT transpilation of Java ELK (Eclipse project backing); actively released (0.12.0 July 2026). Big bundle is its main cost; web-worker + lazy-load mitigates.
- **@dagrejs/dagre**: revived under the dagrejs org, 3.1.0 published 2026-08-02, MIT, tiny (16 kB gzip). Algorithmically simpler than ELK; no incremental mode.
- **d3-dag**: single-maintainer (erikbrinkman) but active (1.2.2 July 2026), only 3 open issues, MIT.
- **sigma**: healthy (3.0.3, 12.1k stars, 28 open issues) but aimed at "graphs of thousands of nodes and edges" — its own site steers few-hundred-node use cases toward d3.
- **reagraph**: Apache-2.0, part of the reaviz/Good Code org, regular releases, but smallest community of the set (1.1k stars, 79k downloads/wk) and drags in the full three.js stack.

## Trade-off summary (no pick)

- **React Flow + a layout engine** is the only candidate that natively satisfies criteria 2 and 3 (DOM nodes → shadcn/Tailwind; ViewportPortal/Background → fog) while delegating criterion 1 to a documented, supported pattern. Its open question is which engine: dagre (tiny, simple, no incremental mode), elkjs (heavy, worker-friendly, only engine with documented interactive/position-preserving layout), or d3-dag (middle ground, advertises itself as a React Flow dagre replacement).
- **sigma** and **reagraph** are WebGL-first and optimised for graph scales foglight will never hit; both forfeit shadcn-styled nodes and make fog a shader/scene problem.
- **Custom SVG + layout engine** maximises control of the fog aesthetic but re-implements pan/zoom, edge routing, node-DOM embedding, and interaction — everything React Flow's ~59 kB gzip already covers.

## Sources

- React Flow layouting guide — https://reactflow.dev/learn/layouting/layouting
- React Flow custom nodes — https://reactflow.dev/learn/customization/custom-nodes
- React Flow API reference — https://reactflow.dev/api-reference/react-flow
- ViewportPortal — https://reactflow.dev/api-reference/components/viewport-portal
- elkjs README — https://github.com/kieler/elkjs
- ELK interactive option — https://eclipse.dev/elk/reference/options/org-eclipse-elk-interactive.html
- ELK advanced configuration (interactive layout recipe) — https://eclipse.dev/elk/documentation/tooldevelopers/usingeclipselayout/advancedconfiguration.html
- d3-dag README — https://github.com/erikbrinkman/d3-dag
- sigma.js site — https://www.sigmajs.org/
- reagraph layouts — https://reagraph.dev/docs/getting-started/Layouts
- npm registry / api.npmjs.org / api.github.com / bundlephobia.com API, queried 2026-08-06
- elkjs gzip size measured locally from the 0.12.0 npm tarball (`gzip -c lib/elk.bundled.js | wc -c` = 469,661 bytes)
