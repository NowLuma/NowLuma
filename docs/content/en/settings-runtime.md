---
title: "Settings: Nowluma and platform"
description: Global config, storage management, notifications, listener and desktop entry, TLS, backup and restore, custom CSS, developer tools and updates — every field, save rule and destructive action.
---

# Settings: Nowluma and platform

This chapter covers the last seven tabs: **Nowluma** (global config, storage, notifications) and **platform** (service, advanced, developer, about). The first three tabs are in [Settings: console](settings-console.md).

## Global config

Runtime parameters that affect every account. Edits debounce for 500 ms and save automatically — there is no button.

| Card | Field | Description |
| --- | --- | --- |
| `rkey` fallback servers | A list of URL rows, add or remove | Empty disables it; self-hosted services are recommended. The endpoint returns `{ group_rkey, private_rkey, expired_time }`; HTTP(S) only; invalid entries are dropped server-side with 「已保存，无效项已忽略」 *(saved; invalid entries ignored)* |
| Video upload concurrency | `1` / `2` / `3` / `4` | `1 路（默认）` (1 stream, default); higher values pressure bandwidth and the remote service |
| Music signing service URL | A single URL | Empty uses the built-in default |

Server defaults: empty fallback list, empty music signing URL, video upload concurrency 1.

**Example**: to use your own `rkey` service, implement the response shape above on your own host (documentation uses `https://rkey.example.invalid/` as a placeholder), paste it into the list, and wait for the success notice. **Expected result**: one valid URL stays in the list; an entry like `ftp://…` is dropped with the “invalid entries ignored” message.

## Storage

### Storage overview

Four numbers: total managed data, logs, account databases, transfer temporary data.

Below them a log-capacity bar shows `{used} / {max}`, `{n} files`, `{n} active files`, `dropped {n} disk log lines`, plus a summary of the last cleanup (`lastCleanup`).

### Log policy

| Field | Description |
| --- | --- |
| 「日志总量上限（MB）」 | Total log cap; older data is evicted past it |
| 「保留天数」 | `0` means size-only eviction, no time-based expiry |
| 「按账号额外写入日志」 | Write separate log files per account |

Press 「保存并应用」 (save and apply) to take effect immediately; the response includes a refreshed snapshot.

Fields locked by environment variables show a 「环境变量锁定」 badge and cannot be edited — deliberately, so configuration files and environment overrides cannot silently disagree.

### Global data cleanup

Two rows: logs, and file-transfer temporary data. Each shows size and activity counts and asks 「确认清理」 (confirm cleanup) before deleting.

### Account data

Each account gets a card with three categories, described in the interface as:

| Category | Contains |
| --- | --- |
| 消息历史 (message history) | OneBot messages and reply index |
| 媒体索引 (media index) | Metadata for images, voice and video |
| 表情回应 (reactions) | Group message reaction records |

You can clear one category for one account, or use the 「全部账号」 (all accounts) block:

- Every account must be **offline**.
- You must type the confirmation phrase `清理全部账号`.
- A final 「确认清理」 dialog appears before anything is deleted.

**These operations delete files and cannot be undone.** Back up first when the data matters — see [Data, backup and updates](data-backup.md).

## Notifications

Send a message to your own channels when an account goes offline or recovers.

### Debounce window

「去抖窗口（秒）」 ranges from 0 to 3600, default 30. The description: an offline period longer than this triggers a notification, and recovery triggers another; `0` notifies immediately.

Why it exists: a restart or a network blip drops the account briefly. Thirty seconds keeps a 3 a.m. page from firing for nothing.

### Channels

| Control | Description |
| --- | --- |
| 「新增渠道」 / 「创建第一个」 | Open the channel dialog |
| Enable switch | Per-channel on/off; disabled channels never fire |
| 「测试发送」 (send test) | Send a test message now; pending edits are flushed first |
| 「编辑」 | Edit the channel |
| 「删除」 | Remove the channel |

Channel dialog fields:

| Type | Fields |
| --- | --- |
| Common | Type (`Webhook` / 邮件), 「渠道 ID」, 「显示名」 |
| Webhook | 「Webhook URL」, 「请求头」 rows, 「Body 模板」 |
| Email | SMTP host, port, username, password, implicit TLS, sender, recipients, subject template, body template |

A body template starting with `<` is sent as HTML, otherwise as plain text.

Template variables: `{uin}`, `{nickname}`, `{event}`, `{time}`, `{status}`, `{pid}`, `{error}`.

**Example**: create a webhook channel with URL `https://hooks.example.invalid/nowluma` and body template:

```json
{"text":"{nickname}({uin}) {event} at {time}"}
```

Save, then press 「测试发送」. Expected result: your receiver gets a test message; on failure the error appears in place rather than pretending to succeed.

**Careful**: webhook URLs and SMTP passwords are credentials. They are written into configuration and may be included in a backup exported with sensitive configuration. Do not screenshot channel settings into public places.

**Per-account opt-in** lives under [Endpoint configuration](onebot-config.md#notification-opt-in), not here.

## Service

A permanent notice tops the page: listener settings (port, bind address, HTTPS) are service-level, take effect only after restarting Nowluma, and this machine has no automatic restart.

Remember it: **the console cannot restart the listener for you**. After saving, restart the service yourself — `bash deploy/manage.sh restart` in Docker, or restart the program natively.

### Service listener

| Field | Description |
| --- | --- |
| 「端口」 | Console listener port, default `5099` |
| 「绑定地址」 | Quick buttons 「仅本机」 = `127.0.0.1` and 「所有网卡」 = `0.0.0.0`; choosing all interfaces warns that LAN access is enabled and recommends HTTPS plus strong credentials |
| 「信任代理 (trust-proxy)」 | Empty trusts only the socket peer; `1` trusts reverse-proxy headers |
| 「自动连接已打开的 QQ」 | Takes effect after restart; **this is not QQ auto-login** |
| 「保存」 | Submit |

Fields overridden by environment variables show 「被环境变量覆盖」 and are disabled.

Set `trustProxy` only when requests really come from your trusted proxy. Trusting forwarded headers from the public internet defeats origin checks.

### QQ desktop (noVNC)

| Field | Description |
| --- | --- |
| 「noVNC 端口」 | Port used for the desktop entry |
| 「桌面地址（可选）」 | External desktop URL |
| 「保存入口设置」 | Changes the entry only, not the desktop service listener |
| 「打开 QQ 桌面」 | Open the entry |

When the port is 0 and the address is empty, the entry is hidden. The hint states that this setting only changes the entry, never the desktop service port, and never passes the console token or the QQ password.

In Docker the desktop is reached through the same-origin `/desktop/` path using the console session, so **no separate VNC password is required**; `bash deploy/manage.sh vnc-password` says exactly that. The backend VNC still listens on loopback with its own authentication.

### HTTPS / TLS

| Control | Description |
| --- | --- |
| 「启用 HTTPS」 | Toggle |
| Certificate PEM / private key PEM | Paste and press 「保存证书」 |
| Installed state | 「证书与私钥已安装（出于安全不回显，未改变。）」 plus 「更改证书」 and 「删除证书」 |

Behaviour:

- An invalid certificate is rejected; there is no “good enough” fallback.
- A TLS configuration error prevents startup instead of silently downgrading to HTTP.
- Deleting the certificate asks for confirmation (「删除 TLS 证书？」). If HTTPS stays enabled, the next start may fail.

### Configuration backup and restore

| Control | Description |
| --- | --- |
| 「导出时包含敏感配置」 | Include credentials in the export; a red warning lists what that covers: console session state, TLS private key, notification URLs, OneBot tokens |
| 「导出备份」 | Download the backup |
| 「选择备份文件并恢复」 | Import; confirm with 「恢复配置备份？」 |
| Restore result | 「已恢复 N 项」, 「跳过 N 项（敏感配置，含 OneBot 配置）」, 「兼容转换 N 项」, 「重启后生效」 |

Restore is **overwriting**: it replaces the current configuration and usually needs a restart to fully apply. Restoring without a backup means throwing away the current configuration.

### Runtime environment and save locations

The diagnostics card shows:

- Program working directory, current service HOME, program config, messages and media, runtime logs.
- On Linux, an extra `Linux 默认 QQ 配置` row.
- A 「可写」 (writable) or 「未创建或不可写」 (not created or not writable) badge per directory.
- 「复制诊断」 (copies without credentials) and 「刷新状态」.

Two rules are stated next to it: the data volumes must be preserved in full (including QQ's entire HOME), and **never use `down -v`**.

## Advanced

### Custom CSS

| Control | Description |
| --- | --- |
| Textarea | Up to 50 000 characters |
| Snippet buttons | Insert a snippet for sidebar font size, frosted cards, hidden scrollbars, bolder headings, compact cards |
| Validation | On blur it checks unbalanced braces, an empty rule set and parse failures; it **never blocks saving** |
| 「清空」 | Clear all custom CSS |

- Custom CSS applies after sign-in only; the login page is unaffected.
- It is preserved but suspended while a host manages appearance.
- If you break the interface, add `?safe-mode=1` to the URL: that parameter skips custom CSS so you can get in and fix it.

**Example**: paste a rule that shrinks the sidebar font → save → warnings may appear but the save still succeeds → the interface changes immediately. If the page becomes unusable, open `https://your-host/?safe-mode=1`, delete the rule and save again.

### Backup and reset

| Control | Description |
| --- | --- |
| 「导出」 | Download `nowluma-ui-config.json` (appearance, layout, page preferences, custom CSS) |
| 「导入」 | Choose a JSON file up to 256 KB, confirm 「导入并覆盖界面配置？」, then the page reloads |
| 「重置全部」 | Confirm 「重置全部界面配置」 with the note 「此操作不可逆。」 |

Scope: **interface** configuration only. Background images are not in the export and must be re-uploaded; accounts, connections and message data are not there either — those are covered by the [service backup](settings-runtime.md#configuration-backup-and-restore) and [Data, backup and updates](data-backup.md).

## Developer

| Card | Action | Effect |
| --- | --- | --- |
| 「界面测试」 → 「首次使用引导」 | 「重新进入」 | Replays the two onboarding steps in rehearsal mode without changing the consent record or the real access password |
| 「界面测试」 → 「崩溃界面」 | 「触发崩溃」 | Throws on purpose and renders the crash screen; 「重试」 on that screen returns you |

Both are always visible regardless of deployment environment. They only exercise interface paths and produce no business side effects.

## About

- Brand area: product name, version, subtitle, one-line summary.
- 「软件更新」 (software update): current version, 「检查更新」 with the states 「已是最新」 (up to date), 「发现新版本」 (new version found), 「检查已关闭」 (checking disabled), 「无法检查」 (cannot check); 「重新检查」; release notes and a 「发布说明」 link.
- Download source mode: `自动切换` (auto), `GitHub 直连` (direct), `指定镜像` (mirror); a mirror list with one entry per line; 「测试」 with per-mirror results; 「仅保留可用镜像」; save.
- Update installer: download and restart. When ready it shows 「更新已就绪 · 重启后生效」 and asks for confirmation before restarting; progress polls once per second while downloading.
- Support card: 「去 GitHub 点 Star」 plus links to the repository, releases and issue tracker.

Honest notes about updates:

- 「检查已关闭」 means this build has no usable update source — not a network error.
- Running from source or without release metadata may show 「无法检查」.
- Restarting interrupts every connected bot; pick a quiet moment.
- Mirror URLs are yours to supply; this documentation recommends and verifies no third-party mirror.

## Save and effect summary for this section

| Setting | Saved by | Takes effect | Restart |
| --- | --- | --- | --- |
| Global config | Auto (500 ms debounce) | Immediately | No |
| Log policy | 「保存并应用」 | Immediately (refreshed snapshot returned) | No |
| Data cleanup | Confirmation, then executes | Immediately, irreversible | No |
| Notification channels | Auto (350 ms debounce) | Immediately | No |
| Listener / desktop entry / auto-connect | 「保存」 | `restartRequiredToApply` where relevant | **Yes** |
| TLS certificate | 「保存证书」 / 「删除证书」 | Loaded on next start | **Yes** |
| Configuration restore | Import | Partly immediate, rest after restart | Usually |
| Custom CSS | On blur | Immediately | No |
| UI configuration import/reset | Import / reset | Page reload after import | No |
| Update download | 「下载」 | 「重启后生效」 (after restart) | **Yes** |

## Destructive actions at a glance

| Action | Confirmation text | Consequence |
| --- | --- | --- |
| Clear logs / temp data / one account category / all accounts | 「确认清理」 plus typing `清理全部账号` | Files deleted, irreversible |
| Delete the TLS certificate | 「删除 TLS 证书？」 | If HTTPS stays on, the next start may fail |
| Restore a backup | 「恢复配置备份？」 | Overwrites current configuration; may include credentials |
| Import a UI configuration | 「导入并覆盖界面配置？」 | Overwrites appearance/layout/page prefs/CSS and reloads |
| Reset all UI configuration | 「重置全部界面配置」 + 「不可逆」 | All interface customisation is lost |
| Restart the application (after an update) | Restart confirmation | Every connected bot is interrupted |
