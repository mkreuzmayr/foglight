# Research: Electron via npx — packaging feasibility

**Ticket:** `.wayfinder/tickets/001-electron-via-npx-packaging.md`
**Question:** How does an Electron app get shipped so `npx foglight` launches it, and can the same npm package also run headless (no Electron) on a VPS?
**Date:** 2026-08-06. Electron `latest` on npm at time of research: **43.3.0**.

## TL;DR

- Yes, this works, and it got dramatically easier as of **Electron 42**: the `electron` npm package no longer downloads its ~120–145 MB binary in `postinstall`. The npm package itself is ~1.1 MB unpacked; the binary is fetched lazily **the first time the electron bin/entry is actually invoked**.
- Consequence for foglight: `electron` can be a **plain regular dependency**. A headless VPS install (`npm i -g foglight` or `npx foglight serve`) downloads only ~1 MB of Electron wrapper JS and **never pays the binary cost** as long as the code path that launches Electron is never taken. `optionalDependencies` is not required for the size goal (though it remains an option for stricter installs).
- The standard bin pattern (used by `react-devtools`, the canonical npx-launched Electron app): the bin script runs under plain Node; `require('electron')` **from plain Node returns the path string to the Electron executable**, which the script then `spawn`s with the app directory as argv. Headless mode simply doesn't do that and runs the server in-process.

---

## 1. How the `electron` npm package works

Source: [npm registry metadata for `electron@43.3.0`](https://registry.npmjs.org/electron/latest), [`npm/install.js`](https://github.com/electron/electron/blob/main/npm/install.js), [`npm/index.js`](https://github.com/electron/electron/blob/main/npm/index.js), [`npm/cli.js`](https://github.com/electron/electron/blob/main/npm/cli.js).

- The npm package is a thin JS wrapper: `dist.unpackedSize` = **1,143,219 bytes (~1.1 MB)**. Deps: `@electron/get`, `@electron-internal/extract-zip`, `@types/node`. It exposes two bins: `electron` → `cli.js` and `install-electron` → `install.js`. **No `postinstall` script** (as of v42+; see §2).
- `index.js` (the package main) exports `getElectronPath()`, i.e. **`require('electron')` under plain Node evaluates to a string path** to the executable. Resolution order:
  1. reads `path.txt` (written by install) for the platform executable name;
  2. honors `ELECTRON_OVERRIDE_DIST_PATH`;
  3. otherwise `path.join(__dirname, 'dist', executablePath)`;
  4. **if the binary is missing, it synchronously runs `install.js` via `spawnSync(process.execPath, [install.js])` — this is the lazy first-run download**; on failure it throws telling the user to delete `node_modules/electron` and reinstall.
- `cli.js` just does `require('./')` to get the path and `child.spawn(electron, process.argv.slice(2), { stdio: 'inherit' })`, forwarding `SIGINT`/`SIGTERM`/`SIGUSR2`.
- `install.js` uses `@electron/get` to download the release zip from GitHub Releases, extracts to `node_modules/electron/dist/`, writes `path.txt`. Platform/arch overridable via `ELECTRON_INSTALL_PLATFORM` / `ELECTRON_INSTALL_ARCH` / `npm_config_platform` / `npm_config_arch`. Download cache root: `electron_config_cache` env var; defaults per [installation docs](https://www.electronjs.org/docs/latest/tutorial/installation) to `~/.cache/electron/` (Linux), `~/Library/Caches/electron/` (macOS), `%LOCALAPPDATA%/electron/Cache` (Windows). Mirrors via `ELECTRON_MIRROR`, proxy via `ELECTRON_GET_USE_PROXY`.
- Executable path inside `dist/`: `electron` (Linux), `Electron.app/Contents/MacOS/Electron` (macOS), `electron.exe` (Windows).

## 2. The Electron 42 breaking change: lazy binary download

Source: [Electron breaking-changes doc](https://www.electronjs.org/docs/latest/breaking-changes), [PR electron/electron#49328 "feat: lazy electron download"](https://github.com/electron/electron/pull/49328), [installation tutorial](https://www.electronjs.org/docs/latest/tutorial/installation).

> "Previously, the `electron` npm package would download the Electron binary from the repository's GitHub Releases in the package's `postinstall` script. With recent supply chain security attacks against the npm ecosystem with `postinstall` scripts as a common attack vector, Electron will now download itself dynamically the first time that its main `bin` script is run." — breaking changes, **Electron 42.0**

Installation doc (`docs/tutorial/installation.md`, main branch):

> "This binary is crucial to the function of any Electron app, and is downloaded by default **the first time you run Electron in development mode** (i.e. `electron .`). If you want to install the binary on demand instead, you can run the `install-electron` bin script included in the `electron` package: `npx install-electron --no`"

- `npm install --ignore-scripts` now works with Electron.
- **Pre-42** (`electron@<42`, e.g. if foglight pins an older major): `install.js` ran in `postinstall` and honored `ELECTRON_SKIP_BINARY_DOWNLOAD` — verified in [`npm/install.js` at tag v35.0.0](https://github.com/electron/electron/blob/v35.0.0/npm/install.js), line 14: `if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) { process.exit(0); }`. That env var check is **gone from `install.js` on main** (v42+ doesn't need it; installs never download).

## 3. Sizes and first-run cost

Source: [GitHub release v43.3.0 asset list](https://api.github.com/repos/electron/electron/releases/tags/v43.3.0) (exact asset sizes), npm registry (wrapper size).

| Item | Size |
|---|---|
| `electron` npm package (unpacked, all platforms) | ~1.1 MB |
| `electron-v43.3.0-linux-x64.zip` | 125.6 MB |
| `electron-v43.3.0-linux-arm64.zip` | 123.9 MB |
| `electron-v43.3.0-darwin-arm64.zip` | 122.1 MB |
| `electron-v43.3.0-darwin-x64.zip` | 124.3 MB |
| `electron-v43.3.0-win32-x64.zip` | 144.4 MB |

(Extracted `dist/` is larger than the zip; both the zip cache in `~/.cache/electron` and the extracted `dist/` are kept, so budget roughly 2–3× the zip on disk.)

**`npx foglight` first-run timeline (GUI user):**
1. npx installs foglight + deps (incl. ~1.1 MB electron wrapper) into the npx cache (see §4). Seconds.
2. First launch of the GUI path triggers `install.js` → ~120–145 MB download from GitHub Releases + extraction. One-time; cached per Electron version in the OS cache dir, and the extracted `dist/` persists inside the npx-cached `node_modules/electron/`.
3. Subsequent `npx foglight` runs reuse the npx cache → near-instant.

**VPS/headless first-run:** step 1 only. The binary download never happens unless something evaluates `require('electron')`'s missing-binary path or runs the `electron` bin.

## 4. npx mechanics

Source: [npm docs: npx](https://docs.npmjs.com/cli/v11/commands/npx), [npm exec](https://docs.npmjs.com/cli/v11/commands/npm-exec), [package.json `bin`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json).

- Packages not found locally are "installed to a folder in the npm cache, which is added to the `PATH` environment variable in the executed process" (in practice `~/.npm/_npx/<hash>/`). "The npm cli utilizes its internal package cache when using the package name specified" — subsequent runs reuse it; `--prefer-online` forces staleness checks.
- Bin selection: if the package has a single `bin` entry, that is run; with multiple entries, the one matching the unscoped package name is used; otherwise npx errors. → foglight should either have a single `"bin"` or one named `foglight`.
- First-ever install prompts ("A prompt is printed (which can be suppressed by providing either `--yes` or `--no`)").
- `bin` scripts must start with `#!/usr/bin/env node`.

## 5. `optionalDependencies` — needed?

Source: [npm docs: package.json `optionalDependencies`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#optionaldependencies).

- Semantics: npm proceeds if the dep "cannot be found or fails to install"; "It is still your program's responsibility to handle the lack of the dependency" (try/catch around `require`). Entries override same-named entries in `dependencies`.
- Key caveat: **npm installs optionalDependencies by default**; skipping them requires the *installer* to pass `--omit=optional`. So optionalDependencies alone doesn't make a VPS install smaller — the operator must opt out.
- **With electron >= 42 this is largely moot**: even as a regular dependency, a headless install costs ~1.1 MB and no binary download. Recommended setup for foglight:
  - `electron` as a **regular dependency** (pin `^43`, definitely `>=42`);
  - GUI code path is the only place that touches electron; headless path never does;
  - optionally document `--omit=optional` + move to `optionalDependencies` only if even the 1.1 MB wrapper or GitHub-reachability-on-accidental-launch is a concern. If made optional, the bin must catch the `require('electron')` failure and print "install with optional deps to use the GUI".
  - Note: lazily `npm install electron` at runtime (Playwright-style side download) is possible but nonstandard; the built-in lazy *binary* download gives the same benefit with none of the machinery.

## 6. Bin entrypoint: detecting/launching Electron vs plain Node

- **Launch (from plain Node, e.g. under npx):** `require('electron')` returns the executable path string (§1). Precedent — [`react-devtools/bin.js`](https://github.com/facebook/react/blob/main/packages/react-devtools/bin.js):
  ```js
  const electron = require('electron');
  const result = spawn.sync(electron, [require.resolve('./app')].concat(argv), {stdio: 'ignore'});
  process.exit(result.status);
  ```
  So foglight's bin: parse args → `serve`/`--headless` → require the server module in-process; GUI → spawn `require('electron')` with `[appDir, ...args]`. The first GUI spawn triggers the binary download automatically.
- **Detection at runtime (inside the app):** `process.versions.electron` is set only under Electron; `process.type` is `'browser'` in the Electron main process. Shared code can branch on `!!process.versions.electron`.
- **Escape hatch:** [`ELECTRON_RUN_AS_NODE=1`](https://www.electronjs.org/docs/latest/api/environment-variables) "Starts the process as a normal Node.js process" — lets one reuse the Electron binary as a Node runtime, but for foglight the reverse (plain Node on the VPS, no binary at all) is the right shape.
- Headless *Electron* (if ever needed on a display-less box) requires a virtual display, e.g. xvfb — see [Electron testing-on-headless-ci tutorial](https://www.electronjs.org/docs/latest/tutorial/testing-on-headless-ci). Not needed for a plain-Node server mode.

## 7. Precedents (verified against registry/source)

| Package | Structure | Evidence |
|---|---|---|
| **`react-devtools`** (`npx react-devtools`) | `electron` as **regular dependency** (`^23.1.2`); single bin `bin.js` spawns `require('electron')` with the app dir | [registry](https://registry.npmjs.org/react-devtools/latest), [bin.js](https://github.com/facebook/react/blob/main/packages/react-devtools/bin.js) |
| **`@vue/devtools`** (`npx @vue/devtools`) | bin `cli.mjs`; Electron lives one level down in dep `@vue/devtools-electron`, which has `electron@^36.9.4` as a **regular dependency** | [registry @vue/devtools](https://registry.npmjs.org/@vue/devtools/latest), [registry @vue/devtools-electron](https://registry.npmjs.org/@vue/devtools-electron/latest) |
| **`nativefier`** | npx-run CLI that *builds* Electron apps (electron-packager as dep) — shows npx+electron tooling works, not a GUI-launch precedent | [registry](https://registry.npmjs.org/nativefier/latest) |
| **electron-builder installers** | The orthodox distribution (dmg/exe/AppImage bundling the binary) — irrelevant to the npx path; npm distribution skips code signing, auto-update, and installers entirely | [Electron packaging tutorial](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging) |

Note: both devtools precedents predate Electron 42, so their users paid the ~100 MB postinstall on `npx`. Foglight targeting electron >= 42 gets the strictly better lazy behavior.

## 8. Trade-offs / open issues for the ticket

- **Pro npm/npx distribution:** one package for GUI + headless; trivial updates (`npx foglight@latest`); no code signing or per-OS installers; Electron 42+ makes headless installs ~1 MB.
- **Cons:** first GUI launch needs GitHub Releases reachability (mitigable via `ELECTRON_MIRROR`); ~120–145 MB one-time download + 2–3× that on disk per user; no macOS Gatekeeper-signed app (fine for npx-savvy users, not for general desktop distribution); Electron major upgrades change the npx cache contents silently when unpinned.
- **Recommendation:** ship one npm package, `bin.foglight` = plain-Node script; subcommand/flag selects `serve` (in-process Node server) vs default GUI (`spawn(require('electron'), [appDir])`); `electron` as a pinned regular dependency `>=42`. `optionalDependencies` unnecessary for the size goal; revisit only if the GUI path must be strictly uninstallable on servers.
