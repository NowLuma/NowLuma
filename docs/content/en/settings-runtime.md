---
title: 'Settings: runtime and services'
description: Global config, storage cleanup, notification channels, WebUI and desktop services, TLS, configuration backup, updates and developer tools.
tutorial: settings-runtime
---

# Settings: runtime and services

Keep a working SSH or other recovery path before changing the listener.

![Service listener and runtime settings](/images/tutorials/settings-service.png)

These categories control how the service runs, how long data is kept, where notifications go and how updates are installed. Appearance and account settings are in [Settings: appearance and account](settings-console.md).

## Global config

| Setting                  | Effect                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| rkey fallback            | Ordered services used when the kernel cannot obtain an rkey; empty disables it; self-hosting is recommended |
| Video upload connections | 1–4; applies to the next upload; short videos stay single-connection                                        |
| Music signing service    | Signing endpoint for music cards; empty uses the built-in service                                           |

Success reads `全局配置已更新`; invalid entries are reported as ignored rather than silently counted as fully saved. Configuration lives under `config/`, not in the account database.

## Storage

`空间用量` totals logs, account databases and temporary transfer data; the log section shows file count, active files and dropped lines.

### Log retention

- `日志总量上限（MB）`: must be greater than 0 and always applies.
- `保留天数`: `0` means eviction by size only.
- `按账号额外写入日志`: duplicate account-context lines into per-account folders, increasing usage.
- `保存并应用` takes effect immediately; no restart.

### Cleanup

| Item                    | Behaviour                                                                   |
| ----------------------- | --------------------------------------------------------------------------- |
| Logs                    | Rotate active files first, then delete old logs, keeping a fresh empty file |
| Temporary transfer data | Delete inactive items; active uploads/downloads are kept                    |
| Account databases       | Per account and category: message history, media index, reactions           |

Account cleanup removes only the selected category and sidecar files. It does not remove configuration, credentials or exported chats. Online accounts cannot be cleaned; “all accounts” requires every account offline and a confirmation phrase. Deletion is irreversible; back up first.

## Notifications

`去抖窗口（秒）` controls online/offline notifications: a disconnect must last beyond the window before notifying, and recovery notifies too. `0` notifies immediately.

`通知渠道` supports Webhook and email. A channel needs an ID and display name, plus:

- Webhook: URL and optional headers.
- Email: SMTP host, port, username, password/authorisation code, sender, recipients, subject template.

Use **Test send** to check the channel. To receive a particular account's events, save the channel and select it under Bot connections → `消息行为` → `上下线通知渠道`.

## Services

### WebUI listener

- `端口`: default `5099`.
- `绑定地址`: `127.0.0.1` local only, `0.0.0.0` all interfaces; the UI warns to use HTTPS and strong credentials for LAN.
- `信任代理 (trust-proxy)`: only behind a trusted reverse proxy.
- `自动连接已打开的 QQ`: after restart, automatically attaches signed-in QQ accounts with a recognized UIN and current-risk-version compatibility acknowledgement. For first attach and manual stops, see [QQ sessions](qq-connection.md#saving-is-not-attaching).

Restart Nowluma after changing listener settings.

### QQ desktop

`noVNC 端口` and `桌面地址（可选）` can be saved. To enable the built-in desktop entry, the Linux server must apply the [same-origin desktop gateway](access-network.md#desktop-authentication).

### HTTPS / TLS

Install a valid PEM certificate and private key. The key is written only to `config/key.pem` (0600) and never echoed. Invalid certificates are rejected. Once TLS is enabled, a certificate that cannot load makes startup fail rather than silently serving HTTP.

### Service configuration backup

Backs up appearance, service settings and certificates; it does not include message databases. Notification channels, OneBot configuration and per-account kernel choices (`kernel-selections.json`) are included only when sensitive export is enabled. Without sensitive files, these are skipped and no risk consent is implied.

- Sensitive export also includes WebUI login state, the TLS private key, channel URLs, OneBot tokens and per-UIN kernel choices.
- Kernel choices are parsed strictly on restore; malformed data, a false acknowledgement or an invalid UIN is rejected, and restored files use mode 0600. An old risk version or rewrite choice is preserved as-is but does not become authorized.
- Restoring sensitive data overwrites the current login state, key, channels and tokens; an unknown backup password can lock you out. Older backups without kernel choices remain valid.
- The restore validates first and rolls back failed writes; restart after success. A service snapshot replaces desired configuration only; it does not hot-change live kernel authorization or process state.

### Runtime and storage locations

Shows the working directory, service HOME, config/data/log paths and writability, with `复制诊断`. It does not export tokens, passwords or QQ login databases.

## Advanced

`自定义 CSS` applies after login, not to the login page, up to 50,000 characters. Use `?safe-mode=1` to disable it temporarily if the UI breaks.

`备份与重置` exports/imports appearance, layout and custom CSS (max 256 KB); wallpapers must be re-uploaded. `重置全部` restores appearance, dashboard layout, navigation and custom CSS to defaults and cannot be undone. It does not delete accounts, messages or connections.

## Developer

- `重新进入`: replay the onboarding in rehearsal mode without changing the notice record or real password.
- `触发崩溃`: raise a test exception for the error boundary; `重试` returns.

Both are always visible for UI testing and do not depend on an environment switch.

## About

Shows the current version, update check and state:

- `重新检查` queries the latest release; when checks are disabled it reads `检查已关闭`.
- `更新来源`: auto, GitHub direct or a specified mirror. Auto tries GitHub first, then the other sources in order. Use `检测可用性` to check reachability and `保存来源` to save.
- When an update exists, `下载更新`; when ready, `重启并更新`. Connections drop briefly; configuration and data remain.

`项目与许可` links source, releases, issues and GPLv3, and states that commercial use is allowed and native/third-party components follow their own terms. The infringement mailbox is for infringement complaints only, not general support, commercial enquiries or privacy requests.

Update checks use the network, but the current source contains no analytics or telemetry; see `PRIVACY.md`.

## Save and restart

| Item                                                | After saving                                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Global config, notifications, log retention         | Applied immediately; normally no restart                                                                 |
| WebUI port, bind address, trust proxy, auto-connect | Restart Nowluma                                                                                          |
| Desktop entry                                       | Decided by the server's applied gateway capability; setting a port/address alone does not make it appear |
| TLS certificate                                     | Restart with the new certificate                                                                         |
| Restore service backup                              | Restart                                                                                                  |
| Update                                              | After restart-and-update                                                                                 |
