---
title: Data, backup and updates
description: Where configuration, messages, logs and QQ HOME live; backup, restore, cleanup, upgrades, the updater and manual QQ persistence checks.
tutorial: data-backup
---

# Data, backup and updates

For a complete backup, copy both Nowluma's data and QQ's user environment. The two are stored separately.

![Storage categories for logs, transfers and account databases](/images/tutorials/storage.png)

![Configuration backup and restore controls](/images/tutorials/backup.png)

## Locations

| Content                                                           | Native             | Docker volume → path                |
| ----------------------------------------------------------------- | ------------------ | ----------------------------------- |
| Password/2FA, connections, kernel choices, runtime and appearance | `config/`          | `nowluma_config` → `/app/config`    |
| Account message store and media                                   | `data/`            | `nowluma_data` → `/app/data`        |
| Runtime logs                                                      | `logs/`            | `nowluma_logs` → `/app/logs`        |
| QQ environment, credentials, auto-login, machine ID               | QQ's own directory | `nowluma_qq-home` → `/home/nowluma` |

`dist/` is build output and is replaced on upgrade; do not store your own files there. Kernel choices live in `config/kernel-selections.json`, keyed by real UIN; never copy them to another account by hand.

## Backup

Stop the service before copying so SQLite/WAL is not being written:

```bash
bash deploy/manage.sh stop
```

For Docker, back up all four volumes; for native installs copy `config/`, `data/`, `logs/`, and QQ's user directory if you need login state. Encrypt backups and restrict access: they may contain tokens, sessions and chat data.

Start again:

```bash
bash deploy/manage.sh start
```

A backup is not a chat export. Restore the database into the same layout; do not hot-copy a single database file into a running service.

## Restore

1. Stop the service.
2. Keep a copy of the current directories/volumes for rollback.
3. Restore `config/`, `data/` and `logs/` in their original structure; replace QQ HOME only if you really need the old login state.
4. Start and check login, accounts, connections and logs.
5. If configuration is corrupt, the program reports the error and preserves the original; do not overwrite it with defaults or silently delete it.

Open Settings → `服务` → `服务配置备份`, then choose `导出备份`. The default export contains appearance, service settings and certificates, not message databases. Enable `包含敏感配置` to include account kernel selections, notification channels and OneBot configuration. Encrypt backups and share only redacted extracts: a backup can contain session data, private keys, tokens or message history.

For restoration, choose `选择备份文件` and read the overwrite confirmation. Enable `恢复敏感配置` only when those contents should also be restored. The format, UINs and acknowledgement values must be valid. Old risk versions or rewrite selections are retained without automatic authorization; older backups without kernel choices remain usable. Restart Nowluma after a successful restore to apply the new configuration. For UI layout only, `高级` also provides a separate UI export/import.

<span id="do-not" class="legacy-heading-anchor" aria-hidden="true"></span>

## Cleanup

- **Logs**: set total size and retention under Storage; save applies immediately. Temporary-data cleanup skips active transfers.
- **Account databases**: clean message history, media index or reactions for the selected account. Online accounts cannot be cleaned; all-account cleanup requires every account offline and a confirmation phrase.
- **QQ HOME**: never delete the whole HOME to “clean up”; that loses login state, machine ID and QQ settings.
- **Unused connections/account records**: remove them in the UI first, then clean databases if needed; do not edit JSON directly.

Deletion is irreversible. Confirm the backup is readable first.

## QQ persistence and manual verification

Docker must keep the **complete** HOME volume, not just `login.db`. The app uses UID/GID 1000, `XDG_CONFIG_HOME=/home/nowluma/.config`, and the machine ID is created in HOME and reused.

Verify:

1. Log in inside QQ and enable QQ's own auto-login.
2. `bash deploy/manage.sh restart`.
3. Open the QQ desktop and see whether QQ restored the session; do not rely only on the console health badge.
4. Run `stop` and `start`, or recreate the container, and confirm the volume is still used.

If QQ's server expires the session or requests verification, complete it in QQ. Keep native QQ directories in their original locations when upgrading.

## Upgrade

- Docker: stop, back up, update source/image, then `start` to reuse the volumes. `docker compose down -v` deletes the named data volumes and QQ HOME.
- Native: replace program files in the release directory, keeping `config/`, `data/`, `logs/` and the QQ directory.
- The program migrates database schemas itself. During migration the UI may mark accounts unavailable or migrating; do not start duplicate instances.
- After upgrading, check accounts, connections, kernel choices and appearance. Kernel choices persist per UIN, but an account identity change still requires a new acknowledgement.

## Updater

`关于` checks for and installs updates. Sources are auto, GitHub direct or a specified mirror; auto tries GitHub first, then candidates. Reachability is not download speed.

Release assets:

| Asset                                      | Purpose                                                         |
| ------------------------------------------ | --------------------------------------------------------------- |
| `Nowluma-v<version>-linux-x64-lite.tar.gz` | Linux x64 Lite package, used by runtime updates                 |
| `Nowluma-v<version>-win-x64-lite.zip`      | Windows runtime update archive, no bundled Node                 |
| `Nowluma-win32-x64-<version>.exe`          | Windows launcher with Node 24 and self-contained .NET, unsigned |
| `SHA256SUMS`                               | Checksums for all release files                                 |

Update packages retain `LICENSE`, `LICENSING.md`, `EULA.md` and `PRIVACY.md`. After download, `重启并更新`; connections drop briefly, configuration and data remain. Do not install packages without checksums or from untrusted sources.
