---
title: Native install
description: Linux Lite package, self-contained Windows exe and running from source, including Node baselines, data locations and verification limits.
---

# Native install

Native mode does not use Docker. The app runs in your user environment and QQ is your desktop client. Use it when you already manage your own desktop and processes.

## Linux Lite

The release is `Nowluma-v<version>-linux-x64-lite.tar.gz`. After extraction the directory should contain `launcher.sh`, `index.mjs`, `release.json` and, when provided, a bundled Node.

Requirements:

- Linux x64.
- Node.js `24.22.1` (24.x) or `>=26.12.1`; a bundled Node is preferred.
- A desktop QQ that you can install and log in to. Nowluma does not install QQ.

Start:

```bash
bash launcher.sh
```

Install from a source checkout into a release directory:

```bash
bash deploy/install.sh --native --directory /path/to/release
```

`deploy/install.sh` ships only in the source repository, not in the Lite package. Native mode does not modify your QQ user directory or log in for you.

Program data is under `config/`, `data/` and `logs/` in the release or working directory. QQ keeps its own data in its user directory; do not move or delete it during upgrades. See [Data, backup and updates](data-backup.md).

## Windows

Windows x64 uses a self-contained `Nowluma.exe`:

- Bundles Node 24 and the .NET self-contained runtime; Docker, Node and .NET are not required.
- Extracts to `%LOCALAPPDATA%\Nowluma` and opens the console in your browser.
- After startup, use the console. Windows native does not provide the `打开 QQ 桌面` entry; desktop capability comes from the actual server. Complete the in-console notice reading and password setup; there is no additional OOBE installation or platform-chooser wizard.
- The build is **unsigned** and may trigger SmartScreen. Release notes should provide SHA-256; do not run a binary without a checksum.
- Closing the window may end the process early; use Ctrl+C in the console for a clean stop. QQ data and settings are not deleted.

After starting, complete [First run](first-run.md), then attach in `QQ 会话`. The first attach for an account requires a kernel choice and risk acknowledgement. Real injection, login and long sessions on Windows must be verified by you. A Windows browser connected to a Linux Docker server gets the desktop entry only when that server reports the capability.

## Running from source

```bash
pnpm install --frozen-lockfile
pnpm run build:all
pnpm start
```

The workspace pins Node `24.22.1` and pnpm `11.25.0`. Do not bypass the version check with an older Node.

`pnpm dev` tries to attach to a real local QQ; use it only when you intend a real runtime test. Prefer isolated fakes or the Docker smoke for routine development.

## First attach

1. Open and log in to desktop QQ.
2. Open the console and `QQ 会话`.
3. Press `刷新`, select the process, press `加载`.
4. On the first attach for that account, confirm the risk in `选择接入内核`; submit stays disabled until checked.
5. Once `已在线`, add an endpoint in `机器人连接`.

Auto-connect running QQ is a service setting applied after restart. It auto-attaches only after local QQ login, a recognized real UIN, and a current-risk-version compatibility acknowledgement. It neither logs in to QQ nor skips kernel confirmation; a PID explicitly unloaded still needs a manual load.

## Desktop and permissions

- Linux native mode must be able to attach to the same user's QQ process. Read the log on permission failures; do not mask them with `chmod 777`.
- Windows may show an integrity-level notice; follow the UI and do not disable all isolation.
- For remote access, prefer SSH tunnels or HTTPS; see [Access and network](access-network.md).

## Limits and verification

| Item | Status |
| --- | --- |
| Linux Lite startup and release layout | Automated checks |
| Real Linux QQ login/attach | Verify on your desktop |
| Windows exe | Built, unsigned; real-account behaviour unverified |
| Docker arm64 | Build inputs only, unverified |
| Rewrite kernel | Incomplete and unselectable; no automatic fallback |
| Six original prebuilt files | Used by the current release; internal bytes and required ABI unchanged |

Native mode does not automatically gain Docker's process isolation or desktop gateway; your desktop, user permissions and network define the boundary. Unverified platforms and artifacts are listed under [Planned and unverified](planned.md).
