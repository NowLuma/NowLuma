---
title: What Nowluma is
description: The access layer and workspace, connection states, save/apply semantics, per-account kernel choice, platforms and GPL-3.0-only licensing.
tutorial: introduction
---

# What Nowluma is

Use the lesson above to find QQ sessions, bot connections and the run log.

![Example workspace showing session and connection states](/images/tutorials/overview.png)

Nowluma runs on your machine. It finds an already-running QQ client, attaches the account to OneBot v11, and gives you a browser workspace for accounts, connections, logs and the desktop.

## Components

| Part           | Responsibility                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Access layer   | Discover local QQ processes, attach the native component after your confirmation, establish the pipe |
| Account kernel | Persist an access-kernel choice and risk acknowledgement per real QQ number                          |
| OneBot layer   | Per-account HTTP and WebSocket endpoints; events and actions                                         |
| Workspace      | Six pages: Workspace, QQ sessions, Bot connections, Run log, Debug tools, Settings                   |
| Desktop        | Use the local QQ window or, on Linux Docker, open the QQ desktop from the console                    |

<span id="what-it-does-not-do" class="legacy-heading-anchor" aria-hidden="true"></span>

Sign in and complete any QR scan or verification in QQ. Open the Nowluma console with the access password from [First run](first-run.md#login).

## Three kinds of save result

| Action                                   | How it is saved                             | When it applies                                                                                         |
| ---------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| UI preferences, layout, navigation order | Auto-saved to UI config (debounced)         | Immediately in the browser, synced across devices; on failure local state remains and an error is shown |
| Per-account bot connections              | Dialog or `立即保存`, written to the server | Live hot reload gives “saved and applied”; otherwise it applies on the next connection                  |
| Service settings                         | Explicit save                               | Usually requires restarting Nowluma; the UI says so                                                     |

For endpoint changes, check [Save and apply](onebot-config.md#save-and-apply) before testing the new address.

## Four “connected” meanings

| Phrase                 | Where                                       | Meaning                                                                 |
| ---------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| Console connected      | Masthead connection status                  | The browser session is valid                                            |
| Account online         | QQ session card, `已登录会话` widget        | QQ is logged in and the local identity was recognized and attached      |
| Endpoint healthy       | Bot connection summary, `机器人连接` widget | Listening or connected; the bot still needs the right address and token |
| Notification delivered | `通知投递` widget                           | Online/offline events reached the selected channels                     |

## Account kernel choice

On first attach, choose the compatibility kernel and confirm the risks for the detected QQ number (UIN). See [QQ sessions](qq-connection.md#choosing-the-access-kernel) for selection and re-attachment, or [Roadmap](planned.md#rewrite-kernel) for the rewrite.

## State words

QQ process: `可加载`, `加载中`, `等待连接`, `等待登录`, `已在线`, `错误`, `已断开`.

Bot endpoint: `正常`, `注意`, `异常`, `应用失败`, `未启用`. `应用失败` means saved but hot reload failed; the server best-effort restores the previous endpoints.

## Platforms and releases

| Install method                             | Requirements                                       |
| ------------------------------------------ | -------------------------------------------------- |
| [Linux Docker](install-docker.md)          | Linux amd64, Docker Engine and Compose v2          |
| [Linux Lite](install-native.md#linux-lite) | Linux x64, Node.js `24.22.1` (24.x) or `>=26.12.1` |
| [Windows x64](install-native.md#windows)   | Unsigned launcher with Node 24 and .NET            |

Both Linux methods install entirely from a terminal with no browser download. A Docker deployment is managed with the `nowluma` command; older installs can keep using `bash deploy/manage.sh`.

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
