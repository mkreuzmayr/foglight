/**
 * The CLI surface (SPEC.md §4). One bin, dispatching on `argv[2]`.
 *
 * Two decisions here are load-bearing and easy to erode:
 *
 *   - **`serve` is a subcommand, not a `--headless` flag**, and there is
 *     **no environment auto-detection** — no sniffing `DISPLAY`, no guessing
 *     from SSH. Which mode you get is what you typed.
 *   - **A port collision fails loudly**, with no auto-increment. A drifting
 *     port invalidates the URL just printed and any `tailscale serve` mapping
 *     aimed at it, so silently moving is worse than stopping.
 */
export type TrackerChoice = "local" | "github" | null;

export type Command =
  | { readonly kind: "gui"; readonly repoRoot: string; readonly tracker: TrackerChoice }
  | {
      readonly kind: "serve";
      readonly repoRoot: string;
      readonly tracker: TrackerChoice;
      readonly host: string;
      readonly port: number;
      readonly tailscale: boolean;
      readonly tailscaleServe: boolean;
      readonly tailscaleServePort: number;
      readonly verbose: boolean;
    }
  | { readonly kind: "help" }
  | { readonly kind: "version" }
  | { readonly kind: "status" }
  | {
      readonly kind: "daemon";
      readonly host: string;
      readonly port: number;
      readonly tailscale: boolean;
      readonly tailscaleServe: boolean;
      readonly tailscaleServePort: number;
    }
  | { readonly kind: "error"; readonly message: string };

export const DEFAULT_PORT = 4747;
export const DEFAULT_HOST = "127.0.0.1";

export const HELP = `foglight — a read-only viewer for wayfinder maps

  foglight [path]           open the desktop window on the repo at <path> (default: cwd)
  foglight serve [path]     serve headless, for a browser on this machine or a tailnet
  foglight status           print the live session (pid, url, projects), or "no session"

Options for serve:
  --port <n>                port to bind (default: ${DEFAULT_PORT}); a collision fails, it does not move
  --host <addr>             address to bind (default: ${DEFAULT_HOST})
  --tailscale               bind the tailnet address from \`tailscale ip -4\`
  --tailscale-serve         let Tailscale terminate HTTPS and give a MagicDNS URL
  --tailscale-serve-port <n>  the local port Tailscale forwards to (default: the served port)
  --verbose                 stream the daemon log to this terminal

Options for both:
  --tracker local|github    force the tracker instead of detecting it
  -h, --help                this
  -v, --version             print the version

Foglight never writes to your tracker, and never terminates TLS itself.
`;

const takeValue = (args: ReadonlyArray<string>, index: number, flag: string): string => {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new Error(`${flag} needs a value`);
  }
  return value;
};

export const parseArgv = (argv: ReadonlyArray<string>, cwd: string): Command => {
  const args = argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) return { kind: "help" };
  if (args.includes("-v") || args.includes("--version")) return { kind: "version" };

  if (args[0] === "status") return { kind: "status" };

  const serve = args[0] === "serve";
  const daemon = args[0] === "daemon";
  const rest = serve || daemon ? args.slice(1) : args;

  let repoRoot = cwd;
  let tracker: TrackerChoice = null;
  let host = DEFAULT_HOST;
  let port = DEFAULT_PORT;
  let tailscale = false;
  let tailscaleServe = false;
  let tailscaleServePort = 0;
  let verbose = false;

  try {
    for (let i = 0; i < rest.length; i += 1) {
      const arg = rest[i];
      if (arg === undefined) continue;
      switch (arg) {
        case "--tracker": {
          const value = takeValue(rest, i, "--tracker");
          if (value !== "local" && value !== "github") {
            return { kind: "error", message: `--tracker must be local or github, not "${value}"` };
          }
          tracker = value;
          i += 1;
          break;
        }
        case "--host":
          host = takeValue(rest, i, "--host");
          i += 1;
          break;
        case "--port":
          port = Number(takeValue(rest, i, "--port"));
          i += 1;
          break;
        case "--tailscale":
          tailscale = true;
          break;
        case "--tailscale-serve":
          tailscaleServe = true;
          break;
        case "--tailscale-serve-port":
          tailscaleServePort = Number(takeValue(rest, i, "--tailscale-serve-port"));
          i += 1;
          break;
        case "--verbose":
          verbose = true;
          break;
        default:
          if (arg.startsWith("-")) return { kind: "error", message: `unknown option ${arg}` };
          repoRoot = arg;
      }
    }
  } catch (error) {
    return { kind: "error", message: (error as Error).message };
  }

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return { kind: "error", message: `--port must be a port number, not "${port}"` };
  }

  if (daemon) {
    return {
      kind: "daemon",
      host,
      port,
      tailscale,
      tailscaleServe,
      tailscaleServePort: tailscaleServePort === 0 ? port : tailscaleServePort,
    };
  }

  if (!serve) {
    const guiOnly = rest.find((a) =>
      [
        "--port",
        "--host",
        "--tailscale",
        "--tailscale-serve",
        "--tailscale-serve-port",
        "--verbose",
      ].includes(a),
    );
    if (guiOnly !== undefined) {
      return {
        kind: "error",
        // The GUI's server takes an ephemeral port precisely because nothing
        // outside the process needs to reach it. Accepting these silently
        // would imply otherwise.
        message: `${guiOnly} only applies to \`foglight serve\` — the desktop window binds an ephemeral local port`,
      };
    }
    return { kind: "gui", repoRoot, tracker };
  }

  return {
    kind: "serve",
    repoRoot,
    tracker,
    host,
    port,
    tailscale,
    tailscaleServe,
    tailscaleServePort: tailscaleServePort === 0 ? port : tailscaleServePort,
    verbose,
  };
};
