---
title: What Nowluma is
description: The access layer and workspace, connection states, save/apply semantics, per-account kernel choice, platforms and GPL-3.0-only licensing.
tutorial: introduction
---

# What Nowluma is

In the lesson above, locate QQ sessions, bot connections and the run log. Distinguishing their responsibilities prevents a saved configuration from being mistaken for delivered messages.

![Example workspace showing session and connection states](/images/tutorials/overview.png)

_Figure: sample readings explain the interface; they are not your real account state._

Nowluma runs on your machine. It finds an already-running QQ client, attaches the account to OneBot v11, and gives you a browser workspace for accounts, connections, logs and the desktop.

## Components

| Part           | Responsibility                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Access layer   | Discover local QQ processes, attach the native component after your confirmation, establish the pipe |
| Account kernel | Persist an access-kernel choice and risk acknowledgement per real QQ number                          |
| OneBot layer   | Per-account HTTP and WebSocket endpoints; events and actions                                         |
| Workspace      | Six pages: Workspace, QQ sessions, Bot connections, Run log, Debug tools, Settings                   |
| Desktop        | Operate QQ login and dialogs in a browser, local or Docker desktop                                   |

QQ itself performs login, QR scan, verification and auto-login. Nowluma never asks for the QQ password, forges device tokens or migrates your QQ user directory.

## What it does not do

- It does not log in to QQ, and the console password is not the QQ password.
- It does not guarantee a bot will reply just because an endpoint is `正常`.
- It does not call a saved configuration “applied”.
- It does not promise that keeping local data avoids a future QR scan.
- It does not attach the compatibility kernel without the account holder's active acknowledgement.

## Three kinds of save result

| Action                                   | How it is saved                             | When it applies                                                                                         |
| ---------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| UI preferences, layout, navigation order | Auto-saved to UI config (debounced)         | Immediately in the browser, synced across devices; on failure local state remains and an error is shown |
| Per-account bot connections              | Dialog or `立即保存`, written to the server | Live hot reload gives “saved and applied”; otherwise it applies on the next connection                  |
| Service settings                         | Explicit save                               | Usually requires restarting Nowluma; the UI says so                                                     |

Example: change the HTTP port while the QQ account is offline. The save succeeds but shows “已保存，下次连接时应用”. Only “已保存并应用” means the server hot-reloaded the endpoint.

## Four “connected” meanings

| Phrase                 | Where                                       | Meaning                                                                 |
| ---------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| Console connected      | Masthead connection status                  | The browser session is valid                                            |
| Account online         | QQ session card, `已登录会话` widget        | QQ is logged in and the local identity was recognized and attached      |
| Endpoint healthy       | Bot connection summary, `机器人连接` widget | Listening or connected; the bot still needs the right address and token |
| Notification delivered | `通知投递` widget                           | Online/offline events reached the selected channels                     |

## Account kernel choice

Before attaching a QQ number, the console asks for a kernel choice for that real UIN:

- `兼容内核` uses the bundled native component and requires an unchecked-by-default risk acknowledgement for the current risk version.
- `重写内核` is shown as `暂不可用`; it cannot be selected and there is no silent fallback to compatibility.
- The choice is stored per UIN in `config/kernel-selections.json`.
- Saving the choice alone does not attach the process; only `加载` or reconnect in QQ sessions does.
- A different QQ number, a changed account identity, or a new risk version requires a new acknowledgement. A confirmation from one PID is never cloned to another account.

## State words

QQ process: `可加载`, `加载中`, `等待连接`, `等待登录`, `已在线`, `错误`, `已断开`.

Bot endpoint: `正常`, `注意`, `异常`, `应用失败`, `未启用`. `应用失败` means saved but hot reload failed; the server best-effort restores the previous endpoints.

## Platforms and releases

| Form         | Requirement                                                | Verification                                                              |
| ------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| Linux Docker | Docker Engine and Compose v2, linux/amd64                  | Automated build and recreate smoke; no fabricated QQ login                |
| Linux Lite   | Node.js `24.22.1` (24.x) or `>=26.12.1`                    | Launcher and release-layout checks; native attach must be verified by you |
| Windows x64  | Self-contained `Nowluma.exe` with Node 24 and .NET runtime | Built, unsigned; real-account behaviour unverified                        |
| Docker arm64 | Build inputs exist                                         | Not verified                                                              |

## Data locations

| Content                                                       | Native           | Docker volume                       |
| ------------------------------------------------------------- | ---------------- | ----------------------------------- |
| Console password/2FA, connections, kernel choices, appearance | `config/`        | `nowluma_config` → `/app/config`    |
| Account message store and media                               | `data/`          | `nowluma_data` → `/app/data`        |
| Runtime logs                                                  | `logs/`          | `nowluma_logs` → `/app/logs`        |
| QQ user environment                                           | controlled by QQ | `nowluma_qq-home` → `/home/nowluma` |

## Licence

Source is **GPL-3.0-only**. You may use, study, modify and redistribute it, **including commercially**, without extra permission. Distribution must comply with GPLv3 source and notice requirements. `LICENSE` is the verbatim GNU GPLv3 text.

Bundled prebuilt native components and third-party components are not GPL source; their terms are recorded in `LICENSING.md`. `EULA.md` and `PRIVACY.md` describe use and data handling and do not add non-commercial restrictions to GPL rights.

The current source contains no analytics or telemetry, and there is no `NOWLUMA_TELEMETRY` switch. See `PRIVACY.md`.
