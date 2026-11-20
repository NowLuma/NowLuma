---
title: Data, backup and updates
description: Where configuration, messages, logs and QQ HOME live; backup, restore, cleanup, upgrades, the updater and manual QQ persistence checks.
---

# Data, backup and updates

Nowluma keeps program data separate from QQ's own user environment. Back up, upgrade and clean up with that distinction in mind, so you do not delete account login state or the message store.

## Locations

| Content | Native | Docker volume → path |
| --- | --- | --- |
| Password/2FA, connections, kernel choices, runtime and appearance | `config/` | `nowluma_config` → `/app/config` |
| Account message store and media | `data/` | `nowluma_data` → `/app/data` |
| Runtime logs | `logs/` | `nowluma_logs` → `/app/logs` |
| QQ environment, credentials, auto-login, machine ID | QQ's own directory | `nowluma_qq-home` → `/home/nowluma` |

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

Service configuration can also be exported/restored under Settings → `服务` → `服务配置备份`, but that excludes message databases. The panel states `备份外观、服务设置与证书。不含消息数据库；通知渠道与 OneBot 配置仅随敏感配置导出。`. Sensitive inclusion is your choice: `导出时包含敏感配置` adds `kernel-selections.json`, notification channels and OneBot configuration; without it those files are skipped and no risk consent is implied. On restore, `恢复时一并恢复敏感配置` decides whether those files are overwritten; the format, acknowledgement values and UINs are validated and malformed data or a false acknowledgement is rejected. An old risk version or rewrite choice is preserved but not auto-authorized; older backups without kernel choices remain valid. A successful restore needs a Nowluma restart. UI configuration can be exported/imported separately under `高级`.

A service snapshot restores desired configuration only; it does not hot-replace live kernel authorization or process state. Restart to apply the restored configuration.

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

Even with all files present, QQ's servers may expire the session or require verification; complete it inside QQ. The app does not store the QQ password, forge device tokens or guarantee QR-free login. Native QQ directories depend on QQ's own user environment; do not move them during upgrades.

## Upgrade

- Docker: stop, back up, update source/image, then `start`; existing volumes are reused. Do not use `down -v`.
- Native: replace program files in the release directory, keeping `config/`, `data/`, `logs/` and the QQ directory.
- The program migrates database schemas itself. During migration the UI may mark accounts unavailable or migrating; do not start duplicate instances.
- After upgrading, check accounts, connections, kernel choices and appearance. Kernel choices persist per UIN, but an account identity change still requires a new acknowledgement.

## Updater

`关于` checks for and installs updates. Sources are auto, GitHub direct or a specified mirror; auto tries GitHub first, then candidates. Reachability is not download speed.

Release assets:

| Asset | Purpose |
| --- | --- |
| `Nowluma-v<version>-linux-x64-lite.tar.gz` | Linux x64 Lite package, used by runtime updates |
| `Nowluma-v<version>-win-x64-lite.zip` | Windows runtime update archive, no bundled Node |
| `Nowluma-win32-x64-<version>.exe` | Windows launcher with Node 24 and self-contained .NET, unsigned |
| `SHA256SUMS` | Checksums for all release files |

Update packages retain `LICENSE`, `LICENSING.md`, `EULA.md` and `PRIVACY.md`. After download, `重启并更新`; connections drop briefly, configuration and data remain. Do not install packages without checksums or from untrusted sources.

An update proves the file came from that build; it does not prove QQ login, message delivery or long-term stability.

## Do not

- Hot-copy SQLite as a backup while the service runs.
- Use `docker compose down -v` to upgrade or “clean up”.
- Delete the whole QQ HOME to fix a small issue.
- Copy `kernel-selections.json` to another UIN.
- Publish backups containing tokens, sessions or chat data.
