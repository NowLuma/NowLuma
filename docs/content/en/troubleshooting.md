---
title: Troubleshooting
description: Locate login, QQ attach, account-kernel, desktop, bot, data and UI problems, and recover without deleting data or faking success.
tutorial: troubleshooting
---

# Troubleshooting

Identify which layer is failing, capture the original error, and change one thing at a time.

![Runtime directories and deployment diagnostics](/images/tutorials/deployment-diagnostics.png)

## Where to look

| Symptom                                         | Start                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| Console unreachable or login fails              | “Login and console”; [Access and network](access-network.md)      |
| No QQ, attach fails, new kernel acknowledgement | “QQ sessions and account kernel”; [QQ sessions](qq-connection.md) |
| Desktop blank or disconnected                   | “Desktop”                                                         |
| Bot receives nothing                            | “Bot connections”; [Bot connections](onebot-config.md)            |
| Messages, logs or databases                     | “Data and storage”; [Run log](logs.md)                            |
| Layout or animation problems                    | “Pages and appearance”                                            |

Run first:

```bash
nowluma doctor
nowluma logs
```

On an older install without `nowluma`, use `bash deploy/manage.sh doctor` and `bash deploy/manage.sh logs`. For native installs, check the startup terminal and `logs/`.

## Login and console

- **`nowluma` not found**: older or unregistered install. Rerun the installer with the existing directory, or keep using `bash deploy/manage.sh`; for non-root installs add `~/.local/bin` to `PATH`, or rerun the wizard with `NOWLUMA_BIN_DIR` set to another directory.
- **Stuck at `初始化中…`**: service not running, port conflict, or `/api/` rewritten by a proxy.
- **`登录失败`**: use the console access password, not the QQ password; if 2FA is on, supply the code or recovery code.
- **`协议状态加载失败`**: notice state cannot be confirmed and entry is refused. Check `/api/agreements`, proxy rewrites and server time, then `重新加载`.
- **Logged out immediately**: rewritten cookies, Host/protocol mismatch, clock skew, or another session’s password change expired yours.
- **Forgot password / lost 2FA**: back up and reset `config/webui.json` per [First run](first-run.md#forgot-password-or-lost-2fa); 2FA and sessions are cleared.

## QQ sessions and account kernel

| Symptom                                    | Cause and action                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `未检测到可加载 QQ 主进程`                 | Open and log in to QQ, then refresh; Docker needs `/proc`, `SYS_PTRACE` and matching users           |
| Stuck at `加载中`                          | Check native component architecture and permissions once an error appears                            |
| Stuck at `等待连接`                        | Use `刷新管道`; then check ports, permissions and the log                                            |
| Stuck at `等待登录`                        | Complete login inside QQ, then `已登录，检查状态`                                                    |
| Online but no bot messages                 | Check endpoints and tokens in [Bot connections](onebot-config.md)                                    |
| Kernel dialog does not open                | No real UIN recognized; log in to QQ first, then choose the account                                 |
| Asked to confirm again                     | Confirm for the current UIN and risk version                                                        |
| `重写内核` unavailable                     | Use the compatibility kernel; see [Roadmap](planned.md#rewrite-kernel)                               |
| Saved kernel choice but not attached       | Press `加载`; see [when auto-connect applies](qq-connection.md#saving-is-not-attaching)              |
| Local account differs from channel account | Check which account is signed in to QQ, then retry                                                   |
| Unload failed                              | Restart QQ as prompted; configuration and QQ data remain                                             |

If you unloaded a process, press `加载` to resume it.

## Desktop

- **Entry missing**: check [the server's desktop gateway](qq-connection.md#open-qq-desktop) or use the local QQ window on a native install.
- **Blank/unreachable**: valid console session, onboarding complete, and `/desktop/` plus WebSocket preserved by the proxy.
- **Authentication fails**: the desktop reuses the console session; no separate VNC password is entered.
- **QQ does not auto-login**: QQ behaviour. Check the full HOME volume, QQ auto-login setting and server session; see [manual verification](data-backup.md#qq-persistence-and-manual-verification).

## Bot connections

- **Cannot connect**: enabled, address, port, path and token. Copied addresses exclude tokens.
- **`未启用`**: turn the toggle on; deleting is not pausing.
- **`应用失败`**: saved but hot reload failed; read the hover error and log, fix, save again.
- **Token change dropped bots**: expected; update and reconnect them.
- **Saved while offline**: shows `已保存，下次连接时应用`; verify after attach.
- **Multiple accounts**: assign a distinct port to each listener.

## Data and storage

- **Disk full**: inspect Storage usage, clean logs or inactive temporary data; never delete QQ HOME.
- **Database preparing**: wait for migration; failures preserve files and retry. Do not start multiple instances.
- **Corrupt configuration**: the program reports and preserves it; restore from backup, do not overwrite with defaults.
- **QR scan required after restart**: complete the verification in QQ.
- **Accounts missing after upgrade**: volumes/directories mounted, UID consistent, no `down -v`.
- **Still on the old version after updating**: `nowluma update` only reapplies the saved image; switch versions explicitly with `nowluma update 2.5.1`. If the new version fails to start, `.env` keeps the old image; run `nowluma start` to restore it and check `nowluma logs`.

## Pages and appearance

- **Broken layout**: `恢复默认`; it resets layout only.
- **Navigation item missing**: `工作台` and `偏好设置` cannot be hidden; restore others under `工作区管理` → `调整导航`.
- **Page broken**: append `?safe-mode=1` to disable custom CSS temporarily.
- **Too much animation**: try `减弱动效` and `关闭全部动效`; the system reduced-motion setting wins.
- **Still slow in low mode**: try removing the wallpaper, reducing widgets, or using a lighter browser.
- **Low contrast**: enable high contrast; a low-contrast accent offers a reset.

## Logs and debug

- Stream `未连接`: check service/network, press refresh; already-read entries remain.
- Missing events: clear search, check level filters and auto-scroll.
- TRACE export fails: TRACE enabled, file exists, disk writable.
- **Debug call fails**: record the error. Before retrying a write, verify whether it already took effect.

## Recovery matrix

| Action                          | Scope                                      | Reversible?                                  |
| ------------------------------- | ------------------------------------------ | -------------------------------------------- |
| `恢复默认` layout               | Widget layout and settings                 | Re-editable; old layout not restored         |
| `重置全部` UI config            | Appearance, layout, navigation, custom CSS | Not reversible; accounts/messages unaffected |
| Remove `config/webui.json`      | Password, 2FA, sessions                    | Restorable from backup; account data remains |
| Clean account database category | Selected messages/media/reactions          | Irreversible; back up first                  |
| `down -v` / delete volumes      | All program data and QQ HOME               | Irreversible; never for upgrades             |
| Unload QQ injection             | Current session disconnects                | Re-attachable; config/data remain            |

Before using a recovery action that changes data, stop the service and [check your backup](data-backup.md#backup).
