---
title: Nowluma documentation (English)
description: Complete English guide index for first-time users — install, first start, every console page, settings, data persistence and troubleshooting.
---

# Nowluma documentation

Nowluma is self-hosted software that runs on **your own machine or server**. It connects to a real QQ client, exposes the account through the OneBot v11 protocol for bot programs, and provides a browser console for accounts, connections, logs and appearance.

This documentation is written for someone using the project for the first time. Every chapter says what a feature does, where to click, a copy-pasteable example, what you should see, where the change is stored, whether a restart is needed, and how to recover when it fails.

The console itself has no language switcher, so the interface is Chinese. Each label is quoted here as it appears on screen, with the English meaning next to it — for example 「总览」 (Overview).

## Reading paths

| Your situation | Suggested order |
| --- | --- |
| First deployment with Docker | [Docker install](install-docker.md) → [First start](first-run.md) → [QQ connection](qq-connection.md) |
| Service is running, you need bot endpoints | [Endpoint configuration](onebot-config.md) → [Logs](logs.md) |
| You want the concepts first | [What Nowluma is](introduction.md) → [Access and networking](access-network.md) |
| You are debugging someone else's install | [Troubleshooting](troubleshooting.md) → [Logs](logs.md) |
| You only want to see the interface | [Practice mode](demo.md) |
| You plan to change code or open a PR | [Contributing](developing.md) |

## Chapters

| Chapter | Contents |
| --- | --- |
| [What Nowluma is](introduction.md) | Boundaries, three meanings of online/offline, saved vs applied, platform status |
| [Docker install (Linux)](install-docker.md) | Every installer step, ports and timezone, initial password, daily commands, volumes |
| [Native install](install-native.md) | Linux release package, and the current state of Windows |
| [First start](first-run.md) | Sign-in, `?token=` link, two-factor, agreements, access password |
| [Overview](overview.md) | Widgets, layout editing, navigation, guidance panel, presentation mode |
| [QQ connection](qq-connection.md) | Process states, load and unload, opening the QQ desktop |
| [Endpoint configuration](onebot-config.md) | Per-account general settings and the four OneBot network endpoints |
| [Logs](logs.md) | Levels, presets, the cost of TRACE, exports |
| [Debug](debug.md) | Action tester, message composer, live activity, API browser |
| [Settings: console](settings-console.md) | Appearance, data and format, account security |
| [Settings: Nowluma and platform](settings-runtime.md) | Global config, storage, notifications, service, advanced, developer, about |
| [Access and networking](access-network.md) | Local, LAN, SSH, TLS and reverse proxies, desktop authentication |
| [Data, backup and updates](data-backup.md) | Where data lives, backup and restore, cleanup, upgrades |
| [Troubleshooting](troubleshooting.md) | Symptom table and recovery ladder |
| [Practice mode](demo.md) | A static practice environment without a real account |
| [Planned and unverified](planned.md) | Features not yet shipped or not yet verified |
| [Contributing](developing.md) | Licence, boundaries, tests, submission workflow |

## Conventions

- Console labels are quoted in their original Chinese form, with the meaning in brackets where useful: 「节点配置」 (Endpoint configuration). There is no i18n layer yet, so these are the exact strings on screen.
- Status vocabulary follows the interface: QQ processes use 「可加载」 (loadable), 「等待登录」 (waiting for sign-in), 「已在线」 (online); OneBot endpoints use 「正常」 (ok), 「注意」 (warn), 「异常」 (down), 「应用失败」 (apply failed), 「未启用」 (disabled).
- External addresses are always examples: `http://127.0.0.1:5700`, `https://bot.example.invalid`, `admin@example.invalid`. No real account, token or traffic capture appears here.
- "Saved", "applied" and "connected" are three different things; see [What Nowluma is](introduction.md#three-different-senses-of-saved).
- This documentation was checked against the source and the existing tests but has **not been through a new visual regression pass**. The interface is still changing, so exact positions may differ from your build; labels and behaviour are what this text describes.
- Cross-chapter links are relative paths, so they work offline.

## Practice mode

If you only want to look at the console without connecting a real QQ account, read [Practice mode](demo.md). It is a clearly labelled **simulated** environment; it does not replace a real QQ sign-in and cannot prove that a bot replies.

## What this documentation does not promise

- That the QQ server will keep accepting a stored session forever. Expiry, location verification or risk-control challenges still have to be completed in QQ itself.
- That any account is safe from risk control or bans.
- That 「正常」 (ok) on an endpoint means the bot works. It means a listener is bound or a connection is established.
- Any detail about packages, signed binaries, image registries or performance numbers that has not shipped yet — see [Planned and unverified](planned.md).
