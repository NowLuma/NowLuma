---
title: Native install
description: Install Linux Lite, start the self-contained Windows launcher, or run Nowluma from source.
tutorial: install-native
---

# Native install

Linux Lite installs entirely from a terminal with no browser or manual download. Windows uses the single-file EXE from the release page, checked against `SHA256SUMS`.

![Console login page used after native startup](/images/tutorials/login.png)

Use a native install to run Nowluma and QQ in your desktop environment. For an isolated Linux QQ desktop, see [Docker install](install-docker.md).

## Linux Lite

The release is `Nowluma-v<version>-linux-x64-lite.tar.gz`. After extraction the directory should contain `launcher.sh`, `index.mjs`, `release.json` and, when provided, a bundled Node.

Requirements:

- Linux x64.
- Node.js `24.22.1` (24.x) or `>=26.12.1`; a bundled Node is preferred.
- A working desktop QQ installation.

Terminal install: download, verify and extract in a fresh empty directory so existing installation data is not overwritten.

```bash
(
  set -euo pipefail
  version=2.5.1
  archive="Nowluma-v$version-linux-x64-lite.tar.gz"
  base="https://github.com/NowLuma/NowLuma/releases/download/v$version"
  mkdir -m 700 -- "$HOME/Nowluma-$version"
  cd -- "$HOME/Nowluma-$version"
  curl -qfsSL --proto =https --proto-redir =https -O "$base/$archive"
  curl -qfsSL --proto =https --proto-redir =https -O "$base/SHA256SUMS"
  awk -v name="$archive" '$2 == name' SHA256SUMS | sha256sum --check --strict
  tar -xzf "$archive"
  exec bash launcher.sh
)
```

- If verification fails, do not extract or run it; download again. Systems without `sha256sum` can use `shasum -a 256 -c`.
- A mirror may deliver the archive, but the install and upgrade digest must be obtainable from the official GitHub release `SHA256SUMS` (or official release metadata); a mirror's own checksum alone does not establish provenance.
- Do not extract over an existing installation in place. To upgrade, stop the old instance first, then copy `config/`, `data/` and `logs/` into the new directory; QQ keeps its own data in its user directory.
- The launcher can also use an executable `node` in the same directory; the Node baseline for a full release is defined by `check-node-version.cjs`.

Install from a source checkout into a release directory:

```bash
bash deploy/install.sh --native --directory /path/to/release
```

Run this command from the source checkout: the Lite archive does not include `deploy/install.sh`.

Program data is under `config/`, `data/` and `logs/` in the release or working directory. QQ keeps its own data in its user directory; do not move or delete it during upgrades. See [Data, backup and updates](data-backup.md).

## Windows

Windows x64 uses a self-contained `Nowluma.exe`:

- Bundles Node 24 and the .NET self-contained runtime; Docker, Node and .NET are not required.
- Extracts to `%LOCALAPPDATA%\Nowluma` and opens the console in your browser.
- The launcher can use the local environment or an existing Linux Docker engine for an isolated desktop; it does not install a VM. Windows-native consoles have no `打开 QQ 桌面` entry; a connected Linux server determines its own desktop capability.
- The launcher is **unsigned** and may trigger SmartScreen. Verify the release checksum before opening it.
- Closing the window may end the process early; use Ctrl+C in the console for a clean stop. QQ data and settings are not deleted.

After starting, follow [First run](first-run.md), then [attach your account](#first-attach). Native attach, sign-in and long sessions on Windows still need real-account validation.

## Running from source

```bash
pnpm install --frozen-lockfile
pnpm run build:all
pnpm start
```

The workspace pins Node `24.22.1` and pnpm `11.25.0`. Do not bypass the version check with an older Node.

For development commands and real-account testing, see [Local validation](developing.md#local-validation).

## First attach

1. Open and log in to desktop QQ.
2. Open the console and `QQ 会话`.
3. Press `刷新`, select the process, press `加载`.
4. On the first attach for that account, confirm the risk in `选择接入内核`; submit stays disabled until checked.
5. Once `已在线`, add an endpoint in `机器人连接`.

To automate subsequent attaches, see [the service listener settings](settings-runtime.md#webui-listener).

## Desktop and permissions

- Linux native mode must be able to attach to the same user's QQ process. Read the log on permission failures; do not mask them with `chmod 777`.
- Windows may show an integrity-level notice; follow the UI and do not disable all isolation.
- For remote access, prefer SSH tunnels or HTTPS; see [Access and network](access-network.md).

<span id="limits-and-verification" class="legacy-heading-anchor" aria-hidden="true"></span>

For outstanding platform checks, see [Roadmap](planned.md#platforms).
