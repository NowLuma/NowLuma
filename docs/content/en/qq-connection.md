---
title: QQ connection
description: Loading and unloading QQ processes, understanding every process state, opening the QQ desktop, and recovering from failed injection or disconnects.
---

# QQ connection

The 「QQ 连接」 page (`/processes`) does exactly one thing: it installs the bridge into a QQ process **already running on your machine**. It does not start QQ and does not sign in to QQ.

The subtitle is explicit: 「加载后，已登录账号将自动接入 OneBot」 *(once loaded, a signed-in account is bridged to OneBot automatically)*.

## Page structure

| Area | Contents |
| --- | --- |
| Card header | 「QQ 连接」 plus the subtitle above |
| 「打开 QQ 桌面」 (Open QQ desktop) | Only shown when a desktop entry is configured; available by default in Docker |
| Sort | 「PID」 / 「名称」 / 「状态」, shown only when more than one process exists; the choice is remembered |
| 「刷新」 (refresh) | Re-read the process list; disabled until the first read settles |
| Process cards | Avatar (or CPU icon), name, status badge, `PID {n} · QQ {uin}`, process path, error line |
| Actions | 「加载」 (load) or 「卸载」 (unload), plus a conditional refresh icon |

## States and what they mean

| State | Meaning | Next step |
| --- | --- | --- |
| 可加载 (loadable) | QQ main process found, not yet injected | Press 「加载」 |
| 加载中 (loading) | Injection in progress | Wait; the button reads 「加载中」 |
| 等待连接 (waiting for connection) | Injected, waiting for the local pipe | Wait, or use the refresh icon to reconnect |
| 等待登录 (waiting for sign-in) | Pipe is up, the account has not signed in | Sign in inside QQ |
| 已在线 (online) | Signed in and recognised | Go to 「节点配置」 and add endpoints |
| 错误 (error) | The last operation failed | Read the card's error line, see below |
| 已断开 (disconnected) | Was bridged, now disconnected | Press the refresh icon (refresh pipe state / reconnect) |

The refresh icon only appears when the process is bridged, connecting or disconnected. It re-reads the pipe state and attempts a reconnect.

## Loading an account

1. Start and sign in to QQ yourself (or use 「打开 QQ 桌面」 and do it there).
2. Back on this page, press 「刷新」 and confirm the process appears as 「可加载」.
3. Press 「加载」 on the card.
4. The 「确认加载 Nowluma？」 dialog explains that loading **injects into that PID**.
5. Confirm and watch the state change.

**Expected result**: the state moves through 「加载中」 → 「等待连接」 → 「等待登录」 → 「已在线」, and the QQ number appears on the card. The in-flight banner reports messages such as injecting into process `{pid}` and waiting for the pipe connection.

**If it stops at 「等待登录」**: the program is attached but QQ is not signed in yet. Complete the QR/verification in QQ, then press 「刷新」.

## Unloading

Pressing 「卸载」 opens 「确认卸载 Nowluma？」. The confirmation states that unloading may drop the live session and take the bot offline with it.

- The banner shows the unload in progress and then reports it finished.
- If the pipe is still alive afterwards, a separate 「卸载失败」 (unload failed) dialog appears with the advice 「如需彻底卸载，请重启 QQ。」 *(restart QQ for a complete unload)*.

**When to unload**: upgrading the bridge, diagnosing conflicts, or deliberately taking an account offline. Routine bot on/off does not need it — disable the endpoint in 「节点配置」 instead.

## Opening the QQ desktop

「打开 QQ 桌面」 is the only entry point in this project that relates to QQ sign-in. It opens the real QQ desktop running on the server, not a mock window.

| Fact | Detail |
| --- | --- |
| Authentication | Reuses the current console session through a path-scoped HttpOnly cookie. Neither the console token nor a VNC password is placed in the URL |
| Backend VNC | Listens on loopback `5900` only, keeps its own password authentication, and the gateway authenticates server-side without returning that password to the browser |
| Ports | Docker publishes a single management port, 5099. **6080 is not published** |
| Lifecycle | After sign-out, a password change or session expiry the desktop cannot be operated; idle connections are closed |
| External desktop URL | You may configure an external address under service settings. That service protects itself and does not inherit the console session |

QR codes, SMS verification and device locks all happen inside QQ's own UI. The program neither stores your QQ password nor forges login credentials.

After scanning, enable automatic login in **QQ's own settings**. That step belongs to QQ; the program cannot do it for you.

## Example — a freshly installed Docker host

1. Click 「打开 QQ 桌面」 on the overview, start QQ inside it, scan the QR code, enable automatic login.
2. Return to 「QQ 连接」 and press 「刷新」.
3. The card shows 「可加载」; press 「加载」 and confirm.
4. **Expected result**: within seconds it becomes 「等待登录」, then 「已在线」 once sign-in is recognised, with a card reading `PID 1234 · QQ 10001` (example values).

Docker enables `hookAutoLoad` by default, meaning the program tries to bridge an already-running, signed-in QQ on startup. It is **not** QQ auto-login and will not scan a QR code for you.

## Empty states, errors and stale data

| Interface | Trigger | What to do |
| --- | --- | --- |
| 「未检测到可加载 QQ 主进程」 + 「启动 QQ 后刷新」 | No bridgeable QQ on this machine | Start QQ; in Docker confirm QQ is really running (`manage.sh doctor`) |
| Red error panel + 「重试」 | Reading the process list failed | Read the error text; check permissions and container state |
| “…; current display shows the last successfully read process state.” | This read failed but cached data exists | The data is stale — do not judge the current state from it |
| Card error line | Inject or unload failed | Record the text and compare with the table below |

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| QQ does not appear at all | QQ not started, architecture mismatch, or the container's QQ exited | Start QQ; in Docker check `manage.sh logs` for Xvfb/QQ output |
| Stuck on 「加载中」 | Injection rejected (privileges/integrity) | Linux Docker needs `SYS_PTRACE`; on Windows watch the low-integrity warning |
| 「等待连接」 never advances | The pipe did not connect | Press the refresh icon; if it still fails read the bridge lines in the log |
| 「已在线」 but the bot gets nothing | Two different layers | Check endpoints and tokens in [Endpoint configuration](onebot-config.md) |
| Unload keeps reporting failure | The pipe did not fully exit | Restart QQ, then load again |

## Save and restart semantics

| Action | Persisted | Scope |
| --- | --- | --- |
| Load / unload | No, runtime state only | Current process; a program restart means bridging again unless auto-load is on |
| Auto-connect to an already-open QQ | Yes (service settings) | Takes effect after a **program restart** |
| Sort choice | Yes (page preference) | Immediately |
| Open QQ desktop | No | Current browser tab |

The most common misunderstanding: QQ's automatic login lives in QQ's own HOME and has nothing to do with program configuration. Docker must preserve the whole `/home/nowluma` for the device state to continue — and even then, whether QQ accepts the session is still QQ's decision.

Next: [Endpoint configuration](onebot-config.md), [Data, backup and updates](data-backup.md#qq-persistence-and-manual-verification).
