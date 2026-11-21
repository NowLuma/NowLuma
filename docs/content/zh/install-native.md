---
title: 原生安装
description: Linux Lite 发行包、Windows 自包含 exe 与源码运行的步骤、Node 基线、数据位置和验证边界。
tutorial: install-native
---

# 原生安装

先选择与你的系统匹配的发行文件并核对校验值，再启动程序。上方练习从控制台入口开始，不会下载或运行 QQ 安装程序。

![原生启动后使用的控制台登录页](/images/tutorials/login.png)

_图：示例控制台入口；访问密码来自 Nowluma 的启动输出，不是 QQ 密码。_

原生方式不使用 Docker。程序直接运行在你的用户环境里，QQ 也使用你桌面上的客户端；适合已经能自己管理桌面和进程的用户。

## Linux Lite

发行包是 `Nowluma-v<version>-linux-x64-lite.tar.gz`。解压后目录里应有 `launcher.sh`、`index.mjs`、`release.json` 和随包 Node（如果有）。

要求：

- Linux x64。
- Node.js `24.22.1`（24.x）或 `>=26.12.1`；有随包 Node 时优先使用随包版本。
- 已安装并可登录桌面 QQ；程序不替你安装 QQ。

启动：

```bash
bash launcher.sh
```

从源码目录安装到指定发行目录：

```bash
bash deploy/install.sh --native --directory /解压后的发行目录
```

`deploy/install.sh` 只在源码仓库里，不随 Lite 包分发。原生方式不会自动修改你的 QQ 用户目录，也不会替你登录。

数据在发行目录或服务工作目录下的 `config/`、`data/`、`logs/`。QQ 的数据仍由 QQ 自己保存在它的用户目录，升级不要搬动或删除它。详见[数据、备份与更新](data-backup.md)。

## Windows

Windows x64 的发行形态是自包含的 `Nowluma.exe`：

- 内置 Node 24 与 .NET 自包含运行时；不需要安装 Docker、Node 或 .NET。
- 双击后解压到 `%LOCALAPPDATA%\Nowluma`，并在浏览器打开控制台。
- 启动器可以选择本机运行，或在已有 Linux Docker 引擎时使用隔离桌面；它不会替你安装虚拟机。Windows 原生控制台不提供「打开 QQ 桌面」入口，连接 Linux 服务时则由服务端能力决定。
- 当前构建**未签名**，可能触发 SmartScreen。发行说明应给出 SHA-256；没有校验值的二进制不要直接运行。
- 关闭窗口可能提前结束进程；建议在控制台按 Ctrl+C 正常停止。QQ 用户数据与设置不会被删除。

启动后仍然按[首次启动](first-run.md)登录，再到「QQ 会话」接入账号。第一次为该账号接入会要求选择内核并确认风险；Windows 上的真实注入、登录和长期会话需要你自己验证。从 Windows 浏览器连接 Linux Docker 服务器时，桌面入口由该服务器能力决定。

## 源码运行

开发或排障时可以直接从源码启动：

```bash
pnpm install --frozen-lockfile
pnpm run build:all
pnpm start
```

工作区固定 Node `24.22.1` 和 pnpm `11.25.0`。不要为了绕过版本检查而换用更低版本。

`pnpm dev` 会尝试连接本机真实 QQ，只在你确实要进行真实运行测试时使用；日常开发优先用隔离的 fake 或 Docker smoke。

## 首次接入

1. 在桌面打开并登录 QQ。
2. 打开 Nowluma 控制台，进入「QQ 会话」。
3. 点「刷新」，选中进程，点「加载」。
4. 第一次接入该账号时，在「选择接入内核」里确认风险；未勾选不能提交。
5. 状态到「已在线」后，去「机器人连接」添加端点。

自动连接已打开的 QQ 是服务级选项，重启后生效；只有本地 QQ 登录、真实 UIN 已识别且已有当前风险版本的兼容内核确认时才会自动接入。它不会替你登录 QQ，也不会跳过内核确认；显式卸载的 PID 仍要手动加载。

## 桌面与权限

- Linux 原生方式需要能附加到同一用户的 QQ 进程；权限不足时看运行记录，不要用 `chmod 777` 掩盖问题。
- Windows 可能出现完整性级别提示；按界面说明处理，不要关闭全部隔离。
- 远程访问仍建议 SSH 隧道或 HTTPS，见[访问方式与网络](access-network.md)。

## 限制与验证状态

| 项目                      | 现状                                      |
| ------------------------- | ----------------------------------------- |
| Linux Lite 启动与发行布局 | 有自动化检查                              |
| Linux 真实 QQ 登录/注入   | 需要在你的桌面验证                        |
| Windows exe               | 已构建、未签名；真实账号行为未验证        |
| Docker arm64              | 有构建输入，未验证                        |
| 重写内核                  | 未完成、不可选；不会自动回退              |
| 六份原始预编译文件        | 当前发行使用；内部字节与必要 ABI 保持不变 |

原生方式不会自动获得 Docker 的进程隔离或桌面网关；安全边界由你的桌面、用户权限和网络决定。未验证的平台与产物统一列在[计划中与未验证](planned.md)。
