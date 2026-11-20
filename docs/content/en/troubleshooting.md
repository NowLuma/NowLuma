---
title: Troubleshooting
description: Locate login, QQ attach, account-kernel, desktop, bot, data and UI problems, and recover without deleting data or faking success.
---

# Troubleshooting

Identify the layer first, then open the matching page. Do not “fix” a symptom by deleting data, disabling isolation or fabricating success.

## Where to look

| Symptom | Start |
| --- | --- |
| Console unreachable or login fails | “Login and console”; [Access and network](access-network.md) |
| No QQ, attach fails, new kernel acknowledgement | “QQ sessions and account kernel”; [QQ sessions](qq-connection.md) |
| Desktop blank or disconnected | “Desktop” |
| Bot receives nothing | “Bot connections”; [Bot connections](onebot-config.md) |
| Messages, logs or databases | “Data and storage”; [Run log](logs.md) |
| Layout or animation problems | “Pages and appearance” |

Run first:

```bash
bash deploy/manage.sh doctor
bash deploy/manage.sh logs
```

For native installs use the startup terminal and `logs/`. An error in the log is not a completed install.

## Login and console

- **Stuck at `初始化中…`**: service not running, port conflict, or `/api/` rewritten by a proxy.
- **`登录失败`**: use the console access password, not the QQ password; if 2FA is on, supply the code or recovery code.
- **`协议状态加载失败`**: notice state cannot be confirmed and entry is refused. Check `/api/agreements`, proxy rewrites and server time, then `重新加载`.
- **Logged out immediately**: rewritten cookies, Host/protocol mismatch, clock skew, or another session’s password change expired yours.
- **Forgot password / lost 2FA**: back up and reset `config/webui.json` per [First run](first-run.md#forgot-password-or-lost-2fa); 2FA and sessions are cleared.

## QQ sessions and account kernel

| Symptom | Cause and action |
| --- | --- |
| `未检测到可加载 QQ 主进程` | Open and log in to QQ, then refresh; Docker needs `/proc`, `SYS_PTRACE` and matching users |
| Stuck at `加载中` | Native component architecture or permission problem; wait for an error, do not spam clicks |
| Stuck at `等待连接` | Use `刷新管道`; then check ports, permissions and the log |
| Stuck at `等待登录` | Complete login inside QQ, then `已登录，检查状态` |
| Online but no bot messages | Check endpoints and tokens in [Bot connections](onebot-config.md) |
| Kernel dialog does not open | No real UIN recognized; log in to QQ first and choose the account. A PID is never used as an account |
| Asked to confirm again | Different UIN, changed identity or new risk version; expected per-account isolation |
| `重写内核` unavailable | Unverified; there is no hidden fallback or fake selection |
| Saved kernel choice but not attached | Saving is not attaching; press `加载`. With auto-connect enabled, an UIN with a current acknowledgement can attach after QQ login |
| Local account differs from channel account | Re-check login; the app does not guess the correct one |
| Unload failed | Restart QQ as prompted; configuration and QQ data remain |

Auto-connect, existing-pipe reconnect and CLI startup cannot bypass kernel confirmation. A new account cannot reuse the previous PID’s acknowledgement. A PID explicitly unloaded stays manually stopped; refresh and auto-connect do not attach it again; press `加载` to resume.

## Desktop

- **Entry missing**: the server did not report an applied same-origin desktop capability (Windows native, an old server, or only a VNC address); do not force it with an external address.
- **Blank/unreachable**: valid console session, onboarding complete, and `/desktop/` plus WebSocket preserved by the proxy.
- **Authentication fails**: the desktop reuses the console session; no separate VNC password is entered.
- **QQ does not auto-login**: QQ behaviour. Check the full HOME volume, QQ auto-login setting and server session; see [manual verification](data-backup.md#qq-persistence-and-manual-verification).

## Bot connections

- **Cannot connect**: enabled, address, port, path and token. Copied addresses exclude tokens.
- **`未启用`**: turn the toggle on; deleting is not pausing.
- **`应用失败`**: saved but hot reload failed; read the hover error and log, fix, save again.
- **Token change dropped bots**: expected; update and reconnect them.
- **Saved while offline**: shows `已保存，下次连接时应用`; verify after attach.
- **Multiple accounts**: listener ports must differ; one working account does not prove the others.

## Data and storage

- **Disk full**: inspect Storage usage, clean logs or inactive temporary data; never delete QQ HOME.
- **Database preparing**: wait for migration; failures preserve files and retry. Do not start multiple instances.
- **Corrupt configuration**: the program reports and preserves it; restore from backup, do not overwrite with defaults.
- **QR scan required after restart**: files remaining does not mean the server session is valid; verify in QQ.
- **Accounts missing after upgrade**: volumes/directories mounted, UID consistent, no `down -v`.

## Pages and appearance

- **Broken layout**: `恢复默认`; it resets layout only.
- **Navigation item missing**: `工作台` and `偏好设置` cannot be hidden; restore others under `工作区管理` → `调整导航`.
- **Page broken**: append `?safe-mode=1` to disable custom CSS temporarily.
- **Too much animation**: try `减弱动效` and `关闭全部动效`; the system reduced-motion setting wins.
- **Still slow in low mode**: low performance only simplifies refraction and displacement; reduce wallpaper/widgets or use a lighter browser. No FPS guarantee.
- **Low contrast**: enable high contrast; a low-contrast accent offers a reset.

## Logs and debug

- Stream `未连接`: check service/network, press refresh; already-read entries remain.
- Missing events: clear search, check level filters and auto-scroll.
- TRACE export fails: TRACE enabled, file exists, disk writable.
- Debug call fails: keep the error; side-effect actions only run after confirmation and are not retried blindly.

## Recovery matrix

| Action | Scope | Reversible? |
| --- | --- | --- |
| `恢复默认` layout | Widget layout and settings | Re-editable; old layout not restored |
| `重置全部` UI config | Appearance, layout, navigation, custom CSS | Not reversible; accounts/messages unaffected |
| Remove `config/webui.json` | Password, 2FA, sessions | Restorable from backup; account data remains |
| Clean account database category | Selected messages/media/reactions | Irreversible; back up first |
| `down -v` / delete volumes | All program data and QQ HOME | Irreversible; never for upgrades |
| Unload QQ injection | Current session disconnects | Re-attachable; config/data remain |

When unsure: stop, back up, change one thing. Record the actual command, exit status and original error instead of repeating attempts.
