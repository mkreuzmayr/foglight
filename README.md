# foglight

A read-only viewer for [wayfinder](https://github.com/mattpocock) maps: it renders a
map as a live-updating dependency graph beside an always-present rail, in
wayfinder's own vocabulary.

```bash
npx foglight            # desktop window on the repo in the current directory
npx foglight serve      # the same thing headless, for a browser or a tailnet
```

Foglight **never writes to your tracker**. It reads `.wayfinder/` markdown, or
GitHub Issues labelled `wayfinder:map`, and shows you what is decided, what is
takeable now, what is blocked, and what is still fog.

## Status

The v1 stack is implemented against [`SPEC.md`](SPEC.md), which is the output of
this repo's own wayfinder map (`.wayfinder/map.md`) and the normative reference
for every decision here. [`CONTEXT.md`](CONTEXT.md) is the ubiquitous language —
UI labels and code names both use its terms.

Not yet done: the npm release itself (Changesets, OIDC trusted publishing, the
tarball smoke job) described in SPEC.md §11.

## Layout

A pnpm monorepo that publishes exactly one package.

| Package | What it is |
|---|---|
| `packages/core` | The domain: wayfinder types, the snapshot schema, the `frontier`/`unblocked` derivation, the shared body parser, both tracker adapters, and the `HttpApi` contract both ends share. |
| `packages/server` | The Effect HTTP server: `/api/*`, the SSE feed, file watching, GitHub polling. |
| `packages/client` | The Vite/React cockpit. Depends on core for types only. |
| `packages/electron` | The Electron main process — a *client* of the same server headless runs. |
| `packages/foglight` | The published package: the `bin`, argv dispatch, and the assembled bundle. |

`prototype/` and `research/` are the map's own artifacts, kept for reference and
deliberately outside the workspace.

## Working on it

```bash
pnpm install
pnpm build          # turbo: client bundle, then the published bundle
pnpm test           # core + server (integration, against this repo's own map)
pnpm typecheck
pnpm lint
```

Two things worth knowing before you change the UI:

- **Verification needs a real browser.** jsdom cannot see SVG geometry, WAAPI or
  layout, and React Flow renders no edges without measurement — a jsdom test
  passes happily on a cockpit that draws nothing. Run the probe against a live
  server:

  ```bash
  node packages/foglight/dist/cli.js serve &
  pnpm --filter @foglight/client probe
  ```

- **React Flow runs uncontrolled**, and snapshots are applied to its store as a
  diff. Handing it a rebuilt nodes array makes every custom edge remount and
  every animation replay. SPEC.md §8 lists the five traps that cost real
  debugging time; please don't rediscover them.

## Development server

`pnpm --filter @foglight/client dev` runs Vite with `/api` proxied to a
`foglight serve` on port 4747, so the dev server behaves like the real one.
