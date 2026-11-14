---
title: What Nowluma is
description: Capability boundaries, three different senses of online/offline, the three persistence families, and the current platform support status.
---

# What Nowluma is

Nowluma has two halves:

1. **The bridge**: it finds a QQ client already running on the same machine and exposes that account over the OneBot v11 protocol for bot programs.
2. **The console**: a Chinese-language browser UI with six pages — overview, QQ connections, endpoint configuration, logs, debug and settings.

QQ sign-in always happens in QQ. The program does not sign in for you, does not store your QQ password, does not forge device tokens, and does not need your QQ profile directory moved anywhere.

## What it does not do

| Common assumption | Reality |
| --- | --- |
| The console signs me into QQ | No. Scanning, verification and QQ's own auto-login setting all happen in the QQ window, including the one inside 「打开 QQ 桌面」 (Open QQ desktop). |
| The access password is the QQ login | No. It only unlocks the console and has nothing to do with the QQ account. |
| An endpoint showing 「正常」 (ok) means the bot works | No. It means a listener is bound or a connection is established; see the status table below. |
| A configuration change takes effect immediately | Not always. Most settings must be saved; some need a restart, others wait for the account to connect. |
| Keeping local data guarantees no QR scan | Not guaranteed. Local credentials only avoid creating a new environment; whether QQ accepts the session is QQ's decision. |

## Three different senses of online/offline

The same word means different things in different places. This is the most common source of misdiagnosis.

| Phrase | Where | What it really means | How to confirm |
| --- | --- | --- | --- |
| Console connected | Top bar connection badge | The browser's console session is still valid | The page stops asking you to sign in; when the session dies you are returned to the login gate |
| Account online | 「QQ 连接」 (QQ connections) page, 「在线账号」 (online accounts) widget | That QQ process has completed sign-in and been recognised | The card says 「已在线」 and shows the UIN |
| Endpoint ok | Node cards in 「节点配置」, the 「OneBot 连接」 widget | The port is listening, or a reverse connection is established | Card status chip. The bot program **still** has to hold the right token and work correctly |
| Account mapping offline | Notification event `{event}` | The account went from online to offline, subject to the debounce window | See [Notifications](settings-runtime.md#notifications) |

## Three different senses of “saved”

The console has three independent persistence families. Treating them as one leads to wrong conclusions.

| Family | Stored where | When it takes effect | Failure mode |
| --- | --- | --- | --- |
| UI preferences (appearance, layout, page prefs, global config, notifications) | UI configuration file in the program config directory | Auto-saved with debounce; applied in the browser immediately | A bottom-right notice such as 「外观同步失败」 (appearance sync failed). The local value still applies but was not persisted |
| Per-account OneBot configuration | That account's config file | After clicking 「保存」 (Save), using the result the server returns | The save-state chip names the reason |
| Service-level settings (listener, TLS, backup restore, updates) | Program config directory | After 「保存」, with a notice about whether a restart is needed | Inline error, existing configuration preserved |

The classic “stored but not applied” message is 「已保存，下次连接时应用」 (saved, applied on next connection). Only 「已保存并应用」 (saved and applied) means the running endpoint was replaced.

### A concrete example

1. Open 「节点配置」 (Endpoint configuration), select an account that is **not currently online**, and create a node under 「HTTP API」 on port `3000`.
2. Click 「保存」 (Save).
3. Expected result: the save chip says 「已保存，下次连接时应用」 (saved, applied on next connection).

Why: the server cannot hot-reload endpoints for an account that is not online. Once you load the account from 「QQ 连接」, it will actually listen on 3000.

## Status vocabulary

QQ process (cards on 「QQ 连接」):

| Label | Meaning |
| --- | --- |
| 可加载 (loadable) | QQ main process found, not yet bridged |
| 加载中 (loading) | Injecting the bridge into that process |
| 等待连接 (waiting for connection) | Injected, waiting for the local pipe |
| 等待登录 (waiting for sign-in) | Pipe is up, the account has not signed in |
| 已在线 (online) | Signed in and recognised |
| 错误 (error) | The last operation failed; the card shows an error line |
| 已断开 (disconnected) | Was bridged, now disconnected |

OneBot endpoints (node cards and the overview widget):

| Label | Meaning |
| --- | --- |
| 正常 (ok) | HTTP is listening / WS is connected |
| 注意 (warn) | A recoverable issue, such as a recent error |
| 异常 (down) | Listen or connect failed |
| 应用失败 (apply failed) | Configuration saved, hot reload failed, old endpoints restored best-effort |
| 未启用 (disabled) | The node exists but is switched off |

## Platform status

| Case | Status |
| --- | --- |
| Docker (Linux/amd64) | Installer, startup, desktop and rebuild persistence are covered by automated checks |
| Docker (arm64) | Build inputs exist, but there is **no** verification record; do not present it as tested |
| Native Linux release | Launcher and checks exist; the exact release contents are whatever package you have |
| Windows | Release form and signing unconfirmed; see [Native install](install-native.md#windows) and [Planned and unverified](planned.md) |

## Where data lives

| Content | Native run | Docker |
| --- | --- | --- |
| Console password, 2FA, connections, runtime and appearance settings | `config/` | volume `nowluma_config` → `/app/config` |
| Account message store and media | `data/` | volume `nowluma_data` → `/app/data` |
| Runtime logs | `logs/` | volume `nowluma_logs` → `/app/logs` |
| QQ's own profile, settings and credentials | QQ's own directory | volume `nowluma_qq-home` → `/home/nowluma` |

The source workspace also has a build output directory, `dist/`; in a release package its contents are the program root. It is not user data and is replaced on upgrade.

## Licence in one line

The source is available but **not** an OSI open-source licence: non-commercial use and self-hosting only, publishing modified versions requires prior written permission, and the bundled native binaries are a separate proprietary component. See [Contributing](developing.md) for the details.
