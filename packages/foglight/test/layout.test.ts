import { describe, expect, it } from "vitest";
import { runtimeLayout } from "../src/layout.js";

describe("runtimeLayout", () => {
  it("puts Linux state under XDG_RUNTIME_DIR", () => {
    expect(
      runtimeLayout({
        platform: "linux",
        env: { XDG_RUNTIME_DIR: "/run/user/1000" },
        homedir: "/home/michael",
        tmpdir: "/tmp",
        uid: 1000,
      }),
    ).toEqual({
      dir: "/run/user/1000/foglight",
      claimPath: "/run/user/1000/foglight/claim",
      socketPath: "/run/user/1000/foglight/sock",
      logPath: "/run/user/1000/foglight/daemon.log",
    });
  });

  it("falls back on Linux when XDG_RUNTIME_DIR is unset, and warns", () => {
    expect(
      runtimeLayout({
        platform: "linux",
        env: {},
        homedir: "/home/michael",
        tmpdir: "/tmp",
        uid: 1000,
      }),
    ).toEqual({
      dir: "/tmp/foglight-1000",
      claimPath: "/tmp/foglight-1000/claim",
      socketPath: "/tmp/foglight-1000/sock",
      logPath: "/tmp/foglight-1000/daemon.log",
      warning: "XDG_RUNTIME_DIR is unset; using /tmp/foglight-1000 (may not be removed at logout)",
    });
  });

  it("puts macOS claim and log in Application Support, socket in TMPDIR", () => {
    expect(
      runtimeLayout({
        platform: "darwin",
        env: { TMPDIR: "/var/folders/xx/yy/T/" },
        homedir: "/Users/michael",
        tmpdir: "/var/folders/xx/yy/T/",
        uid: 501,
      }),
    ).toEqual({
      dir: "/Users/michael/Library/Application Support/foglight",
      claimPath: "/Users/michael/Library/Application Support/foglight/claim",
      socketPath: "/var/folders/xx/yy/T/foglight.sock",
      logPath: "/Users/michael/Library/Application Support/foglight/daemon.log",
    });
  });

  it("puts Windows state in LOCALAPPDATA and the socket in the pipe namespace", () => {
    expect(
      runtimeLayout({
        platform: "win32",
        env: { LOCALAPPDATA: "C:\\Users\\michael\\AppData\\Local" },
        homedir: "C:\\Users\\michael",
        tmpdir: "C:\\Users\\michael\\AppData\\Local\\Temp",
        uid: 0,
      }),
    ).toEqual({
      dir: "C:\\Users\\michael\\AppData\\Local\\foglight",
      claimPath: "C:\\Users\\michael\\AppData\\Local\\foglight\\claim",
      socketPath: "\\\\.\\pipe\\foglight",
      logPath: "C:\\Users\\michael\\AppData\\Local\\foglight\\daemon.log",
    });
  });

  it("honors FOGLIGHT_RUNTIME_DIR on every platform so tests can isolate a session", () => {
    expect(
      runtimeLayout({
        platform: "linux",
        env: { FOGLIGHT_RUNTIME_DIR: "/tmp/iso", XDG_RUNTIME_DIR: "/run/user/1000" },
        homedir: "/home/michael",
        tmpdir: "/tmp",
        uid: 1000,
      }),
    ).toEqual({
      dir: "/tmp/iso",
      claimPath: "/tmp/iso/claim",
      socketPath: "/tmp/iso/sock",
      logPath: "/tmp/iso/daemon.log",
    });
    expect(
      runtimeLayout({
        platform: "win32",
        env: { FOGLIGHT_RUNTIME_DIR: "C:\\tmp\\iso" },
        homedir: "C:\\Users\\michael",
        tmpdir: "C:\\tmp",
        uid: 0,
      }).socketPath,
    ).toBe("\\\\.\\pipe\\foglight-iso");
  });
});
