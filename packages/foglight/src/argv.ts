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

type ParsedFlags = {
  repoRoot: string;
  tracker: TrackerChoice;
  host: string;
  port: number;
  tailscale: boolean;
  tailscaleServe: boolean;
  tailscaleServePort: number;
  verbose: boolean;
};

const takeValue = (args: Iterator<string>, flag: string): string => {
  const next = args.next();
  if (next.done || next.value.startsWith("-")) {
    throw new Error(`${flag} needs a value`);
  }

  return next.value;
};

const readFlag = (flags: ParsedFlags, arg: string, args: Iterator<string>): void => {
  switch (arg) {
    case "--tracker": {
      flags.tracker = trackerChoice(takeValue(args, arg));

      return;
    }

    case "--host":
      flags.host = takeValue(args, arg);

      return;

    case "--port":
      flags.port = Number(takeValue(args, arg));

      return;

    case "--tailscale":
      flags.tailscale = true;

      return;

    case "--tailscale-serve":
      flags.tailscaleServe = true;

      return;

    case "--tailscale-serve-port":
      flags.tailscaleServePort = Number(takeValue(args, arg));

      return;

    case "--verbose":
      flags.verbose = true;

      return;

    default:
      if (arg.startsWith("-")) {
        throw new Error(`unknown option ${arg}`);
      }

      flags.repoRoot = arg;
  }
};

const validPort = (port: number) => Number.isInteger(port) && port >= 1 && port <= 65_535;

const commandFromFlags = (
  flags: ParsedFlags,
  rest: readonly string[],
  serve: boolean,
  daemon: boolean,
): Command => {
  const { repoRoot, tracker, host, port, tailscale, tailscaleServe, tailscaleServePort, verbose } =
    flags;

  if (!validPort(port)) {
    return { kind: "error", message: `--port must be a port number, not "${port}"` };
  }

  if (tailscaleServePort !== 0 && !validPort(tailscaleServePort)) {
    return {
      kind: "error",
      message: `--tailscale-serve-port must be a port number, not "${tailscaleServePort}"`,
    };
  }

  const server = {
    host,
    port,
    tailscale,
    tailscaleServe,
    tailscaleServePort: tailscaleServePort === 0 ? port : tailscaleServePort,
  };

  if (daemon) {
    return { kind: "daemon", ...server };
  }

  if (serve) {
    return { kind: "serve", repoRoot, tracker, verbose, ...server };
  }

  const guiOnly = rest.find((arg) =>
    [
      "--port",
      "--host",
      "--tailscale",
      "--tailscale-serve",
      "--tailscale-serve-port",
      "--verbose",
    ].includes(arg),
  );

  if (guiOnly !== undefined) {
    return {
      kind: "error",
      message: `${guiOnly} only applies to \`foglight serve\` — the desktop window binds an ephemeral local port`,
    };
  }

  return { kind: "gui", repoRoot, tracker };
};

export const parseArgv = (argv: readonly string[], cwd: string): Command => {
  const args = argv.slice(2);
  if (args.some((arg) => ["-h", "--help"].includes(arg))) {
    return { kind: "help" };
  }

  if (args.some((arg) => ["-v", "--version"].includes(arg))) {
    return { kind: "version" };
  }

  if (args[0] === "status") {
    return { kind: "status" };
  }

  const serve = args[0] === "serve";
  const daemon = args[0] === "daemon";
  const rest = serve || daemon ? args.slice(1) : args;

  const flags: ParsedFlags = {
    repoRoot: cwd,
    tracker: null,
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    tailscale: false,
    tailscaleServe: false,
    tailscaleServePort: 0,
    verbose: false,
  };

  try {
    const remaining = rest.values();
    for (const arg of remaining) {
      readFlag(flags, arg, remaining);
    }

    return commandFromFlags(flags, rest, serve, daemon);
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
};

const trackerChoice = (value: string): TrackerChoice => {
  if (value === "local" || value === "github") {
    return value;
  }

  throw new Error(`--tracker must be local or github, not "${value}"`);
};
