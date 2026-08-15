import { describe, expect, it } from "vitest";
import { DEFAULT_HOST, DEFAULT_PORT, parseArgv } from "../src/argv.js";

const parse = (...args: string[]) => parseArgv(["node", "foglight", ...args], "/cwd");

describe("parseArgv", () => {
  it("parses foglight status as a one-shot command", () => {
    expect(parse("status")).toEqual({ kind: "status" });
  });

  it("parses --verbose on serve", () => {
    expect(parse("serve", "--verbose")).toMatchObject({ kind: "serve", verbose: true });
  });

  it("parses foglight serve as today, quiet by default", () => {
    expect(parse("serve", "/repo", "--port", "9999", "--host", "0.0.0.0")).toEqual({
      kind: "serve",
      repoRoot: "/repo",
      tracker: null,
      host: "0.0.0.0",
      port: 9999,
      tailscale: false,
      tailscaleServe: false,
      tailscaleServePort: 9999,
      verbose: false,
    });
    expect(parse("serve")).toEqual({
      kind: "serve",
      repoRoot: "/cwd",
      tracker: null,
      host: DEFAULT_HOST,
      port: DEFAULT_PORT,
      tailscale: false,
      tailscaleServe: false,
      tailscaleServePort: DEFAULT_PORT,
      verbose: false,
    });
  });
});
