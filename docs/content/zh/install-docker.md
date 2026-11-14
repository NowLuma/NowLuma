---
title: Docker 安装（Linux）
description: 用安装向导在 Linux 上部署 Nowluma：语言选择、Docker 来源选择、端口与时区、初始密码、日常命令与数据卷。
---

# Docker 安装（Linux）

这是目前验证最完整的一条安装路径：宿主机不需要安装 Node 或 QQ，全部依赖都在容器里。

## 开始之前

| 条件 | 说明 |
| --- | --- |
| 系统 | Linux。安装脚本会在非 Linux 上直接退出并提示使用 Windows 的一键运行方式 |
| 架构 | amd64 有实际构建与启动验证；arm64 有构建输入但**未验证**，见 [计划中与未验证](planned.md) |
| 权限 | 能用 `sudo`，或当前用户在 `docker` 组里 |
| 网络 | 首次构建要下载依赖、Node 与固定校验的 Linux QQ 包 |
| 磁盘 | 建议预留数 GB；镜像、QQ 与依赖都在其中 |

在解压后的源码目录执行：

```bash
bash deploy/install.sh --docker
```

也可以先只选语言：`bash deploy/install.sh --docker --lang zh`。

## 第 1 步：选择语言

向导的第一件事是问语言，后面的确认、错误和数据卷说明都跟着它走：

```
Nowluma — 1. 简体中文  2. English
Language / 语言 [1]:
```

- 直接回车 = 简体中文。
- 输入 `2` = English。
- 时区默认值随语言变化：中文默认 `Asia/Shanghai`，英文默认 `UTC`。

## 第 2 步：检查 Docker

向导分三种情况处理，行为不同：

1. **已装 Docker**：打印「已检测到 Docker，保留已有 Docker 和镜像源设置。」，不重装、不改镜像源。
2. **没有 Docker**：问一句「是否使用第三方 LinuxMirrors 安装脚本并配置 Docker 镜像源？y=使用，n=官方安装。」，默认 `n`（官方脚本）。
   - 选 `n`：显示将执行的官方命令 `curl -fsSL https://get.docker.com | bash -s docker`。
   - 选 `y`：显示将执行的第三方命令 `bash <(curl -sSL https://linuxmirrors.cn/docker.sh)`，并提示该脚本可能询问是否关闭防火墙或 SELinux——**那不是 Nowluma 的要求**，按你自己的安全策略选择。
   - 两种情况都会再问一次「是否继续执行？」，回车为 `y`（默认执行），输入 `n` 则取消安装。
3. **Docker 装了但守护进程没跑**：问「Docker 服务未运行，是否启动并设置开机启动？」，确认后执行 `systemctl enable --now docker`。

随后检查 Compose v2。缺少时问「缺少 Docker Compose v2，是否安装插件？」，按发行版用 `apt-get`/`dnf`/`yum`/`apk`/`pacman`/`zypper` 安装对应插件；拒绝则退出，不写入任何配置。

## 第 3 步：首次部署设置（只问一次）

只有在 `deploy/.env` 不存在时才会问这三组问题。`deploy/.env` 已存在时，向导打印「已有部署设置、账号与 QQ 用户目录将保留，不会重置密码。」并**逐字保留**原文件。

| 问题 | 默认 | 影响 |
| --- | --- | --- |
| 访问方式：`1. 仅本机/SSH（推荐）` / `2. 局域网` | `1` | 决定宿主上的绑定地址是 `127.0.0.1` 还是 `0.0.0.0`；选局域网会提示 HTTP 未加密 |
| 控制台与 QQ 桌面端口 | `5099` | 浏览器访问端口，也是「打开 QQ 桌面」的入口端口 |
| 机器人 HTTP 接口端口 | `3000` | OneBot HTTP 服务端 / 上报使用的端口 |
| 机器人 WebSocket 接口端口 | `3001` | OneBot WS 服务的端口 |
| 时区 | `Asia/Shanghai`（中文）/ `UTC`（英文） | 写进容器的 `TZ` |

约束：

- 端口必须是 `1–65535` 的整数，三个端口不能重复，重复会要求重填。
- 时区只允许字母、数字和 `_ + / -`，不允许 `..`，否则安装中止。
- 写入的 `deploy/.env` 权限是 `600`。它不是符号链接；`.env` 是符号链接时直接报错。

## 第 4 步：构建并等待启动检查

向导会提示「首次构建会下载 Node、QQ 和依赖，请等待启动检查完成。」然后执行 `manage.sh start`，它做的是 `docker compose up -d --build --wait`，最多等 240 秒。

成功后会打印：

- 控制台初始密码（**仅首次**，16 位十六进制）；已有部署时打印「控制台密码保持不变」。
- 控制台地址，例如 `http://127.0.0.1:5099`；选局域网时用本机 IP。
- 安装目录与日常命令。

首次密码来自容器日志里的 `initial credentials: user=admin password=...` 行。日志已经滚掉时用 `bash deploy/manage.sh logs` 查找。

## 示例：一台全新的 Ubuntu 服务器

```bash
git clone <仓库地址> Nowluma && cd Nowluma
bash deploy/install.sh --docker
```

交互过程（示例，实际提示语言取决于你选的选项）：

```
Nowluma — 1. 简体中文  2. English
Language / 语言 [1]: 1
未检测到 Docker。
是否使用第三方 LinuxMirrors 安装脚本并配置 Docker 镜像源？y=使用，n=官方安装。 [y/N]: n
将执行 Docker 官方安装脚本，不额外配置镜像源：
curl -fsSL https://get.docker.com | bash -s docker
是否继续执行？ [Y/n]:
访问方式：1. 仅本机/SSH（推荐）  2. 局域网 [1]:
控制台与 QQ 桌面端口： [5099]:
机器人 HTTP 接口端口： [3000]:
机器人 WebSocket 接口端口： [3001]:
时区： [Asia/Shanghai]:
```

**预期结果**：最后的输出里有「Nowluma 已启动。」、一行控制台初始密码、一行控制台地址，以及 `bash deploy/manage.sh start|stop|restart|logs|doctor` 五条日常命令。

## 安装完成后要做的三件事

1. 打开控制台地址，按 [首次启动](first-run.md) 完成协议确认和修改访问密码。
2. 在控制台点「打开 QQ 桌面」，在里面的 QQ 窗口扫码登录，并在 **QQ 自己的设置**里勾选自动登录。
3. 回控制台按 [QQ 连接](qq-connection.md) 把账号加载起来。需要机器人回复时，再按 [节点配置](onebot-config.md) 建端点。

桌面复用当前控制台会话，**不需要另填 VNC 密码**。浏览器、脚本与 WebSocket 都会校验控制台会话，后台 VNC 只监听容器内回环并保留自己的认证。

## 数据卷与运行用户

Compose 项目名固定为 `nowluma`，卷名不随源码目录名变化，因此换目录重新部署也能复用：

| 卷 | 容器路径 | 内容 |
| --- | --- | --- |
| `nowluma_config` | `/app/config` | 控制台密码/2FA、连接、运行与外观设置 |
| `nowluma_data` | `/app/data` | 账号消息库与媒体 |
| `nowluma_logs` | `/app/logs` | 运行日志 |
| `nowluma_qq-home` | `/home/nowluma` | QQ 完整用户环境、自动登录设置、凭据、用户存储、机器 ID |

程序与 QQ 都以 UID/GID **1000** 运行，共用同一 HOME；`XDG_CONFIG_HOME=/home/nowluma/.config`，QQ 的配置目录是其中的 `QQ`。整个 HOME 都会保留，不只是 `login.db`。XDG 运行目录是临时目录 `/tmp/nowluma-runtime`，不持久化陈旧锁文件。

机器 ID 第一次在 HOME 中生成，容器重建后继续复用；主机名固定为 `nowluma`。

## 日常命令

```bash
bash deploy/manage.sh start     # 构建并启动，等待健康检查
bash deploy/manage.sh stop      # 停止，不删除卷
bash deploy/manage.sh restart   # 正常结束进程后重启并等待恢复
bash deploy/manage.sh logs      # 持续查看日志
bash deploy/manage.sh doctor    # 检查进程、目录、权限和监听
```

需要 sudo 才能用 Docker 时，向导打印的日常命令会自动带 `sudo`。

`doctor` 会以 UID 1000 执行容器内健康检查，并打印 `id`、`HOME`、`XDG_CONFIG_HOME` 以及 `/home/nowluma`、`/home/nowluma/.config/QQ`、`/app/config`、`/app/data`、`/app/logs` 的权限。

## 安装失败与时区之外的常见问题

| 现象 | 处理 |
| --- | --- |
| 卡在拉取依赖 / QQ 包 | 检查网络与 DNS；官方地址不可用时安装脚本会明确提示改用固定发行镜像，而不是静默换版本 |
| 「启动失败，数据已保留。」 | `bash deploy/manage.sh logs` 看原因；数据卷没有被删，修好后再次 `start` |
| 端口被占用 | 改 `deploy/.env` 里的端口后 `restart`；不要直接改 Compose 文件 |
| 构建成功但打不开控制台 | 确认绑定地址；`manage.sh doctor` 检查容器状态；远程服务器先建 SSH 隧道，见 [访问方式与网络](access-network.md) |
| 用 `docker compose down -v` 清过环境 | 数据卷已被删除，QQ 需要重新扫码；备份策略见 [数据、备份与更新](data-backup.md) |

## 关于“安装成功”的说明

安装脚本只有在启动检查通过后才打印成功。健康检查会验证 QQ 进程存在、桌面监听正常、控制台可访问；必要进程退出时入口脚本会结束服务并让 Docker 重启，不会留下一个只有控制台的容器。

这不等于 QQ 已登录，也不等于机器人会回复。继续读 [首次启动](first-run.md) 和 [QQ 连接](qq-connection.md)。
