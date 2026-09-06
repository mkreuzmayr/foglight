/**
 * Where the serve daemon parks its claim, socket, and log — one instance per
 * user per machine, in the platform runtime dir (research/daemon-discovery.md).
 *
 * Socket paths stay short: Linux/macOS `sun_path` is 107/103 bytes.
 */
import { homedir, tmpdir } from "node:os";

export type RuntimeLayout = {
  readonly dir: string;
  readonly claimPath: string;
  readonly socketPath: string;
  readonly logPath: string;
  readonly warning?: string;
};

export type LayoutInput = {
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.Dict<string>;
  readonly homedir: string;
  readonly tmpdir: string;
  readonly uid: number;
};

const posix = (dir: string, socketPath = `${dir}/sock`): RuntimeLayout => ({
  dir,
  claimPath: `${dir}/claim`,
  socketPath,
  logPath: `${dir}/daemon.log`,
});

export const runtimeLayout = (input: LayoutInput): RuntimeLayout => {
  const override = input.env.FOGLIGHT_RUNTIME_DIR;
  if (override !== undefined && override !== "") {
    const dir = override.replace(/[/\\]+$/, "");
    if (input.platform === "win32") {
      const leaf = dir.split("\\").pop() ?? "foglight";

      return {
        dir,
        claimPath: `${dir}\\claim`,
        socketPath: `\\\\.\\pipe\\foglight-${leaf}`,
        logPath: `${dir}\\daemon.log`,
      };
    }

    return posix(dir);
  }

  if (input.platform === "win32") {
    const local = (input.env.LOCALAPPDATA ?? `${input.homedir}\\AppData\\Local`).replace(
      /\\+$/,
      "",
    );

    const dir = `${local}\\foglight`;

    return {
      dir,
      claimPath: `${dir}\\claim`,
      socketPath: "\\\\.\\pipe\\foglight",
      logPath: `${dir}\\daemon.log`,
    };
  }

  if (input.platform === "darwin") {
    const dir = `${input.homedir}/Library/Application Support/foglight`;
    const tmp = input.tmpdir.replace(/\/+$/, "");

    return posix(dir, `${tmp}/foglight.sock`);
  }

  const runtime = input.env.XDG_RUNTIME_DIR;
  if (runtime !== undefined && runtime !== "") {
    return posix(`${runtime}/foglight`);
  }

  const dir = `/tmp/foglight-${input.uid}`;

  return {
    ...posix(dir),
    warning: `XDG_RUNTIME_DIR is unset; using ${dir} (may not be removed at logout)`,
  };
};

export const hostLayout = (): RuntimeLayout =>
  runtimeLayout({
    platform: process.platform,
    env: process.env,
    homedir: homedir(),
    tmpdir: tmpdir(),
    uid: typeof process.getuid === "function" ? process.getuid() : 0,
  });
