---
title: Nowluma documentation
description: Install Nowluma, connect QQ and a OneBot v11 bot, and learn how to configure, maintain and troubleshoot your deployment.
tutorial: index
---

# Nowluma documentation

Choose a reading path below or select **Load simulator** above to get familiar with the workspace. The lessons and screenshots use sample data.

![Workspace and main navigation with example data](/images/tutorials/overview.png)

## Reading paths

| Your situation            | Start here                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Install on a Linux server | [Docker install](install-docker.md) → [First run](first-run.md) → [QQ sessions](qq-connection.md) |
| Run on your desktop       | [Native install](install-native.md) → [First run](first-run.md) → [QQ sessions](qq-connection.md) |
| Connect a bot             | [QQ sessions](qq-connection.md) → [Bot connections](onebot-config.md) → [Run log](logs.md)        |
| Diagnose a problem        | [Troubleshooting](troubleshooting.md) → [Run log](logs.md)                                        |
| Explore before installing | [Practice demo](demo.md)                                                                          |

## Chapters

### Get started

| Chapter                                     | Contents                                                  |
| ------------------------------------------- | --------------------------------------------------------- |
| [Nowluma documentation](index.md)           | Reading paths and chapter directory                       |
| [What Nowluma is](introduction.md)          | Components, connection states, save results and licensing |
| [Docker install (Linux)](install-docker.md) | Terminal install, `nowluma` commands, ports and volumes    |
| [Native install](install-native.md)         | Linux Lite terminal install, Windows launcher and source   |
| [First run](first-run.md)                   | Sign in, finish setup and choose an account kernel        |

### Connect and debug

| Chapter                             | Contents                                                  |
| ----------------------------------- | --------------------------------------------------------- |
| [Workspace](overview.md)            | Navigation, connection workflow, widgets and kiosk mode   |
| [QQ sessions](qq-connection.md)     | Process states, account kernel, attach and unload         |
| [Bot connections](onebot-config.md) | Per-account message behaviour and OneBot transports       |
| [Run log](logs.md)                  | Live log, filters, TRACE and export                       |
| [Debug tools](debug.md)             | Action tester, message composer, activity and API library |

### Configure and maintain

| Chapter                                                 | Contents                                        |
| ------------------------------------------------------- | ----------------------------------------------- |
| [Settings: appearance and account](settings-console.md) | Theme, accessibility, password and 2FA          |
| [Settings: runtime and services](settings-runtime.md)   | Listener, storage, notifications and updates    |
| [Access and network](access-network.md)                 | SSH, LAN, reverse proxy, TLS and desktop access |
| [Data, backup and updates](data-backup.md)              | Back up and restore data, clean up, or upgrade  |
| [Troubleshooting](troubleshooting.md)                   | Diagnose and recover by symptom                 |

### Learn and contribute

| Chapter                      | Contents                                  |
| ---------------------------- | ----------------------------------------- |
| [Practice demo](demo.md)     | Chapter lessons and standalone simulator  |
| [Roadmap](planned.md)        | Kernel, platform and release priorities   |
| [Development](developing.md) | Licensing, repository, tests and releases |

<span id="what-this-documentation-does-not-promise" class="legacy-heading-anchor" aria-hidden="true"></span>

## Using the guides {#conventions}

- Use the console’s language button to switch between English and Simplified Chinese. The simulator follows the chapter language; some screenshots and quoted labels use Simplified Chinese.
- For interactive lessons and search, use the [published site](https://nowluma.github.io/NowLuma/) or a local HTTP preview.
- Check the [three kinds of save result](introduction.md#three-kinds-of-save-result) to see when changes take effect.
