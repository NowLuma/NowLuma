---
title: Native install (Linux release package and Windows single-file exe)
description: Run a Linux Lite release package with its launcher, or the Windows single-file exe with bundled Node; neither uses a container.
---

# Native install (Linux and Windows)

Native mode does not use a container: the program runs directly on your system and you start and sign in to QQ yourself.

## Linux release package

An extracted release package should contain `launcher.sh`, `index.mjs`, `check-node-version.cjs` and `release.json`. Start it from the extracted directory with:

```bash
bash launcher.sh
```

`deploy/install.sh` ships only with the **source repository**; it is not part of the release package. If you installed from a repository checkout, run the same checks from the repository root and point `--directory` at the extracted release:

```bash
bash deploy/install.sh --native --directory /path/to/release
```

In this mode the installer:

1. Requires `index.mjs` and `launcher.sh` in the directory, otherwise it asks you to point `--directory` at an extracted release.
2. Prefers the bundled `node`, falls back to the system `node`, and otherwise reports that bundled Node or Node.js 24.22.1 / 26.12.1+ is required.
3. Runs `check-node-version.cjs` to enforce the runtime baseline.
4. Reads `release.json` and verifies that `target` matches the current platform's `linux-<arch>`; a mismatch is a hard error.
5. Prints that you should sign in to QQ and enable automatic login, then hands over to `launcher.sh`.

The launcher pins the working directory and prefers the bundled Node. The Lite release needs Node.js `24.22.1` (24.x) or `>=26.12.1`. Do not lower the version check just to make it start.

**Native mode does not install QQ and does not modify your user directories.** Open desktop QQ yourself, sign in, then bridge the account as described in [QQ connection](qq-connection.md).

Where native data lives:

| Directory | Contents |
| --- | --- |
| `config/` | Console password and 2FA, connection settings, runtime and appearance settings |
| `data/` | Account message store and media |
| `logs/` | Runtime logs |

Keep those three directories across upgrades and replace only the release files. QQ's profile directory belongs to QQ; do not move it.

## Example and expected result

```bash
mkdir -p ~/nowluma && cd ~/nowluma
tar -xzf nowluma-linux-x64.tar.gz
bash launcher.sh
```

When installing from a repository checkout, `bash deploy/install.sh --native --directory ~/nowluma` performs the same checks.

**Expected result**: the terminal reports the actual listener, for example `listening http://127.0.0.1:5099`; open that address and the login page appears. If the default port `5099` is taken, the console logs a warning and automatically moves to a nearby free port (up to 50 ports forward); use the `listening ...` address from the log. To pin the port, stop the other process or change the listener port under “Settings → Service → Service listener” and restart. If all 50 nearby ports are unavailable it exits with `No available TCP port found near 5099`.

**When it fails**:

| Symptom | Fix |
| --- | --- |
| `Release platform mismatch` | The package is for another architecture; use the matching one |
| “bundled Node or Node.js … is required” | Install Node 24.22.1 or 26.12.1+, or use a package that bundles Node |
| Console port already in use | Check the log for the port it switched to; to pin it, stop the other process or change the listener port and restart |
| No QQ process after opening the console | Start QQ and sign in first, then refresh 「QQ 连接」 |

## Windows

Windows x64 ships as a self-contained `Nowluma.exe`:

- It is packaged by `tools/build-windows-exe.mjs` and bundles Node and the runtime; no Docker, Node or .NET installation is required.
- Double-clicking it unpacks to `%LOCALAPPDATA%\Nowluma` and opens the console in your browser.
- The current build is **unsigned** and may trigger SmartScreen. Release notes should provide a SHA-256; do not run a binary without a checksum.
- Closing the window may end the process early; prefer Ctrl+C in the console for a graceful stop. QQ user data and settings are not deleted.

This is not a claim that the exe is signed or accepted on a real account. Real QQ login, injection and long-term sessions remain yours to verify; see [Planned and unverified](planned.md).

To start:

1. Run `Nowluma.exe`.
2. Choose local QQ; if a Linux Docker engine is already available, you may choose the isolated desktop instead.
3. Open Windows QQ yourself, sign in, and enable QQ's own automatic login.
4. Return to the console and bridge the account as described in [QQ connection](qq-connection.md).

Two Windows-only differences in the interface:

- A 「低完整性警告」 (low integrity warning) appears on the overview or layout area when the current process token has low integrity. You can dismiss it 「临时关闭」 (temporarily, this tab only) or 「永久关闭」 (permanently, this machine).
- Account detection uses system file handles, so QQ must run on the same machine.

A release package should contain only the program and licence files, never `config/`, `data/`, `logs/` or real account data.

## Running from source (development only)

Only needed when you are changing code:

```bash
pnpm install --frozen-lockfile
pnpm run build:all
node dist/index.mjs
```

Development mode differs from a release build in ways that are development conventions (for example password rotation is skipped). Do not infer production behaviour from it. See [Contributing](developing.md).

## Next steps

- Open the console: [First start](first-run.md)
- Decide how you reach it: [Access and networking](access-network.md)
- Something is broken: [Troubleshooting](troubleshooting.md)
