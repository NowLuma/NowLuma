---
title: Practice demo
description: The /demo/ environment in the static documentation site: explore the new workspace with simulated data, without connecting a real QQ.
---

# Practice demo

The documentation site includes a `/demo/` environment that renders console components with simulated data. Use it to learn the new workspace before touching a real instance.

**Status:** it is part of the static documentation build and exists only when that build includes the simulator. Publishing is performed by the maintainer; this page does not claim it is already live.

## Opening it

- Use `模拟练习` in the site header or the link on this page to open `/demo/`.
- Paths are relative, so it works under the `/Nowluma/` base path and in a local static preview.
- Use only the public example password and code shown on the page; no real QQ account or OneBot token is required.

## What you can practise

| Scenario | Chapter |
| --- | --- |
| Floating navigation, masthead, connection workflow, runtime readings | [Workspace](overview.md) |
| Four-stage setup: notices, access password, manual display effects and account kernel | [First run](first-run.md) |
| Process states and the attach confirmation | [QQ sessions](qq-connection.md) |
| Four transport tabs and save states | [Bot connections](onebot-config.md) |
| Log presets, search and the TRACE warning | [Run log](logs.md) |
| Action testing, message composition and live activity | [Debug tools](debug.md) |
| Settings categories and save/restart hints | [Settings: appearance and account](settings-console.md) |

The simulated data covers normal, empty and error branches, including the difference between `已保存并应用` and `已保存，下次连接时应用`.

## What it cannot prove

- `已连接` does not mean your QQ is logged in or that a bot receives messages.
- `发送成功` does not mean a real account delivered anything or that the other side will reply.
- It writes no real configuration, reads no real tokens and contacts no real service.
- It cannot verify persistence, restart, permissions, kernel risk acknowledgement or desktop authentication.
- It cannot assess account restriction risk.

## Differences from the real console

| Item | Demo | Real console |
| --- | --- | --- |
| Data | Fixed simulated data | Your accounts, processes and connections |
| Network | No real requests | Reads the local service and QQ |
| Account | Not needed | You must log in inside QQ |
| Saves | Not persisted | Written to config; applied or restarted as indicated |
| Kernel | UI demonstration only | Confirmed per real UIN and persisted |

There is no hidden bypass in the demo. For real use, follow [First run](first-run.md) and [QQ sessions](qq-connection.md). Real behaviour must be verified with a real account and endpoint.
