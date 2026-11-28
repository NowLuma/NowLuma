---
title: Docker install (Linux)
description: 'Install Nowluma on Linux from a terminal: nowluma commands, access modes, public mode, ports, volumes, desktop, upgrades and verification status.'
tutorial: install-docker
---

# Docker install (Linux)

Deploy Nowluma on a Linux server or NAS. The lesson above lets you practise signing in to the console.

![Console login after installation](/images/tutorials/login.png)

_Figure: example console entry. Obtain the real deployment's initial password from its installer output._

For a long-running Linux server or NAS. Installation and daily management work entirely from a terminal; no browser download is needed. The installer checks Docker Engine and Compose v2, writes private configuration and starts the container.

## Requirements

- Linux x86_64 (amd64), Bash, and curl. See the [roadmap](planned.md#platforms) for other platforms.
- Docker Engine, Compose v2, and access to the registry or mirror. The wizard can install missing components.

## Installer

Run this in Bash on Linux:

```bash
bash <(curl -qfsSL --proto =https https://nowluma.github.io/NowLuma/install.sh || echo 'exit 1')
```

Choose a language and an installation directory (default `$HOME/Nowluma`). The wizard checks Docker and Compose v2; if either is missing you can approve the official installer or the third-party LinuxMirrors script. Existing Docker and mirror settings are left unchanged. The wizard itself needs no root shell; only Docker installation or access commands are elevated with sudo when prompted.

No version prompt is needed: on the first install, the wizard resolves `wsxyt/nowluma:latest` to a fixed image digest and writes it to `deploy/.env`; reruns do not switch it. Pulls of `wsxyt/nowluma` use the Docker daemon's configured mirrors. To install a particular version, append a version tag such as `--version 2.5.1`; see the [Docker Hub tags](https://hub.docker.com/r/wsxyt/nowluma/tags).

The wizard uses these setup defaults:

| Prompt                      | Meaning                                                     |
| --------------------------- | ----------------------------------------------------------- |
| Language                    | `1. 简体中文` or `2. English`                               |
| Access                      | Localhost/SSH (recommended, default), LAN, or public        |
| Console and QQ desktop port | Default `5099`                                              |
| Bot HTTP port               | Default `3000`                                              |
| Bot WebSocket port          | Default `3001`                                              |
| Timezone                    | For example `Asia/Shanghai`                                 |

Press Enter to accept a default. Use three different ports. An existing `deploy/.env` is reused as-is; ports, access mode and the saved image are not overwritten.

Public mode is off by default: the wizard explains the risk and requires explicit confirmation. It publishes only the console port; the desktop is reached through that console's `/desktop/` path, while bot ports and the backend VNC stay on loopback. Prepare HTTPS and a firewall before using it, and enable 2FA. For your own remote access, prefer an SSH tunnel; see [Access and network](access-network.md).

If the first pull fails, the wizard does not save the new deployment. For `proxyconnect` errors, check whether the Docker daemon can reach its configured proxy. If the desired version has no Docker Hub image, run `bash deploy/install.sh --docker` from a complete source checkout.

After startup, the wizard prints the console address and, for a new deployment, the initial password.

It also registers the `nowluma` command for the current user; without root or write access to system paths, add `~/.local/bin` to `PATH`. If that directory is unavailable or an unrelated command already uses the name, rerun the wizard with `NOWLUMA_BIN_DIR` set to another directory.

## First entry

```bash
nowluma logs
```

For an older install without the `nowluma` command, use `bash deploy/manage.sh logs`.

Open `http://127.0.0.1:5099`, log in with the initial password and complete [First run](first-run.md). Then:

1. Click **Open QQ desktop** to reach the graphical QQ inside the container.
2. Log in inside QQ and optionally enable QQ's own auto-login.
3. In **QQ sessions**, refresh and attach the account.
4. On first attach, choose and acknowledge the kernel for that real UIN.
5. Add an endpoint in **Bot connections** and paste the address and token into your bot.

The desktop reuses the current console session; no extra VNC password is needed. Do not expose it directly to the public internet.

## Daily commands

```bash
nowluma
```

With no arguments it shows a numeric menu; subcommands can also be given directly:

| Command           | Effect                                                                   |
| ----------------- | ------------------------------------------------------------------------ |
| `nowluma start`   | Start the saved image (or build a source deployment) and wait for health  |
| `nowluma stop`    | Stop the service without deleting any volume                             |
| `nowluma restart` | Stop gracefully and wait for recovery without pulling or building        |
| `nowluma logs`    | Follow the container log                                                 |
| `nowluma doctor`  | Check the container, processes, ports and directories                    |
| `nowluma pull`    | Pull only the image saved in `deploy/.env`                               |
| `nowluma update`  | Reapply the saved image; `nowluma update 2.5.1` pulls an explicit version |

`nowluma` finds the installation directory through the current user's deployment registration, so it works from any directory. Older installs (for example an rc.2 deployment without the new CLI) keep using `bash deploy/manage.sh start` (also `stop`, `restart`, `logs`, `doctor`, `pull` and `update`); rerun the installer and select the existing installation directory to gain `nowluma` without changing `.env` or volumes.

## Ports and network

Only host loopback is published by default, which suits local access or an SSH tunnel. For a remote server, create a tunnel from your computer:

```bash
ssh -L 5099:127.0.0.1:5099 -L 3001:127.0.0.1:3001 user@server
```

Keep it open, then visit `http://127.0.0.1:5099`.

LAN access is available at install time: the wizard binds `0.0.0.0` and warns that HTTP is unencrypted. Public mode requires explicit confirmation and publishes only the console; the desktop is reached through that console's `/desktop/`, and OneBot ports 3000/3001 plus the backend VNC are not made public with it. Either way, a public entry needs HTTPS and a firewall; never expose the console directly. See [Access and network](access-network.md).

Whether bot ports are reachable depends on Compose publishing; in public mode they stay on loopback, so a remote bot needs its own tunnel or controlled network. Every endpoint still needs its own token; the console password is not a substitute.

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
2. For an image deployment, `nowluma update` only reapplies the image saved in `deploy/.env`; a saved digest stays pinned and does not upgrade itself. To switch versions, run `nowluma update 2.5.1` explicitly; if the new version fails its startup check, `.env` still selects the old image, so `nowluma start` restores it. You can also change the version in `NOWLUMA_IMAGE` first and run `nowluma update`. For a source deployment, update the checkout and run `nowluma start`. Both reuse the existing volumes.
3. For an older install without `nowluma`, rerun the installer and select the existing installation directory, then run `nowluma update 2.5.1`; `bash deploy/manage.sh update` keeps working as well.
4. Do not use `down -v` to upgrade.
5. Confirm backups before deleting anything; normal `stop` keeps data.

## Check the deployment {#verification-status}

Run `nowluma doctor` to check the deployment, or `nowluma logs` to diagnose a startup failure; older installs use `bash deploy/manage.sh doctor|logs`. See the [roadmap](planned.md#platforms) for platform coverage.

## Troubleshooting

| Symptom                       | Check                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| Image pull fails              | Versioned tag, platform, registry access and the daemon's mirrors                             |
| Console unreachable           | Container health, port conflict, tunnel or LAN publish address                                |
| Desktop unreachable           | Console session, onboarding, proxy Host and WebSocket                                         |
| No QQ process                 | Check the Xvfb and QQ startup logs                                                            |
| Cannot attach                 | Native component/architecture, `SYS_PTRACE`, matching users                                   |
| Auto-login lost after restart | `nowluma_qq-home` reused, HOME/XDG not overridden, no `down -v`                               |
| Files exist but QR required   | QQ server session expired; verify inside QQ                                                   |
| Corrupt configuration         | Find the file named in the error and restore it from a backup                                  |
| `nowluma` not found           | Older or unregistered install; rerun the installer with the existing directory, or use `bash deploy/manage.sh`; for non-root installs check that `~/.local/bin` is on `PATH` |

More entry points: [Troubleshooting](troubleshooting.md).
