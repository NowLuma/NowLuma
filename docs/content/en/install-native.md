---
title: Native install (Linux, and the Windows situation)
description: Running a Linux release package with its launcher, and what you need to know while the Windows release form is unconfirmed.
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

Be careful with expectations here:

- The installer exits on anything other than Linux and points Windows users at a one-click exe.
- The root README's Windows section mentions double-clicking `launcher.bat`.
- **This repository currently contains no Windows release I can verify.** Whether a single-file exe exists, whether it is signed, and what the artifact is called are all unconfirmed.

So this documentation describes the intended shape of a Windows install without claiming a downloadable exe exists today:

1. Extract the release package.
2. Double-click the launcher (`launcher.bat`, or whatever the release notes name) to start the program.
3. Open Windows QQ yourself, sign in, and enable QQ's own automatic login.
4. Return to the console and bridge the account as described in [QQ connection](qq-connection.md).

Two Windows-only differences in the interface:

- A 「低完整性警告」 (low integrity warning) appears on the overview or layout area when the current process token has low integrity. You can dismiss it 「临时关闭」 (temporarily, this tab only) or 「永久关闭」 (permanently, this machine).
- Account detection uses system file handles, so QQ must run on the same machine.

Until you hold a real release package, do not read the above as a published artifact list. This section will be replaced once the release form is confirmed — see [Planned and unverified](planned.md).

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
