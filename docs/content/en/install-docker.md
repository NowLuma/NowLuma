---
title: Docker install (Linux)
description: 'Deploy Nowluma on Linux with the installer: access mode, ports, timezone, volumes, daily commands, desktop, upgrades and verification status.'
tutorial: install-docker
---

# Docker install (Linux)

Deploy Nowluma on a Linux server or NAS. The lesson above lets you practise signing in to the console.

![Console login after installation](/images/tutorials/login.png)

_Figure: example console entry. Obtain the real deployment's initial password from its installer output._

For a long-running Linux server or NAS. The installer checks Docker Engine and Compose v2, writes private configuration and starts the container.

## Requirements

- Linux x86_64 (amd64), Bash, and curl. See the [roadmap](planned.md#platforms) for other platforms.
- Docker Engine, Compose v2, and access to the registry or mirror. The wizard can install missing components.

## Installer

For a prebuilt install, choose a published Linux/amd64 version from the [Docker Hub tags](https://hub.docker.com/r/wsxyt/nowluma/tags). The [GitHub release page](https://github.com/NowLuma/NowLuma/releases) lists release files and checksums. Run this in a Linux terminal:

```bash
bash -c 'set -e; tmp=$(mktemp); trap "rm -f -- \"\$tmp\"" EXIT; curl -q --proto "=https" --proto-redir "=https" -fsSL -o "$tmp" https://nowluma.github.io/NowLuma/install.sh; test -s "$tmp"; bash "$tmp" "$@"' nowluma-install
```

Select a language first. After the Docker check, choose an installation directory (default `$HOME/Nowluma`) and an image version. If you know the version, append `--version VERSION` to the command.

The wizard uses these setup defaults:

| Prompt                      | Meaning                                |
| --------------------------- | -------------------------------------- |
| Language                    | `1. 简体中文` or `2. English`          |
| Access                      | `1. Localhost/SSH (recommended)` or `2. LAN` |
| Console and QQ desktop port | Default `5099`                         |
| Bot HTTP port               | Default `3000`                         |
| Bot WebSocket port          | Default `3001`                         |
| Timezone                    | For example `Asia/Shanghai`            |

Press Enter to accept a default. Use three different ports. The wizard reuses an existing `deploy/.env` as-is.

The wizard uses the existing Docker and registry mirror settings. If Docker is missing, choose the official installer or the third-party LinuxMirrors installer to select a mirror. The wizard shows the command and asks before running it.

If the first image pull fails, the wizard does not save the new deployment. Run it again with an available version. If your target version has no Docker Hub image, run `bash deploy/install.sh --docker` from a complete source checkout.

After startup, the wizard prints the console address and, for a new deployment, the initial password.

## First entry

```bash
bash deploy/manage.sh logs
```

Open `http://127.0.0.1:5099`, log in with the initial password and complete [First run](first-run.md). Then:

1. Click **Open QQ desktop** to reach the graphical QQ inside the container.
2. Log in inside QQ and optionally enable QQ's own auto-login.
3. In **QQ sessions**, refresh and attach the account.
4. On first attach, choose and acknowledge the kernel for that real UIN.
5. Add an endpoint in **Bot connections** and paste the address and token into your bot.

The desktop reuses the current console session; no extra VNC password is needed. Do not expose it directly to the public internet.

## Daily commands

```bash
bash deploy/manage.sh start
bash deploy/manage.sh stop
bash deploy/manage.sh restart
bash deploy/manage.sh logs
bash deploy/manage.sh doctor
```

- `start` uses the saved, locally available image (or builds an existing source deployment) and waits for health.
- `restart` stops gracefully and waits for recovery without pulling or building.
- `stop` deletes no volumes.
- `doctor` checks the container, processes, ports and directories.

## Ports and network

Only host loopback is published by default. For a remote server, create a tunnel from your computer:

```bash
ssh -L 5099:127.0.0.1:5099 -L 3001:127.0.0.1:3001 user@server
```

Keep it open, then visit `http://127.0.0.1:5099`.

If you explicitly choose LAN access, the installer binds `0.0.0.0` and warns that HTTP is unencrypted. Configure HTTPS or restrict access to trusted networks; never expose the console and desktop directly to the internet. See [Access and network](access-network.md).

Whether bot ports 3000/3001 are reachable depends on Compose publishing. Every endpoint still needs its own token; the console password is not a substitute.

## Volumes

The Compose project is fixed as `nowluma`, so volume names do not depend on the checkout directory:

| Volume            | Container path  | Content                                                           |
| ----------------- | --------------- | ----------------------------------------------------------------- |
| `nowluma_config`  | `/app/config`   | Password/2FA, connections, kernel choices, runtime and appearance |
| `nowluma_data`    | `/app/data`     | Account message store and media                                   |
| `nowluma_logs`    | `/app/logs`     | Runtime logs                                                      |
| `nowluma_qq-home` | `/home/nowluma` | Complete QQ environment, auto-login, credentials, machine ID      |

QQ and the app run as UID/GID 1000 with the same HOME and XDG environment. The machine ID is created in HOME and reused after container recreation; XDG runtime is temporary `/tmp/nowluma-runtime`, so stale locks/sockets are not persisted.

Normal `stop`, `restart` and recreation reuse these volumes. `docker compose down -v` deletes data; use it only when you intend to erase everything.

## Desktop and authentication

- The desktop is served at same-origin `/desktop/`; only the console port is published, not the old 6080.
- QQ, Xvfb, openbox and x11vnc run in one container with one complete HOME, not a VM per account; multiple accounts share this desktop environment.
- HttpOnly, SameSite=Strict, path-scoped cookies; console tokens and VNC passwords never enter URLs.
- The VNC backend listens only on loopback 5900 and keeps independent authentication; the gateway checks the session server-side.
- After logout, password change or expiry, desktop operations stop; WebSocket also checks Origin.

A reverse proxy must preserve `/desktop/`, the real Host, WebSocket upgrade headers and a sufficient read timeout. See [Access and network](access-network.md).

## Upgrade and removal

1. Stop and back up all four volumes to avoid copying live SQLite/WAL.
2. For an image deployment, verify the new tag, change only `NOWLUMA_IMAGE` in `deploy/.env` to the new versioned `docker.io/wsxyt/nowluma` image, and run `bash deploy/manage.sh update`. For a source deployment, update the checkout and run `bash deploy/manage.sh start`. Both reuse the existing volumes.
3. Do not use `down -v` to upgrade.
4. Confirm backups before deleting anything; normal `stop` keeps data.

## Check the deployment {#verification-status}

Run `bash deploy/manage.sh doctor` to check the running deployment, or use `logs` to diagnose a startup failure. See the [roadmap](planned.md#platforms) for platform coverage.

## Troubleshooting

| Symptom                       | Check                                                           |
| ----------------------------- | --------------------------------------------------------------- |
| Image pull fails             | Verify the versioned tag, platform and registry access          |
| Console unreachable           | Container health, port conflict, tunnel or LAN publish address  |
| Desktop unreachable           | Console session, onboarding, proxy Host and WebSocket           |
| No QQ process                 | Check the Xvfb and QQ startup logs                              |
| Cannot attach                 | Native component/architecture, `SYS_PTRACE`, matching users     |
| Auto-login lost after restart | `nowluma_qq-home` reused, HOME/XDG not overridden, no `down -v` |
| Files exist but QR required   | QQ server session expired; verify inside QQ                     |
| Corrupt configuration         | Find the file named in the error and restore it from a backup    |

More entry points: [Troubleshooting](troubleshooting.md).
