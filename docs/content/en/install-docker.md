---
title: Docker install (Linux)
description: 'Deploy Nowluma on Linux with the installer: access mode, ports, timezone, volumes, daily commands, desktop, upgrades and verification status.'
tutorial: install-docker
---

# Docker install (Linux)

Install on Linux first, then practise the console entry in the lesson above. The embedded console does not install Docker, start containers or authenticate QQ.

![Console login after installation](/images/tutorials/login.png)

_Figure: example console entry. Obtain the real deployment's initial password from its installer output._

For a long-running Linux server or NAS. The installer checks Docker Engine and Compose v2, writes private configuration and starts the container.

## Requirements

- Linux x86_64 (amd64). arm64 has build inputs but is not actually verified.
- Docker Engine and Compose v2; use sudo for subsequent commands when required.
- Network access to container images, Node and the pinned QQ package.
- Four persistent volumes: `config`, `data`, `logs` and the complete QQ HOME.

## Installer

From the source directory:

```bash
bash deploy/install.sh --docker
```

The first run asks:

| Prompt                      | Meaning                                |
| --------------------------- | -------------------------------------- |
| Language                    | `1. 简体中文` or `2. English`          |
| Access                      | `1. 仅本机/SSH（推荐）` or `2. 局域网` |
| Console and QQ desktop port | Default `5099`                         |
| Bot HTTP port               | Default `3000`                         |
| Bot WebSocket port          | Default `3001`                         |
| Timezone                    | For example `Asia/Shanghai`            |

Enter accepts the default. The three ports must differ. Configuration is stored in private `deploy/.env`; an existing file is preserved verbatim and never regenerated.

If Docker is missing, the installer shows an install command and asks first; it does not install silently or require disabling the firewall/SELinux. Mirror choice is yours.

On success it prints the generated initial console password and actual address. Existing deployments are not given a new password.

## First entry

```bash
bash deploy/manage.sh logs
```

Open `http://127.0.0.1:5099`, log in with the initial password and complete [First run](first-run.md). Then:

1. Press `打开 QQ 桌面` to reach the graphical QQ inside the container.
2. Log in inside QQ and optionally enable QQ's own auto-login.
3. In `QQ 会话`, refresh and attach the account.
4. On first attach, choose and acknowledge the kernel for that real UIN.
5. Add an endpoint in `机器人连接` and paste the address and token into your bot.

The desktop reuses the current console session; no extra VNC password is needed. Do not expose it directly to the public internet.

## Daily commands

```bash
bash deploy/manage.sh start
bash deploy/manage.sh stop
bash deploy/manage.sh restart
bash deploy/manage.sh logs
bash deploy/manage.sh doctor
```

- `start` builds and waits for health; failure returns non-zero and keeps existing data.
- `restart` stops gracefully and waits for recovery.
- `stop` deletes no volumes.
- `doctor` checks the container, processes, ports and directories.
- Errors in the log do not mean installation succeeded.

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
2. Update the source or release directory and run `bash deploy/manage.sh start`; volumes are reused.
3. Do not use `down -v` to upgrade.
4. Confirm backups before deleting anything; normal `stop` keeps data.

## Verification status

Container smoke uses a fresh HOME and verifies QQ process discovery, that unconfirmed accounts are not auto-attached, desktop authentication and persistence across restart/recreate. It does not fabricate account confirmation or call process discovery a real QQ login.

Real hook attach, QQ login and long-running account sessions are **NOT RUN** in the latest smoke. The published installer, container and Windows launcher have automated checks, but these do not prove delivery, QR-free restarts or a working rewrite kernel. Use CI for the specific source revision.

## Troubleshooting

| Symptom                       | Check                                                           |
| ----------------------------- | --------------------------------------------------------------- |
| Console unreachable           | Container health, port conflict, tunnel or LAN publish address  |
| Desktop unreachable           | Console session, onboarding, proxy Host and WebSocket           |
| No QQ process                 | QQ started, Xvfb/QQ logs; an empty list is not success          |
| Cannot attach                 | Native component/architecture, `SYS_PTRACE`, matching users     |
| Auto-login lost after restart | `nowluma_qq-home` reused, HOME/XDG not overridden, no `down -v` |
| Files exist but QR required   | QQ server session expired; verify inside QQ                     |
| Corrupt configuration         | The program reports and preserves it; it is not overwritten     |

More entry points: [Troubleshooting](troubleshooting.md).
