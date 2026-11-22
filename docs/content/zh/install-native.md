---
title: 原生安装
description: 安装 Linux Lite、运行 Windows 自包含启动器，或从源码运行 Nowluma。
tutorial: install-native
---

# 原生安装

从 [GitHub 发行页](https://github.com/NowLuma/NowLuma/releases)下载对应系统的发行文件，对照 `SHA256SUMS` 核对 SHA-256。

![原生启动后使用的控制台登录页](/images/tutorials/login.png)

原生安装在你的桌面环境里运行 Nowluma 和 QQ。如果需要隔离的 Linux QQ 桌面，请选 [Docker 安装](install-docker.md)。

## Linux Lite

发行包是 `Nowluma-v<version>-linux-x64-lite.tar.gz`。解压后目录里应有 `launcher.sh`、`index.mjs`、`release.json` 和随包 Node（如果有）。

要求：

- Linux x64。
- Node.js `24.22.1`（24.x）或 `>=26.12.1`；有随包 Node 时优先使用随包版本。
- 已安装并可登录桌面 QQ。

启动：

```bash
bash launcher.sh
```

从源码目录安装到指定发行目录：

```bash
bash deploy/install.sh --native --directory /解压后的发行目录
```

在源码目录执行这条命令：Lite 包不包含 `deploy/install.sh`。

数据在发行目录或服务工作目录下的 `config/`、`data/`、`logs/`。QQ 的数据仍由 QQ 自己保存在它的用户目录，升级不要搬动或删除它。详见[数据、备份与更新](data-backup.md)。

## Windows

Windows x64 的发行形态是自包含的 `Nowluma.exe`：

- 内置 Node 24 与 .NET 自包含运行时；不需要安装 Docker、Node 或 .NET。
- 双击后解压到 `%LOCALAPPDATA%\Nowluma`，并在浏览器打开控制台。
- 启动器可以选择本机运行，或在已有 Linux Docker 引擎时使用隔离桌面；它不会替你安装虚拟机。Windows 原生控制台不提供「打开 QQ 桌面」入口，连接 Linux 服务时则由服务端能力决定。
- 启动器**未签名**，可能触发 SmartScreen。打开前请核对发行文件的校验值。
- 关闭窗口可能提前结束进程；建议在控制台按 Ctrl+C 正常停止。QQ 用户数据与设置不会被删除。

启动后按[首次启动](first-run.md)设置控制台，再[接入账号](#首次接入)。Windows 的原生接入、登录与长期会话仍需真实账号验证。

## 源码运行

开发或排障时可以直接从源码启动：

```bash
pnpm install --frozen-lockfile
pnpm run build:all
pnpm start
```

工作区固定 Node `24.22.1` 和 pnpm `11.25.0`。不要为了绕过版本检查而换用更低版本。

开发命令与真实账号验证见[本地验证](developing.md#本地验证)。

## 首次接入

1. 在桌面打开并登录 QQ。
2. 打开 Nowluma 控制台，进入「QQ 会话」。
3. 点「刷新」，选中进程，点「加载」。
4. 第一次接入该账号时，在「选择接入内核」里确认风险；未勾选不能提交。
5. 状态到「已在线」后，去「机器人连接」添加端点。

如需在之后自动接入已确认的账号，见[服务监听设置](settings-runtime.md#服务监听)。

## 桌面与权限

- Linux 原生方式需要能附加到同一用户的 QQ 进程；权限不足时看运行记录，不要用 `chmod 777` 掩盖问题。
- Windows 可能出现完整性级别提示；按界面说明处理，不要关闭全部隔离。
- 远程访问仍建议 SSH 隧道或 HTTPS，见[访问方式与网络](access-network.md)。

<span id="限制与验证状态" class="legacy-heading-anchor" aria-hidden="true"></span>

待验证的平台见[路线图](planned.md#平台)。
