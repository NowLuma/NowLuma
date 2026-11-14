---
title: Docker install (Linux)
description: Deploy Nowluma on Linux with the installer — language choice, Docker source choice, ports and timezone, initial password, daily commands and volumes.
---

# Docker install (Linux)

This is the most thoroughly verified install path: the host needs neither Node nor QQ, because everything runs inside the container.

## Before you start

| Requirement | Notes |
| --- | --- |
| OS | Linux. On anything else the installer exits and points at the Windows one-click package |
| Architecture | amd64 has real build and startup verification; arm64 has build inputs but is **unverified**, see [Planned and unverified](planned.md) |
| Privileges | Working `sudo`, or membership in the `docker` group |
| Network | The first build downloads dependencies, Node and a pinned, checksum-verified Linux QQ package |
| Disk | Several GB recommended for the image, QQ and dependencies |

From the extracted source directory:

```bash
bash deploy/install.sh --docker
```

You can also preselect the language: `bash deploy/install.sh --docker --lang en`.

## Step 1 — choose a language

The very first question is the language; every later confirmation, error and volume explanation follows it:

```
Nowluma — 1. 简体中文  2. English
Language / 语言 [1]:
```

- Press Enter for Simplified Chinese.
- Type `2` for English.
- The timezone default follows the language: `Asia/Shanghai` for Chinese, `UTC` for English.

## Step 2 — check Docker

The installer behaves differently in three cases:

1. **Docker already installed**: prints that Docker was detected and that its existing configuration and registry mirrors are kept. Nothing is reinstalled.
2. **No Docker**: asks 「是否使用第三方 LinuxMirrors 安装脚本并配置 Docker 镜像源？y=使用，n=官方安装。」 — *use the third-party LinuxMirrors installer and configure registry mirrors? y = mirrors, n = official.* Default is `n`.
   - `n` prints the official command it will run: `curl -fsSL https://get.docker.com | bash -s docker`.
   - `y` prints the third-party command `bash <(curl -sSL https://linuxmirrors.cn/docker.sh)` and warns that this script may also ask about disabling the firewall or SELinux — **Nowluma does not require that**; decide according to your own security policy.
   - Both paths then ask 「是否继续执行？」 (run this command?) with `y` as the default. Enter proceeds; `n` cancels and nothing is written.
3. **Docker installed but the daemon is down**: asks whether to start it and enable it on boot, then runs `systemctl enable --now docker`.

Next comes the Compose v2 check. If it is missing, the installer asks whether to install the plugin and uses `apt-get`/`dnf`/`yum`/`apk`/`pacman`/`zypper` as appropriate. Declining exits without writing configuration.

## Step 3 — first deployment settings (asked once)

These questions only appear when `deploy/.env` does not exist. If it does, the installer prints that deployment settings, accounts and the QQ HOME are preserved, **keeps the file byte-for-byte**, and resets no passwords.

| Question | Default | Effect |
| --- | --- | --- |
| Access: `1. Localhost/SSH` (recommended) or `2. LAN` | `1` | Host bind address, `127.0.0.1` or `0.0.0.0`; choosing LAN warns that HTTP is unencrypted |
| Console and QQ desktop port | `5099` | Browser port, and the port the desktop entry uses |
| Bot HTTP endpoint port | `3000` | OneBot HTTP server / reporting port |
| Bot WebSocket port | `3001` | OneBot WS service port |
| Timezone | `Asia/Shanghai` (zh) / `UTC` (en) | Written into the container's `TZ` |

Constraints:

- Ports must be integers from `1` to `65535`, and the three ports must differ; duplicates send you back to re-enter.
- The timezone accepts letters, digits and `_ + / -` only, and rejects `..`; otherwise installation aborts.
- The generated `deploy/.env` is mode `600`. It must not be a symlink — the installer fails if it is.

## Step 4 — build and wait for the startup check

The installer warns that the first build downloads Node, QQ and dependencies, then runs `manage.sh start`, which is `docker compose up -d --build --wait` with a 240-second timeout.

On success it prints:

- The console's initial password — **first run only**, 16 hex characters.
- The console URL, for example `http://127.0.0.1:5099` (the host IP when LAN access was chosen).
- The installation directory and the daily commands.

The initial password comes from the `initial credentials: user=admin password=...` line in the container log. If it has scrolled away, run `bash deploy/manage.sh logs`.

## Example — a fresh Ubuntu server

```bash
git clone <repository> Nowluma && cd Nowluma
bash deploy/install.sh --docker
```

The interaction (example, not a verbatim transcript):

```
Nowluma — 1. 简体中文  2. English
Language / 语言 [1]: 2
Docker was not found.
Use the third-party LinuxMirrors installer and configure registry mirrors? y=mirrors, n=official installer. [y/N]: n
The official Docker installer will run without an added registry mirror:
curl -fsSL https://get.docker.com | bash -s docker
Run this command? [Y/n]:
Access: 1. Localhost/SSH (recommended)  2. LAN [1]:
Console and QQ desktop port: [5099]:
Bot HTTP endpoint port: [3000]:
Bot WebSocket endpoint port: [3001]:
Timezone: [UTC]:
```

**Expected result**: the final output contains a “Nowluma is running” line, one console password, one console URL, and the five daily commands `bash deploy/manage.sh start|stop|restart|logs|doctor`.

## Three things to do right after installing

1. Open the console URL and follow [First start](first-run.md) to accept the agreements and change the access password.
2. Click 「打开 QQ 桌面」 (Open QQ desktop), sign in to QQ inside that window, and enable automatic login **in QQ's own settings**.
3. Return to [QQ connection](qq-connection.md) and load the account. Add endpoints later from [Endpoint configuration](onebot-config.md) when a bot needs them.

The desktop reuses your console session; **no separate VNC password is required**. The browser, its scripts and the WebSocket all check the console session, while the backend VNC stays on loopback with its own authentication.

## Volumes and the runtime user

The Compose project name is fixed to `nowluma`, so volume names do not depend on the source directory name — moving the checkout reuses the same data:

| Volume | Container path | Contents |
| --- | --- | --- |
| `nowluma_config` | `/app/config` | Console password/2FA, connections, runtime and appearance settings |
| `nowluma_data` | `/app/data` | Account message store and media |
| `nowluma_logs` | `/app/logs` | Runtime logs |
| `nowluma_qq-home` | `/home/nowluma` | Complete QQ HOME: settings, credentials, user storage, machine ID |

Both the program and QQ run as UID/GID **1000** with a shared HOME; `XDG_CONFIG_HOME=/home/nowluma/.config` and QQ's config directory is `QQ` inside it. The whole HOME is kept, not just `login.db`. The XDG runtime directory is the temporary `/tmp/nowluma-runtime`, so stale locks are never persisted.

The machine ID is generated once inside HOME and reused when the container is recreated. The hostname is fixed to `nowluma`.

## Daily commands

```bash
bash deploy/manage.sh start     # build and start, wait for the health check
bash deploy/manage.sh stop      # stop; volumes are kept
bash deploy/manage.sh restart   # stop cleanly, start, wait for recovery
bash deploy/manage.sh logs      # follow logs
bash deploy/manage.sh doctor    # processes, directories, permissions, listeners
```

If Docker needs `sudo`, the commands the installer prints include `sudo` automatically.

`doctor` runs the in-container health check as UID 1000 and prints `id`, `HOME`, `XDG_CONFIG_HOME` plus the permissions of `/home/nowluma`, `/home/nowluma/.config/QQ`, `/app/config`, `/app/data` and `/app/logs`.

## When installation fails

| Symptom | What to do |
| --- | --- |
| Stuck downloading dependencies or QQ | Check network and DNS. When the official address is unavailable the installer says so and points at the pinned release mirror instead of silently changing versions |
| “Startup failed; data is preserved.” | Run `bash deploy/manage.sh logs`. No volume was deleted; fix the cause and run `start` again |
| Port already in use | Change the ports in `deploy/.env` and `restart`. Do not edit the Compose file directly |
| Build succeeded but the console does not open | Check the bind address, run `manage.sh doctor`, and for a remote server open an SSH tunnel first — see [Access and networking](access-network.md) |
| You ran `docker compose down -v` | The volumes are gone and QQ must scan again. See [Data, backup and updates](data-backup.md) |

## What “installation succeeded” means

The installer only reports success after the startup check passes. That check verifies the QQ process exists, the desktop listener is up and the console answers. If a required process exits, the entrypoint ends the service and lets Docker restart it rather than leaving a console-only container behind.

It does not mean QQ is signed in, and it does not mean a bot will reply. Continue with [First start](first-run.md) and [QQ connection](qq-connection.md).
