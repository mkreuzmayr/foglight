// THROWAWAY PROTOTYPE — fixture is *this repo's own map*, read from
// .wayfinder/ on 2026-08-06, so the variants are judged at real density.
// One synthetic addition, marked below: a malformed ticket, to exercise that state.

import type { MapSnapshot } from "./domain";

const local = (n: string, slug: string) => `local:.wayfinder/tickets/${n}-${slug}.md`;

export const snapshot: MapSnapshot = {
  id: "local:.wayfinder/map.md",
  title: "Foglight — wayfinder map viewer",
  tracker: "local",
  destination:
    "A complete SPEC.md for foglight v1: a read-only wayfinder map viewer — Vite + React + shadcn/tailwind, Effect.js backend, Electron via `npx foglight`, plus headless mode with Tailscale — rendering the map as a live-updating dependency graph, reading trackers through a pluggable adapter interface.",
  readAt: "2026-08-06T00:00:00Z",
  warnings: [
    "008-npm-release-layout.md: unknown ticket type `discussion` (expected research | prototype | grilling | task)",
  ],
  tickets: [
    {
      id: local("001", "electron-via-npx-packaging"),
      shortId: "001",
      title: "Electron-via-npx packaging feasibility",
      type: "research",
      status: "closed",
      assignee: "research-agent",
      blockedBy: [],
      question:
        "How does an Electron app get shipped so `npx foglight` launches it, and can the same npm package also run headless on a VPS?",
      gist: "Feasible: Electron ≥42 downloads its binary lazily on first launch, so `electron` can be a plain dependency (~1 MB on headless installs).",
      resolution:
        "Electron ≥42 defers the binary download to first GUI launch, so a single package serves both modes. The bin runs under Node and spawns `require('electron')` for the window. Facts in research/electron-npx-packaging.md.",
    },
    {
      id: local("002", "effect-backend-architecture"),
      shortId: "002",
      title: "Effect.js backend architecture facts",
      type: "research",
      status: "closed",
      assignee: "research-agent",
      blockedBy: [],
      question:
        "What does the Effect ecosystem offer for foglight's backend — HTTP, file watching, GitHub polling, pushing change events to the browser?",
      gist: "@effect/platform covers HTTP, file watching, polling, SSE/WebSocket; one shared AppLayer serves both Electron main and headless.",
      resolution:
        "One `AppLayer`, two entry points: `ManagedRuntime` in Electron main, `NodeRuntime.runMain` headless. Caveats: HTTP modules marked unstable, Effect 4 migration churn ahead. Facts in research/effect-backend.md.",
    },
    {
      id: local("003", "graph-rendering-library"),
      shortId: "003",
      title: "Graph rendering library options",
      type: "research",
      status: "closed",
      assignee: "research-agent",
      blockedBy: [],
      question:
        "Which React library should render the map's dependency graph? Compare @xyflow/react against d3-based, sigma, custom SVG.",
      gist: "React Flow (@xyflow/react) is the clear DOM/tailwind-friendly candidate; layout engine stays open for the UI prototype.",
      resolution:
        "React Flow is the only candidate with DOM nodes (shadcn/tailwind styling) and first-class non-node decoration (ViewportPortal) for the fog. Layout engine open: dagre (tiny, no incremental mode), elkjs (heavy, only engine with position-preserving layout), d3-dag (middle). Facts in research/graph-rendering.md.",
    },
    {
      id: local("004", "tracker-adapter-interface"),
      shortId: "004",
      title: "Tracker adapter interface design",
      type: "grilling",
      status: "closed",
      assignee: "michaelk",
      blockedBy: [],
      question:
        "What is the read-only tracker adapter's interface? Operations, normalized domain model, discovery, error surfaces.",
      gist: "Adapters are plain records of Effect functions held by a TrackerRegistry; three ops — listMaps, whole-map loadMap, and a changes stream of bare invalidation ticks.",
      resolution:
        "Adapters report facts; the shared domain derives meaning. Adapters extract only metadata, a shared parser handles bodies, and frontier/unblocked are derived once in the domain. Qualified readable ids, degrade-don't-fail with tagged errors, GitHub auth env-token-first with `gh` fallback.",
    },
    {
      id: local("005", "map-graph-ui-prototype"),
      shortId: "005",
      title: "Map graph UI prototype",
      type: "prototype",
      status: "open",
      assignee: "michaelk",
      blockedBy: ["003"],
      question:
        "How should the map look and feel? Also settle whether a list view exists alongside the graph, and what it shows that the graph can't.",
    },
    {
      id: local("006", "headless-tailscale-mode"),
      shortId: "006",
      title: "Headless mode and Tailscale design",
      type: "grilling",
      status: "open",
      assignee: null,
      blockedBy: ["001"],
      question:
        "How does headless mode work on a VPS/VM? What `--headless` serves and to whom, what Tailscale support concretely means, the auth story for a remote browser.",
    },
    {
      id: local("007", "live-update-transport"),
      shortId: "007",
      title: "Live-update transport and cadence",
      type: "grilling",
      status: "open",
      assignee: null,
      blockedBy: ["006"],
      question:
        "The transport carrying changes to the browser (SSE vs WebSocket vs Electron IPC), polling cadence, file-watch debounce, and applying a diffed snapshot without re-running layout or losing the viewport.",
    },
    {
      // SYNTHETIC — not a real ticket on the map. Present only so the
      // malformed/invalid node state can be judged.
      id: local("008", "npm-release-layout"),
      shortId: "008",
      title: "npm package layout & release process",
      type: "task",
      status: "open",
      assignee: null,
      blockedBy: ["001"],
      question: "(unparseable)",
      malformed:
        "unknown ticket type `discussion` (expected research | prototype | grilling | task)",
    },
  ],
  fog: [
    {
      id: "fog/map-picker-ux",
      term: "Map picker UX",
      detail:
        "How multiple maps are listed and chosen. The adapter supplies lightweight map descriptors unioned across trackers, so the open part is purely presentation.",
      hangsOn: ["005"],
    },
    {
      id: "fog/ticket-detail-view",
      term: "Ticket detail view",
      detail: "What clicking a node reveals (body, resolution, assets) and how.",
      hangsOn: ["005"],
    },
    {
      id: "fog/cli-surface",
      term: "CLI surface",
      detail: "`npx foglight` flags (--headless, --port, repo path, tracker override).",
      hangsOn: ["006"],
    },
    {
      id: "fog/npm-release",
      term: "npm package layout & release process",
      detail: "Bin entries, Electron binary handling, CI, versioning.",
      hangsOn: ["006"],
    },
    {
      id: "fog/spec-assembly",
      term: "SPEC.md assembly",
      detail:
        "The closing act: fold every decision into the spec once the rest of the map is walked.",
      hangsOn: ["005", "007"],
    },
  ],
  outOfScope: [
    {
      id: "oos/write-ops",
      term: "Write operations",
      reason: "Claiming, closing or editing tickets is a workbench, not a viewer.",
    },
    {
      id: "oos/agent-sessions",
      term: "Driving agent sessions from the UI",
      reason: "Launching ticket-resolving agents is a different product.",
    },
    {
      id: "oos/hosted",
      term: "Hosted/SaaS deployment",
      reason: "Foglight runs where the repo is.",
    },
    {
      id: "oos/other-trackers",
      term: "Trackers beyond local-markdown and GitHub Issues",
      reason: "The adapter seam makes Linear etc. possible later, not now.",
    },
    {
      id: "oos/the-build",
      term: "The build and npm release themselves",
      reason: "The destination is the spec; execution is a follow-on effort.",
    },
  ],
};

/**
 * Simulates a change signal arriving: ticket 006 resolves, which unblocks 007
 * and graduates a fog patch into a new ticket. Use it to judge how violently
 * the layout thrashes on a live update (research criterion 4).
 */
export const advanceFrontier = (snap: MapSnapshot): MapSnapshot => ({
  ...snap,
  readAt: new Date().toISOString(),
  tickets: [
    ...snap.tickets.map((t) =>
      t.shortId === "006"
        ? {
            ...t,
            status: "closed" as const,
            assignee: "michaelk",
            gist: "One process, two front doors: --headless serves the built UI over HTTP; Tailscale means bind-to-tailnet plus docs.",
          }
        : t,
    ),
    {
      id: local("009", "cli-surface"),
      shortId: "009",
      title: "CLI surface for npx foglight",
      type: "grilling" as const,
      status: "open" as const,
      assignee: null,
      blockedBy: ["006"],
      question: "Graduated from fog once headless mode was settled.",
      graduatedFrom: "fog/cli-surface",
    },
  ],
  fog: snap.fog.filter((f) => f.id !== "fog/cli-surface"),
});
