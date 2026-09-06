import { describe, expect, it } from "vitest";
import {
  decodeLine,
  encode,
  Event,
  Hello,
  HelloReplyErr,
  HelloReplyOk,
  LogLine,
  ShutdownRequest,
} from "#foglight/protocol.js";

const flags = {
  host: "127.0.0.1",
  port: 4747,
  tailscale: false,
  tailscaleServe: false,
  tailscaleServePort: 4747,
};

const expectRoundTrip = (message: Parameters<typeof encode>[0]) => {
  const line = encode(message);
  expect(line.endsWith("\n")).toBe(true);
  expect(line.slice(0, -1).includes("\n")).toBe(false);
  expect(decodeLine(line)).toEqual(message);
};

describe("protocol", () => {
  it("round-trips a hello that names a project path", () => {
    expect.hasAssertions();
    expectRoundTrip(
      Hello.make({
        type: "hello",
        version: "0.1.0",
        path: "/home/michael/repos/foglight",
        verbose: false,
        flags,
      }),
    );
  });

  it("round-trips a status hello with no path", () => {
    expect.hasAssertions();
    expectRoundTrip(Hello.make({ type: "hello", version: "0.1.0", verbose: false, flags }));
  });

  it("round-trips an ok hello-reply carrying the daemon's flags", () => {
    expect.hasAssertions();
    expectRoundTrip(
      HelloReplyOk.make({
        type: "hello-reply",
        ok: true,
        pid: 12,
        url: "http://127.0.0.1:4747/",
        version: "0.1.0",
        flags,
        projects: [{ name: "foglight", path: "/home/michael/repos/foglight" }],
      }),
    );
  });

  it("round-trips a path-already-registered reject", () => {
    expect.hasAssertions();
    expectRoundTrip(
      HelloReplyErr.make({
        type: "hello-reply",
        ok: false,
        error: "path-registered",
        message: "this path is already registered",
      }),
    );
  });

  it("round-trips a version-skew reject", () => {
    expect.hasAssertions();
    expectRoundTrip(
      HelloReplyErr.make({
        type: "hello-reply",
        ok: false,
        error: "version-skew",
        message: "daemon is 0.1.0; attacher is 0.2.0",
      }),
    );
  });

  it("round-trips lifecycle events, log lines, and shutdown-request", () => {
    expect.hasAssertions();
    expectRoundTrip(
      Event.make({ type: "event", kind: "project-joined", path: "/repo", name: "repo" }),
    );

    expectRoundTrip(
      Event.make({ type: "event", kind: "project-left", path: "/repo", name: "repo" }),
    );

    expectRoundTrip(Event.make({ type: "event", kind: "daemon-exiting" }));
    expectRoundTrip(LogLine.make({ type: "log-line", line: "listening on 4747" }));
    expectRoundTrip(ShutdownRequest.make({ type: "shutdown-request" }));
  });
});
