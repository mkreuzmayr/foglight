/**
 * Tailscale integration — **thin shell-outs to the `tailscale` CLI** (SPEC.md
 * §4). This is the design, not a shortcut: `tsnet` embedding is Go-only, so
 * there is no in-process option for a Node program to reach for.
 *
 * Foglight never terminates TLS. `--tailscale-serve` delegates HTTPS to
 * Tailscale, which is the only reason a MagicDNS `https://` URL exists here.
 */
import { Schema } from "effect";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export class TailscaleUnavailable extends Error {
  constructor(detail: string) {
    super(
      `foglight: the \`tailscale\` CLI is not available or not running (${detail}).\n` +
        "Install Tailscale and run `tailscale up`, or drop the --tailscale flags.",
    );

    this.name = "TailscaleUnavailable";
  }
}

/** The tailnet IPv4 address to bind to. */
export const tailnetAddress = async (): Promise<string> => {
  try {
    const { stdout } = await run("tailscale", ["ip", "-4"]);
    const address = stdout.trim().split("\n")[0]?.trim();
    if (address === undefined || address === "") {
      throw new Error("no address returned");
    }

    return address;
  } catch (error) {
    throw new TailscaleUnavailable(error instanceof Error ? error.message : String(error));
  }
};

/** `machine.tailnet.ts.net` — the name the HTTPS URL is built from. */
export const magicDnsName = async (): Promise<string | null> => {
  try {
    const { stdout } = await run("tailscale", ["status", "--json"]);
    const status = Schema.decodeUnknownSync(
      Schema.parseJson(
        Schema.Struct({
          Self: Schema.optional(Schema.Struct({ DNSName: Schema.optional(Schema.String) })),
        }),
      ),
    )(stdout);

    const name = status.Self?.DNSName?.replace(/\.$/, "");

    return name === undefined || name === "" ? null : name;
  } catch {
    return null;
  }
};

export type ServeHandle = { readonly url: string; readonly stop: () => Promise<void> };

/**
 * Hand a local port to `tailscale serve` so Tailscale terminates HTTPS.
 *
 * **Torn down on exit, best-effort.** A leaked serve mapping outlives the
 * process and keeps pointing at a port nothing is listening on any more, which
 * is a worse failure than not having set it up at all.
 */
export const startTailscaleServe = async (localPort: number): Promise<ServeHandle> => {
  const name = await magicDnsName();
  if (name === null) {
    throw new TailscaleUnavailable("could not read `tailscale status`");
  }

  try {
    await run("tailscale", ["serve", "--bg", "--https=443", `http://127.0.0.1:${localPort}`]);
  } catch (error) {
    throw new TailscaleUnavailable(error instanceof Error ? error.message : String(error));
  }

  return {
    url: `https://${name}/`,
    stop: async () => {
      try {
        await run("tailscale", ["serve", "--https=443", "off"]);
      } catch {
        // Best-effort: the process is going away regardless, and failing to
        // clean up must not turn a clean exit into a crash.
      }
    },
  };
};

/**
 * The warning `tailscale serve` earns (ADR 0001). It is **one flag** from
 * `tailscale funnel`, which would publish this map to the open internet with
 * no credential in front of it — and foglight has no application-layer auth
 * by design, because it is read-only and binding is the boundary.
 */
export const FUNNEL_WARNING =
  "note: `tailscale serve` keeps this on your tailnet. `tailscale funnel` — one word away —\n" +
  "      would publish it to the open internet, and foglight has no login in front of it.";
