---
title: 原生安装（Linux 发行包与 Windows 单文件 exe）
description: 使用 Linux Lite 发行包与启动器，或运行内置 Node 的 Windows 单文件 exe；两者都不使用容器。
---

# 原生安装（Linux 与 Windows）

原生方式不使用容器：程序直接在你的系统上运行，QQ 由你自己启动和登录。

## Linux 发行包

发行包解压后应当有 `launcher.sh`、`index.mjs`、`check-node-version.cjs` 和 `release.json`。在解压目录里直接启动：

```bash
bash launcher.sh
```

`deploy/install.sh` 只在**源码仓库**里，不随发行包分发。如果你是从仓库源码安装，可以在仓库根目录用它执行同一套检查，并指向解压后的发行目录：

```bash
bash deploy/install.sh --native --directory /发行包目录
```

安装脚本模式会：

1. 检查目录里存在 `index.mjs` 与 `launcher.sh`，否则提示用 `--directory` 指定解压后的发行目录。
2. 优先使用随包 `node`，没有则用系统 `node`；都没有时报「需要随包 Node，或 Node.js 24.22.1 / 26.12.1 以上。」
3. 执行 `check-node-version.cjs` 校验运行时版本基线。
4. 读取 `release.json`，确认 `target` 与当前平台的 `linux-<arch>` 一致，不匹配直接报错。
5. 打印「请在 QQ 窗口登录并勾选自动登录。正在启动控制台……」并交给 `launcher.sh`。

启动器会固定工作目录并优先使用随包 Node。Lite 版需要 Node.js `24.22.1`（24.x）或 `>=26.12.1`；不要为了跑起来降低版本检查。

**原生安装不会替你安装 QQ，也不会修改你的用户目录。** 自己打开桌面 QQ 并登录，然后回控制台按 [QQ 连接](qq-connection.md) 的步骤接入。

原生运行的数据位置：

| 目录 | 内容 |
| --- | --- |
| `config/` | 控制台密码与 2FA、连接设置、运行与外观设置 |
| `data/` | 账号消息库、媒体 |
| `logs/` | 运行日志 |

升级时保留这三个目录，只替换发行包。QQ 的用户目录不属于本程序，不要搬动。

## 原生安装的示例与预期结果

```bash
mkdir -p ~/nowluma && cd ~/nowluma
tar -xzf nowluma-linux-x64.tar.gz
bash launcher.sh
```

从仓库源码安装时，也可以用 `bash deploy/install.sh --native --directory ~/nowluma` 做同样的检查。

**预期结果**：终端打印实际监听地址，例如 `listening http://127.0.0.1:5099`；浏览器打开这个地址能看到登录页。默认端口 `5099` 被其它程序占用时，控制台会打印一条警告并自动改用附近一个空闲端口（最多向后尝试 50 个），这时以日志里 `listening ...` 的地址为准；想固定端口就先停掉占用者，或在「系统设置 → 服务 → 服务监听」里改端口后重启。附近 50 个端口都不可用时会报 `No available TCP port found near 5099` 并退出。

**失败怎么办**：

| 现象 | 处理 |
| --- | --- |
| `Release platform mismatch` | 包与架构不匹配，换对应架构的发行包 |
| `需要随包 Node…` | 安装 Node 24.22.1 或 26.12.1+，或使用带 Node 的发行包 |
| 控制台端口被占用 | 看日志里自动换用的端口；想固定端口就停止占用进程，或改监听端口后重启程序 |
| 打开后没有任何 QQ 进程 | 先自己启动 QQ 并登录，再回「QQ 连接」页刷新 |

## Windows

Windows x64 的发行形态是自包含的 `Nowluma.exe`：

- 由 `tools/build-windows-exe.mjs` 打包，内置 Node 与运行环境；不需要 Docker、Node 或 .NET 安装。
- 双击后解压到 `%LOCALAPPDATA%\Nowluma`，并在浏览器打开控制台。
- 当前构建**未签名**，可能触发 SmartScreen；发行说明应给出 SHA-256，没有校验值的二进制不要直接运行。
- 关闭窗口可能提前结束进程；建议在控制台按 Ctrl+C 正常停止。QQ 用户数据和设置不会被删除。

这不是「已签名」或「已在真实账号上验收」的声明。真实 QQ 登录、注入与长期会话仍需要你自己验证；见 [计划中与未验证](planned.md)。

启动步骤：

1. 运行 `Nowluma.exe`。
2. 按提示选择本机 QQ；若已有 Linux Docker，也可选择隔离桌面。
3. 自己打开 Windows 版 QQ 并登录，勾选 QQ 自己的自动登录设置。
4. 回控制台按 [QQ 连接](qq-connection.md) 接入。

Windows 上的两个界面差异：

- 会在总览或布局区域看到「低完整性警告」（当前进程令牌完整性级别偏低），可以「临时关闭」（本次标签页有效）或「永久关闭」（本机记住）。
- 账号检测通过系统文件句柄完成，因此 QQ 必须在同一台机器上运行。

发行包只应包含程序与许可文件，不应包含 `config/`、`data/`、`logs/` 或真实账号数据。

## 从源码运行（开发用）

只有在你要改代码时才需要这样：

```bash
pnpm install --frozen-lockfile
pnpm run build:all
node dist/index.mjs
```

开发模式与发行包的行为差异（例如密码轮换会被跳过）属于开发约定，不要据此推断正式环境。完整流程见 [参与开发](developing.md)。

## 下一步

- 打开控制台后： [首次启动](first-run.md)
- 决定怎么访问： [访问方式与网络](access-network.md)
- 出问题了： [排障与失败恢复](troubleshooting.md)
