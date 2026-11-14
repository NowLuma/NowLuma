---
title: Data, backup and updates
description: Where program and QQ data live, how to back up and restore, cleanup, upgrades, update sources, and how to verify QQ really signs in by itself.
---

# Data, backup and updates

This chapter covers what must be kept, how to back it up, how to upgrade, and how to avoid fooling yourself about “it works”.

## Where data lives

### Native runs

| Path | Contents | Across upgrades |
| --- | --- | --- |
| `config/` | Console password/2FA, connection settings, runtime and appearance settings | Kept |
| `data/` | Account message store and media | Kept |
| `logs/` | Runtime logs | Kept |
| QQ's own profile directory | QQ settings, credentials, user storage, machine ID | Untouched |

### Docker

| Volume | Container path | Contents |
| --- | --- | --- |
| `nowluma_config` | `/app/config` | Console password/2FA, connections, runtime, appearance |
| `nowluma_data` | `/app/data` | Account message store and media |
| `nowluma_logs` | `/app/logs` | Runtime logs |
| `nowluma_qq-home` | `/home/nowluma` | Complete QQ HOME: settings, credentials, user storage, machine ID |

The Compose project name is fixed to `nowluma`, so volume names do not depend on the source directory.

### Three different “backups”

| Backup | Contents | Where |
| --- | --- | --- |
| Configuration backup | Program configuration, optionally including credentials | Service → configuration backup / restore |
| UI configuration backup | Appearance, layout, page preferences, custom CSS | Advanced → backup and reset |
| Data backup | Message stores, media, logs, QQ HOME | You copy the volumes or directories |

They do not cover each other. **The configuration backup contains no message database**, and the UI export does not even include background images.

## Backing up

### The correct order

1. Stop the service: `bash deploy/manage.sh stop` (or end the process for a native run).

   Stop first so you are not copying a live SQLite database with its WAL files.

2. Copy the data. In Docker, use a throwaway container to export a volume, for example:

   ```bash
   docker run --rm -v nowluma_config:/src -v "$PWD/backup":/backup alpine \
       tar -czf /backup/config.tgz -C /src .
   ```

   All four volumes (`nowluma_config`, `nowluma_data`, `nowluma_logs`, `nowluma_qq-home`) need a backup.

3. Start the service again: `bash deploy/manage.sh start`.

4. Move the archive somewhere else (another machine or object storage). A backup on the same disk as the data is not a backup.

### Using the configuration backup

Service → configuration backup / restore exports and restores configuration. Two checkboxes control whether the export includes sensitive configuration and whether a restore also applies it.

Sensitive items are: console session state, TLS private key, notification URLs, OneBot tokens. The restore summary reports 「已恢复 N 项」, 「跳过 N 项（敏感配置，含 OneBot 配置）」, 「兼容转换 N 项」 and whether a restart is needed.

**Cross-version restores**: a 「兼容转换」 (compatible conversion) entry means the backup came from an older shape and was converted. Verify the important parts afterwards (ports, tokens, accounts).

## Cleaning data

Cleanup lives under service → storage:

| Scope | Precondition | Reversible |
| --- | --- | --- |
| Logs | None | No |
| File-transfer temporary data | None | No |
| One category of one account | None | No |
| All accounts | Every account offline plus typing `清理全部账号` | No |

Ask yourself before running it:

- Is this data still needed?
- Do I have a backup, and have I verified the backup opens?
- Am I only short on space? Logs and temporary data are the cheap wins.

One Docker-specific trap: `docker compose down -v`. It deletes every volume, including QQ's HOME and program configuration. A plain `stop` keeps them, and upgrades must not use `-v`.

## Upgrading

### Docker

```bash
git pull                    # or replace the source directory
bash deploy/manage.sh start # build and start, reusing existing volumes
```

**Expected result**: `start` returns after the health check passes, with accounts, messages, appearance settings and the QQ HOME intact.

**On failure**: read `bash deploy/manage.sh logs` for the build or startup error. No volume was deleted; fix it and run `start` again.

### Native

Replace the release files, keep `config/`, `data/` and `logs/`, restart the program.

### Before any upgrade

1. Back up (previous section).
2. Note the current version (shown in About).
3. Choose a time when nobody is relying on the bot — a restart disconnects every account.

### Applying a downloaded update

About → software update can download a release. When it is ready it shows 「更新已就绪 · 重启后生效」 and asks for confirmation before restarting. That restart interrupts every connected bot.

「检查已关闭」 means this build has no update source; 「无法检查」 usually means a source checkout or an unreachable network. Neither is “already up to date”.

## QQ persistence and manual verification

All the program can do is preserve QQ's complete profile directory, keep HOME and XDG config directories fixed, and keep the hostname and the machine ID generated on first run. It does **not** regenerate credentials and does **not** sign in for you.

So:

1. Scan the QR code in QQ the first time and enable automatic login **in QQ's own settings**.
2. Restart the service to verify:

   ```bash
   bash deploy/manage.sh restart
   ```

3. Open 「QQ 桌面」 and check whether QQ returns to a signed-in state by itself. **Do not rely on the console's health status alone** — it proves processes and ports, not that the QQ session is still valid.
4. Run `stop` then `start` once more to verify it survives container recreation.

What failures mean:

| Symptom | Meaning | What to do |
| --- | --- | --- |
| QQ asks for a QR scan again | Server-side session expiry, location verification or risk control | Complete verification in QQ; local credentials cannot help |
| The auto-login setting vanished | The QQ HOME volume was not reused, HOME/XDG was overridden, or `down -v` was used | Check volume mounts and the start command |
| Files are present but QQ still asks | Local state does not equal server acceptance | Normal; see the first row |

Automated tests can verify directories, settings markers, machine ID and the bridge path. **Without your account's QR scan they will never claim “real QQ auto-login verified”** — which also means any promise of “no scanning ever” is false.

## Moving to another machine

1. Stop the service on the old machine.
2. Back up the four volumes (or the three native directories plus QQ's profile).
3. Install on the new machine and **do not start it yet**.
4. Restore the volumes or directories.
5. Start and check: are the directories writable under service → runtime environment and save locations? What version does About report? Does the account need a new scan?

QQ's device state and machine ID live inside HOME, so the whole HOME travels together; copying only `login.db` is not enough.

## Recovery checklist

1. Stop the service.
2. Back up the current state, even if it is broken.
3. Restore configuration or data from the most recent backup.
4. Start and read the log.
5. Change one variable at a time, or you will not know which step fixed it.

More symptoms are listed in [Troubleshooting](troubleshooting.md).
