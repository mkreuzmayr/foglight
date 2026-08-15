# Cross-platform daemon spawn and discovery facts

Research for ticket `.wayfinder/tickets-project-handling/001-daemon-discovery-research.md`.
Researched 2026-08-14 against primary sources only: Node.js official docs, libuv docs +
source (`v1.x` branch), Microsoft Win32/console docs, Apple File System Programming Guide
and TN2083, the freedesktop XDG Base Directory spec, systemd-logind man pages, POSIX
(Open Group Base Specifications Issue 7), RFC 1122, and the actual GitHub sources of
Gradle, Nx, Turborepo, and Watchman. Effect packages checked at the same versions as
`research/effect-backend.md` (typings read from npm tarballs).

## 1. Detached spawn from Node

### What the Node docs guarantee

- POSIX: "if `options.detached` is set to `true`, the child process will be made the
  leader of a new process group and session. Child processes may continue running after
  the parent exits regardless of whether they are detached or not"
  ([Node child_process docs](https://nodejs.org/api/child_process.html#optionsdetached)).
- Windows: "setting `options.detached` to `true` makes it possible for the child process
  to continue running after the parent exits" (same page).
- The load-bearing caveat: "When using the `detached` option to start a long-running
  process, the process will not stay running in the background after the parent exits
  unless it is provided with a `stdio` configuration that is not connected to the parent.
  If the parent's `stdio` is inherited, the child will remain attached to the controlling
  terminal." The documented pattern is `{ detached: true, stdio: 'ignore' }` (or fds to a
  log file) plus `subprocess.unref()`; `unref()` only removes the child from the parent's
  event-loop ref count so the *parent* can exit — it does nothing to the child
  ([Node child_process docs](https://nodejs.org/api/child_process.html#subprocessunref)).
- `stdio: 'ignore'` attaches `/dev/null` to the child's fds 0–2; Node always opens fds
  0, 1, 2 for spawned processes
  ([Node child_process docs](https://nodejs.org/api/child_process.html#optionsstdio)).
- `windowsHide` — "Hide the subprocess console window that would normally be created on
  Windows systems. **Default: `false`**" (same page). Silently ignored on Unix per libuv
  ([libuv process docs](https://docs.libuv.org/en/v1.x/process.html)).

### What actually happens per platform (libuv/OS level)

**Linux/macOS.** `UV_PROCESS_DETACHED` = new session via `setsid()`-style process-group/
session leadership: "this will make it a process group leader, and will effectively
enable the child to keep running after the parent exits"
([libuv process docs](https://docs.libuv.org/en/v1.x/process.html)). Because the child
has no controlling terminal, closing the terminal does not deliver `SIGHUP` to it (SIGHUP
on terminal hangup goes to the controlling terminal's foreground/session processes; a new
session detaches from it — see [setsid(2)](https://man7.org/linux/man-pages/man2/setsid.2.html)).
So **terminal close: survives** on both, given non-inherited stdio.

**Windows.** libuv `src/win/process.c` (branch `v1.x`) maps `UV_PROCESS_DETACHED` to:

```c
process_flags |= DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP;
process_flags |= CREATE_SUSPENDED;   /* resumed after setup */
```

([libuv source](https://github.com/libuv/libuv/blob/v1.x/src/win/process.c)). Per the
Win32 docs, `DETACHED_PROCESS` means "the new process does not inherit its parent's
console"; `CREATE_NEW_PROCESS_GROUP` makes it the root of a new process group and
**disables CTRL+C for the group**; the two console-window flags are mutually exclusive
with `CREATE_NEW_CONSOLE`
([Process Creation Flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags)).
Note the current Node doc text ("the child will have its own console window") does not
match what libuv actually passes — `DETACHED_PROCESS` gives *no* console, which is why
console-close cannot kill it.

Console close on Windows kills attached processes: `CTRL_CLOSE_EVENT` is "a signal that
the system sends to all processes attached to a console when the user closes the console",
and after the handler returns (or the ~5 s `SPI_GETHUNGAPPTIMEOUT` timeout) "the system
terminates the process"
([HandlerRoutine docs](https://learn.microsoft.com/en-us/windows/console/handlerroutine)).
A `DETACHED_PROCESS` child is not attached to that console, so **terminal close:
survives**.

**Windows job-object quirk (the big one).** libuv puts children it spawns into a global
job object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` (so they die with the parent), uses
`JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK` for nesting, and deliberately does **not** set
`CREATE_BREAKAWAY_FROM_JOB` for detached children. The source comment: "Note that we're
not setting the CREATE_BREAKAWAY_FROM_JOB flag. That means that libuv might not let you
create a fully daemonized process when run under job control"
([libuv source](https://github.com/libuv/libuv/blob/v1.x/src/win/process.c)). Practical
consequence: if the *attacher* itself runs inside a kill-on-close job (CI runners, some
terminal hosts), a "detached" daemon can still be killed when that job closes. This is a
documented libuv limitation, not something Node options can override.

### Logout (not the same as terminal close)

- **Windows**: "If the process that called `ExitWindowsEx` is running in the logon session
  of the interactive user, all processes in the logon session are terminated"
  ([Logging Off](https://learn.microsoft.com/en-us/windows/win32/shutdown/logging-off)).
  A detached user-session daemon does **not** survive logout; only services do.
- **macOS**: at logout, `loginwindow` quits GUI processes via Apple events, and for
  non-GUI processes "if that fails it terminates the program by sending it a `SIGKILL`
  signal. There is no way to catch or ignore this signal." Surviving logout requires
  being a launchd daemon in the global bootstrap namespace
  ([TN2083](https://developer.apple.com/library/archive/technotes/tn2083/_index.html)).
- **Linux**: systemd-logind's `KillUserProcesses=` "configures whether the processes of a
  user should be killed when the user logs out … Defaults to 'yes'" upstream (many
  distros ship `no`); surviving requires `loginctl enable-linger` or `systemd-run`
  ([logind.conf(5)](https://man7.org/linux/man-pages/man5/logind.conf.5.html)).

**Summary**: `detached + stdio:'ignore' + unref()` reliably survives *terminal close* on
all three platforms (modulo the Windows job caveat), and reliably does **not** survive
*logout* on Windows/macOS (and on Linux depends on logind config). A per-login-session
daemon is the only lifecycle Node can promise without OS service managers
(launchd/systemd/Windows services).

## 2. Single-instance discovery (lock/state file with pid + port)

### Where the file goes

- **Linux**: `$XDG_RUNTIME_DIR` — spec-guaranteed properties: "The directory MUST be
  owned by the user, and they MUST be the only one having read and write access to it.
  Its Unix access mode MUST be 0700"; lifetime "MUST be bound to the user being logged
  in … if the user fully logs out the directory MUST be removed". Fallback: "If
  `$XDG_RUNTIME_DIR` is not set applications should fall back to a replacement directory
  with similar capabilities and print a warning message"
  ([XDG Base Directory spec](https://specifications.freedesktop.org/basedir-spec/latest/)).
  Note the lifetime property means runtime-dir state self-cleans at logout — which matches
  the daemon's own lifetime (section 1). For state that should outlive sessions,
  `$XDG_STATE_HOME` defaults to `~/.local/state` (same spec).
- **macOS**: `~/Library/Application Support/<bundle-id or app name>/` — "Contains all
  app-specific data and support files … Your app is responsible for creating this
  directory as needed"
  ([File System Programming Guide](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/MacOSXDirectories/MacOSXDirectories.html)).
  `$TMPDIR`/`/tmp` and `~/Library/Caches` are explicitly not durable: "the system may
  purge this directory" (tmp) and "Apps should never rely on the existence of cache
  files" ([File System Overview](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html),
  same guide). So discovery state belongs in Application Support; `$TMPDIR` is fine only
  for the socket itself.
- **Windows**: `%LOCALAPPDATA%` = `FOLDERID_LocalAppData`, default path
  `%USERPROFILE%\AppData\Local`, per-user and non-roaming (vs `FOLDERID_RoamingAppData`
  = `%USERPROFILE%\AppData\Roaming`)
  ([KNOWNFOLDERID](https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid)).
  Machine-local daemon state (pids, ports, sockets) is exactly the non-roaming case.

### Atomic creation (two first-serves racing)

- POSIX `open(2)` with `O_CREAT|O_EXCL` fails with `EEXIST` if the path exists; the
  existence check and creation are one atomic operation. Caveat: "On NFS, O_EXCL is
  supported only when using NFSv3 or later"; on older NFS it races
  ([open(2)](https://man7.org/linux/man-pages/man2/open.2.html)). In Node this is the
  `'wx'`/`'ax'` file-system flag ("fails if the path exists"), with the same documented
  network-filesystem caveat
  ([Node fs docs, file system flags](https://nodejs.org/api/fs.html#file-system-flags)).
- On Windows, libuv maps `O_CREAT|O_EXCL` to the `CREATE_NEW` disposition of
  `CreateFileW`, which likewise fails if the file exists
  ([libuv `src/win/fs.c`](https://github.com/libuv/libuv/blob/v1.x/src/win/fs.c)).
  So **`fs.open(path, 'wx')` is the portable atomic "I am the first" primitive.**
- Replacing the state file's *contents* atomically: write a temp file, then rename over.
  POSIX guarantees "a link named *new* shall remain visible to other threads throughout
  the renaming operation and refer either to the file referred to by *new* or *old*"
  ([POSIX rename()](https://pubs.opengroup.org/onlinepubs/9699919799/functions/rename.html)).
  On Windows, Node's `fs.rename` is `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)`
  ([libuv `src/win/fs.c`](https://github.com/libuv/libuv/blob/v1.x/src/win/fs.c)), and
  the [MoveFileExW docs](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw)
  make **no atomicity guarantee** for the replace — and the rename fails outright if
  another process holds the target open without share-delete. Treat rename-replace as
  best-effort on Windows; keep records small (single `writeFile` of one JSON line) and
  tolerate a torn/locked read by retrying.

### Stale-lock detection

- **pid probe**: `process.kill(pid, 0)` — "signal `0` can be used as a platform
  independent way to test for the existence of a process"; throws `ESRCH` if absent
  (`EPERM` still means "exists")
  ([Node process docs](https://nodejs.org/api/process.html#processkillpid-signal)).
  Hazard: pids are recycled. On Linux the default wrap point is 32768
  (`/proc/sys/kernel/pid_max`: "the value at which PIDs wrap around",
  [proc_sys_kernel(5)](https://man7.org/linux/man-pages/man5/proc_sys_kernel.5.html)),
  so "pid alive" can be a false positive for an unrelated process. A pid probe can only
  prove *death* (ESRCH ⇒ record definitely stale), never identity.
- **health-check the channel**: connect to the recorded socket/pipe/port and do an
  application-level handshake (version + workspace id). This is what Nx and Turborepo do
  (section 4): Nx's client "probes" by connecting to the socket and treats connection
  error as "not available"
  ([nx daemon client](https://github.com/nrwl/nx/blob/master/packages/nx/src/daemon/client/client.ts));
  Turborepo retries `pidlock` ownership plus a gRPC `handshake()` and kills/restarts on
  mismatch ([turborepo connector](https://github.com/vercel/turborepo/blob/main/crates/turborepo-daemon/src/connector.rs)).
  The channel probe subsumes the pid probe and also detects wedged-but-alive daemons; use
  `kill(pid, 0)` only as a fast-path for cleaning records whose owner is provably gone.

## 3. Attacher liveness channel

### The core guarantee (all POSIX platforms)

Process termination "caused by any reason" — including SIGKILL — closes every open file
descriptor: "All of the file descriptors … open in the calling process shall be closed"
([POSIX _exit, Consequences of Process Termination](https://pubs.opengroup.org/onlinepubs/9699919799/functions/_exit.html)).
For a same-host stream socket, the kernel closing the attacher's fd surfaces at the
daemon as EOF/`'close'` (Node: "Emitted once the socket is fully closed", with
`hadError` — [Node net docs](https://nodejs.org/api/net.html#event-close_1)). So on
Linux/macOS, **SIGKILL and terminal-close of the attacher are observed promptly** as a
socket close on a unix domain socket or localhost TCP — no keepalive needed for the
same-machine case.

### Unix domain sockets (Linux/macOS)

- Path-length limit: "107 bytes on Linux and 103 bytes on macOS" for
  `sockaddr_un.sun_path` — keep socket paths short (this is why Nx enforces ≤95 chars and
  offers `NX_SOCKET_DIR`, see section 4)
  ([Node net docs, IPC support](https://nodejs.org/api/net.html#ipc-support)).
- Crash residue: "a Unix domain socket will be visible in the file system and will
  persist until unlinked" — after a daemon crash the stale socket file remains and a new
  `listen()` on it fails (`EADDRINUSE`); servers must unlink before bind (Turborepo does
  exactly `sock_path.remove_file().ok()` after acquiring the pidlock, see section 4)
  (same Node doc). Linux-only escape hatch: abstract sockets (`\0`-prefixed path)
  "disappear automatically when all open references … are closed" (same doc) — but they
  are not permission-scoped by directory mode and don't exist on macOS.

### Windows named pipes via Node `net`

- "On Windows, the local domain is implemented using a named pipe. The path *must* refer
  to an entry in `\\?\pipe\` or `\\.\pipe\` … Pipes will *not persist*. They are removed
  when the last reference to them is closed. Unlike Unix domain sockets, Windows will
  close and remove the pipe when the owning process exits"
  ([Node net docs](https://nodejs.org/api/net.html#identifying-paths-for-ipc-connections)).
  Two consequences: (a) no stale-socket-file problem at all on Windows; (b) pipe
  existence is itself a liveness signal — if the daemon died, `connect` fails immediately.
- Abrupt client death: when the client's handle is closed (including by process
  termination — the kernel closes all handles), a read on the server side fails; for
  pipes "the write handle has been closed … the function returns FALSE and GetLastError
  returns ERROR_BROKEN_PIPE"
  ([ReadFile docs](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-readfile#pipes)).
  Node surfaces this as `'error'`/`'close'` on the socket.

### Localhost TCP and keepalive

- TCP gives the same fd-close semantics for same-host peers (FIN/RST generated by the
  local kernel when the process dies). Keepalive exists for the case where no close was
  ever delivered (peer machine vanished) — irrelevant same-host, but the defaults matter
  if ever used: RFC 1122 requires keepalives be off by default and "the interval MUST be
  configurable and MUST default to no less than two hours"
  ([RFC 1122 §4.2.3.6](https://www.rfc-editor.org/rfc/rfc1122)). Node exposes tuning via
  `socket.setKeepAlive(enable, initialDelay, interval, count)` mapping to
  `SO_KEEPALIVE`/`TCP_KEEPIDLE`/`TCP_KEEPINTVL`/`TCP_KEEPCNT`
  ([Node net docs](https://nodejs.org/api/net.html#socketsetkeepaliveenable-initialdelay)).
- Sleep/wake (inference, no primary source found that addresses it directly): for a
  same-host UDS/pipe/loopback connection both endpoints suspend and resume together, so
  sleep does not sever the connection; the failure mode to design for is not sleep but
  the daemon being killed *during* sleep/hibernate-restore, which the attacher sees as a
  normal connection error on next write. An application-level ping (not TCP keepalive) is
  the robust way to bound detection latency in both directions.

## 4. Prior art

### Gradle daemon

- **Discovery**: a binary registry file at `<GRADLE_USER_HOME>/daemon/<gradle-version>/registry.bin`
  ([DaemonDir.java](https://github.com/gradle/gradle/blob/master/platforms/core-runtime/daemon-protocol/src/main/java/org/gradle/launcher/daemon/registry/DaemonDir.java)),
  storing per-daemon `DaemonInfo(address, context, token, state)` guarded by Gradle's
  `FileLockManager`, with a corruption-suppressing decorator
  ([PersistentDaemonRegistry.java](https://github.com/gradle/gradle/blob/master/platforms/core-runtime/daemon-protocol/src/main/java/org/gradle/launcher/daemon/registry/PersistentDaemonRegistry.java)).
- **Channel**: TCP on a local binding address with an OS-assigned ephemeral port —
  `bind(new InetSocketAddress(addressFactory.getLocalBindingAddress(), 0))` — the port is
  recorded in the registry
  ([TcpIncomingConnector.java](https://github.com/gradle/gradle/blob/master/platforms/core-runtime/messaging/src/main/java/org/gradle/internal/remote/internal/inet/TcpIncomingConnector.java),
  [DaemonTcpServerConnector.java](https://github.com/gradle/gradle/blob/master/platforms/core-runtime/launcher/src/main/java/org/gradle/launcher/daemon/server/DaemonTcpServerConnector.java)).
  Docs: "Communication between the client and the Daemon happens via a local socket
  connection" ([Gradle daemon docs](https://docs.gradle.org/current/userguide/gradle_daemon.html)).
- **Lifecycle**: stops itself after 3 hours idle or on low memory; actively monitors its
  own heap and restarts after the current build when leaking. A client either connects to
  a *compatible* idle daemon (exact Gradle version + JVM criteria) or starts a new one —
  the documented pitfall is daemon proliferation: "Multiple Gradle daemons might be
  spawned because the Gradle JDK and JAVA_HOME locations are different" (same docs page).
  The lesson: bake every compatibility-relevant input into the discovery key or you leak
  daemons.

### Nx daemon

- **Spawn** (`packages/nx/src/daemon/client/client.ts`): exactly the Node recipe —
  `spawn(process.execPath, [server/start.js], { stdio: ['ignore', outFd, errFd], detached: true, windowsHide: true, shell: false })`
  then `backgroundProcess.unref()`
  ([source](https://github.com/nrwl/nx/blob/master/packages/nx/src/daemon/client/client.ts)).
- **Discovery/channel**: one daemon per workspace; "On macOS and linux, the server runs
  as a unix socket, and on Windows it runs as a named pipe"
  ([Nx Daemon docs](https://nx.dev/docs/concepts/nx-daemon)). The socket path is
  `\\.\pipe\nx\<resolved path>` on Windows, plain path elsewhere; the socket dir is
  chosen from `NX_SOCKET_DIR`/`NX_DAEMON_SOCKET_DIR`, else tmp/workspace-data roots, with
  the dir name derived from `sha256(workspaceRoot)`; a hard `assertValidSocketPath` caps
  the path at 95 chars because of `sun_path` limits
  ([socket-utils.ts](https://github.com/nrwl/nx/blob/master/packages/nx/src/daemon/socket-utils.ts),
  [tmp-dir.ts](https://github.com/nrwl/nx/blob/master/packages/nx/src/daemon/tmp-dir.ts)).
- **Liveness**: the client "probes" by opening a connection to the socket; connect error
  ⇒ daemon not available ⇒ spawn a fresh one. `stop()` = `process.kill(pid, 'SIGTERM')` +
  remove the socket dir ([client.ts](https://github.com/nrwl/nx/blob/master/packages/nx/src/daemon/client/client.ts)).
- **Shutdown policy**: `SERVER_INACTIVITY_TIMEOUT_MS = 10800000` (3 hours); on planned
  termination the server closes the listener, destroys open sockets, stops watchers,
  deletes its cache, and exits 0 — and it can self-replace by spawning a successor before
  shutting down
  ([shutdown-utils.ts](https://github.com/nrwl/nx/blob/master/packages/nx/src/daemon/server/shutdown-utils.ts)).
  Disabling: `NX_DAEMON=false` ([docs](https://nx.dev/docs/concepts/nx-daemon)).

### Turborepo daemon (`turbod`, Rust)

- **Discovery layout**: per-repo directory under the OS temp/local dir —
  `/tmp/turbod-{uid}/{repo_hash}` on Unix, `%LOCALAPPDATA%/turbod/{repo_hash}` on
  Windows, where `repo_hash` = first 8 bytes of `sha256(repo root)` (drive letter
  uppercased on Windows). Files: `turbod.pid`, `turbod.lock`, `turbod.sock`, log file
  ([lib.rs](https://github.com/vercel/turborepo/blob/main/crates/turborepo-daemon/src/lib.rs)).
- **Single instance**: a `pidlock` — the daemon acquires the pid file exclusively, then
  deletes any leftover socket file before binding: `lock.acquire()?; sock_path.remove_file().ok();`.
  Unix dirs are created `0o700`, sockets `0o600`, and the daemon verifies the connecting
  peer's uid matches its own; Windows uses security descriptors for owner-only access
  ([endpoint.rs](https://github.com/vercel/turborepo/blob/main/crates/turborepo-daemon/src/endpoint.rs)).
- **Channel**: gRPC over a unix domain socket; on Windows it uses **AF_UNIX sockets via
  the `uds_windows` crate**, not named pipes
  ([connector.rs](https://github.com/vercel/turborepo/blob/main/crates/turborepo-daemon/src/connector.rs),
  [endpoint.rs](https://github.com/vercel/turborepo/blob/main/crates/turborepo-daemon/src/endpoint.rs)).
- **Client loop**: up to 5 rounds of get-or-start → connect → `handshake()`; on version
  mismatch or unresponsive server it kills the recorded pid and restarts. Spawned with
  stdio nulled ([connector.rs](https://github.com/vercel/turborepo/blob/main/crates/turborepo-daemon/src/connector.rs)).
- **Idle shutdown**: `--idle-time` defaults to `"4h0m0s"`
  ([args.rs](https://github.com/vercel/turborepo/blob/main/crates/turborepo-lib/src/cli/args.rs)).
  Opt-out: `--no-daemon`. Documented pain: daemon bugs surface as GitHub issues about
  zombie/defunct process accumulation
  ([issue #9455](https://github.com/vercel/turborepo/issues/9455)) — a warning about
  making the daemon load-bearing before it is boring.

### Watchman

- **Spawn** (`watchman/main.cpp`): per-platform. Unix: classic double-fork —
  `if (fork()) return Spawned; setsid(); if (fork()) _exit(0);`. **macOS: registers a
  launchd user agent** — writes `~/Library/LaunchAgents/com.github.facebook.watchman.plist`
  and runs `launchctl load`, falling back to the double-fork if that fails. Windows:
  spawns itself with `--foreground` as a detached child, redirecting output to the log
  file ([main.cpp](https://github.com/facebook/watchman/blob/main/watchman/main.cpp)).
- **Discovery**: clients don't read a state file; they ask the binary — "It is
  recommended that you invoke `watchman get-sockname` to discover the location … The
  watchman binary will take care of spawning the server process if necessary"
  ([socket interface docs](https://facebook.github.io/watchman/docs/socket-interface.html)).
  Default locations: unix socket under `<STATEDIR>` (default
  `<prefix>/var/run/watchman/<user>-state`), Windows named pipe
  `\\.\pipe\watchman-<user>` ([cli options docs](https://facebook.github.io/watchman/docs/cli-options.html),
  [main.cpp](https://github.com/facebook/watchman/blob/main/watchman/main.cpp)).
- **Idle policy**: the daemon itself does not exit when idle; instead individual watches
  are reaped — `idle_reap_age_seconds` (default 432000 s = 5 days): "If an idle watch has
  no triggers and no subscriptions then it will be cancelled … and removed from the state
  file" ([config docs](https://facebook.github.io/watchman/docs/config.html)).
- The "client binary is also the spawner" model gives Watchman one code path for
  discovery+spawn races: whoever wins the state-dir lock is the server, everyone else
  becomes a client.

### Pattern summary across all four

Spawn: all use detached spawn from the client with stdio pointed at a log file (or
launchd on macOS for Watchman). Discovery: a per-scope directory (per-workspace for
Nx/Turborepo, per-version for Gradle, per-user for Watchman) holding pid + channel
address, always paired with a *connect-and-handshake* validation rather than trusting the
file. Channel: unix sockets everywhere; Windows is split (Nx/Watchman: named pipes;
Turborepo: AF_UNIX; Gradle: loopback TCP). Shutdown: idle timers measured in hours
(Gradle 3 h, Nx 3 h, Turborepo 4 h) rather than "last client disconnect".

## 5. Effect ecosystem fit

Checked against `@effect/platform@0.97.1`, `@effect/platform-node@0.108.1`,
`@effect/platform-node-shared@0.61.1` (npm tarball typings, the same 3.x line documented
in `research/effect-backend.md`; Effect main branch is already the v4 restructure).

- **Sockets — covered.** `NodeSocket.makeNet(options: Net.NetConnectOpts & { openTimeout? })`
  takes Node's connect options verbatim, so `{ path }` gives unix-socket / named-pipe
  clients; `layerNet` for a `Socket` layer. Server side, `NodeSocketServer.make(options:
  Net.ServerOpts & Net.ListenOptions)` likewise accepts `{ path }` — both IPC transports
  work through the same API since it delegates to Node `net`
  (`NodeSocket.d.ts`, `NodeSocketServer.d.ts` in `@effect/platform-node-shared@0.61.1`;
  re-exported by `@effect/platform-node`). Abrupt peer death arrives as the underlying
  Node `'close'`/`'error'`, surfaced as typed `SocketError`/`CloseEvent`.
- **Exclusive state-file creation — covered.** `FileSystem.open(path, { flag })` accepts
  `OpenFlag = "r" | "r+" | "w" | "wx" | "w+" | "wx+" | "a" | "ax" | "a+" | "ax+"`, so the
  atomic `'wx'` claim from section 2 is expressible in Effect; `rename` and `remove` are
  on the same service (`FileSystem.d.ts` in `@effect/platform@0.97.1`).
- **Detached spawn — NOT covered; plain Node required.** `Command`'s `StandardCommand`
  carries only `command, args, env, extendEnv, cwd, shell, stdin, stdout, stderr, gid, uid`
  (`Command.d.ts` in `@effect/platform@0.97.1`). There is **no `detached`, no
  `windowsHide`, and no `unref`** anywhere in `Command`/`CommandExecutor`/
  `NodeCommandExecutor`, and the executor's process model assumes the child is scoped to
  the effect (kill on scope close) — the opposite of a daemon. The one daemon-side spawn
  call must be raw `child_process.spawn(..., { detached, stdio, windowsHide })` +
  `unref()`, wrapped in `Effect.sync`/`Effect.async` at the edge.
- Everything else the daemon needs (HTTP server for the UI, watcher, schedules,
  `ManagedRuntime` for the Electron face) is already established in
  `research/effect-backend.md` and unchanged by this ticket.

## Implications for foglight

Facts and trade-offs the daemon–attacher lifecycle decision (ticket 002) should weigh —
not the decision itself:

- **The achievable lifetime is "until logout", not "forever".** The Node detached recipe
  survives terminal close on all three platforms, but logout kills user processes on
  Windows and macOS by OS design, and on Linux subject to logind config. Anything longer
  requires launchd/systemd/service registration (Watchman is the precedent: it reaches
  for launchd on macOS). A first version can honestly promise per-login-session daemons.
- **One Windows caveat is not fixable from Node**: an attacher running inside a
  kill-on-job-close job object takes its "detached" daemon down with it (libuv explicitly
  does not breakaway). Worth documenting rather than engineering around.
- **The state file is a hint, the socket is the truth.** All four prior-art daemons
  validate by connecting and handshaking (version + scope), not by trusting pid files;
  `kill(pid, 0)` is only good for proving death (pid reuse makes "alive" ambiguous).
  A handshake carrying daemon version + workspace path gets Gradle's compatibility
  lessons for free.
- **Atomic claim**: `open('wx')` on a pid/state file is atomic on every local filesystem
  (both POSIX and Windows CREATE_NEW); rename-replace is atomic on POSIX but not
  guaranteed on Windows — favor the O_EXCL claim + small single-write records over
  rename-heavy schemes. Turborepo's order of operations (acquire pidlock → unlink stale
  socket → bind) is the race-safe sequence to copy.
- **Channel choice**: Node's `net` gives UDS + named pipes through one API, and Effect's
  `NodeSocket`/`NodeSocketServer` pass `{ path }` straight through, so the IPC-native
  option costs nothing extra over localhost TCP. Named pipes self-clean on Windows
  (existence ≈ liveness); UDS files persist after crashes and must be unlinked before
  bind; socket paths must stay short (~103/107 byte `sun_path`, Nx caps at 95). Localhost
  TCP (Gradle-style, port in the state file) avoids path issues entirely at the cost of
  losing filesystem permissions as the access-control story.
- **Attacher-death detection is free and prompt** on a connected stream socket on every
  platform (POSIX closes fds on any termination including SIGKILL; Windows breaks the
  pipe) — so "last client disconnected" is a reliable event. Prior art still couples it
  to a generous idle timer (3–4 h) rather than exiting on last disconnect; the trade-off
  is warm-cache value vs. leaked daemons. An application-level ping bounds detection in
  the attacher→daemon direction too; TCP keepalive defaults (≥2 h) are useless for this.
- **Directory placement**: socket in `XDG_RUNTIME_DIR` (fallback + warning per spec) /
  `$TMPDIR` (macOS) / pipe namespace (Windows); durable state in
  `~/Library/Application Support/<id>` and `%LOCALAPPDATA%\<id>`; on Linux the runtime
  dir's logout-bound lifetime conveniently matches the daemon's maximum achievable
  lifetime. Scope the state path by a hash of the workspace root (Nx/Turborepo) if
  foglight ever needs one daemon per project rather than per user.

## Sources

- Node.js `child_process` docs: <https://nodejs.org/api/child_process.html>
- Node.js `net` docs (IPC support, keepalive, events): <https://nodejs.org/api/net.html>
- Node.js `process.kill` docs: <https://nodejs.org/api/process.html#processkillpid-signal>
- Node.js `fs` docs (file system flags): <https://nodejs.org/api/fs.html#file-system-flags>
- libuv process docs: <https://docs.libuv.org/en/v1.x/process.html>
- libuv Windows process source: <https://github.com/libuv/libuv/blob/v1.x/src/win/process.c>
- libuv Windows fs source: <https://github.com/libuv/libuv/blob/v1.x/src/win/fs.c>
- Win32 process creation flags: <https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags>
- Win32 console HandlerRoutine (CTRL_CLOSE_EVENT): <https://learn.microsoft.com/en-us/windows/console/handlerroutine>
- Win32 Logging Off: <https://learn.microsoft.com/en-us/windows/win32/shutdown/logging-off>
- Win32 MoveFileExW: <https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw>
- Win32 ReadFile (pipes / ERROR_BROKEN_PIPE): <https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-readfile>
- Win32 KNOWNFOLDERID: <https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid>
- XDG Base Directory spec: <https://specifications.freedesktop.org/basedir-spec/latest/>
- systemd logind.conf(5): <https://man7.org/linux/man-pages/man5/logind.conf.5.html>
- Apple File System Programming Guide (macOS library dirs, file system overview):
  <https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/MacOSXDirectories/MacOSXDirectories.html>,
  <https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html>
- Apple TN2083 (daemons, agents, logout): <https://developer.apple.com/library/archive/technotes/tn2083/_index.html>
- POSIX open/rename/_exit (Issue 7): <https://pubs.opengroup.org/onlinepubs/9699919799/functions/rename.html>,
  <https://pubs.opengroup.org/onlinepubs/9699919799/functions/_exit.html>
- open(2), setsid(2), proc_sys_kernel(5): <https://man7.org/linux/man-pages/man2/open.2.html>,
  <https://man7.org/linux/man-pages/man2/setsid.2.html>,
  <https://man7.org/linux/man-pages/man5/proc_sys_kernel.5.html>
- RFC 1122 §4.2.3.6 (TCP keepalive): <https://www.rfc-editor.org/rfc/rfc1122>
- Gradle daemon docs + source: <https://docs.gradle.org/current/userguide/gradle_daemon.html>,
  <https://github.com/gradle/gradle> (DaemonDir, PersistentDaemonRegistry,
  DaemonTcpServerConnector, TcpIncomingConnector)
- Nx daemon docs + source: <https://nx.dev/docs/concepts/nx-daemon>,
  <https://github.com/nrwl/nx> (`packages/nx/src/daemon/*`)
- Turborepo daemon source: <https://github.com/vercel/turborepo>
  (`crates/turborepo-daemon/*`, `crates/turborepo-lib/src/cli/args.rs`)
- Watchman docs + source: <https://facebook.github.io/watchman/docs/socket-interface.html>,
  <https://facebook.github.io/watchman/docs/cli-options.html>,
  <https://facebook.github.io/watchman/docs/config.html>,
  <https://github.com/facebook/watchman> (`watchman/main.cpp`)
- Effect typings: `@effect/platform@0.97.1`, `@effect/platform-node@0.108.1`,
  `@effect/platform-node-shared@0.61.1` (npm tarballs: `Command.d.ts`,
  `FileSystem.d.ts`, `NodeSocket.d.ts`, `NodeSocketServer.d.ts`)
