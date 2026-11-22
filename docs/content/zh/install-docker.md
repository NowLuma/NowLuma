---
title: Docker 安装（Linux）
description: 在 Linux 上用安装向导部署 Nowluma：访问方式、端口、时区、数据卷、日常命令、桌面、升级与验证现状。
tutorial: install-docker
---

# Docker 安装（Linux）

在 Linux 服务器或 NAS 上部署 Nowluma。安装完成后，可在上方练习登录控制台。

![安装完成后使用的控制台登录页](/images/tutorials/login.png)

_图：控制台示例入口。真实部署的初始密码从安装输出获取。_

适合长期运行的 Linux 服务器或 NAS。安装向导会检查 Docker Engine 与 Compose v2，生成私有配置并启动容器。

## 准备

- Linux x86_64（amd64）、Bash 和 curl。其他平台见[路线图](planned.md#平台)。
- Docker Engine、Compose v2，以及对所选镜像仓库或镜像源的访问。向导可协助安装缺少的组件。

## 安装向导

[预发行版 `2.5.0-rc.2`](https://github.com/NowLuma/NowLuma/releases/tag/v2.5.0-rc.2) 已在 Ubuntu amd64 上验证：镜像可匿名拉取，首次安装后控制台可访问，重跑向导会保留部署配置。在 Linux 终端运行以下命令，无需在向导中再选版本：

```bash
curl -qfsSL --proto '=https' --proto-redir '=https' \
  https://nowluma.github.io/NowLuma/install.sh -o nowluma-install.sh &&
  test -s nowluma-install.sh && bash nowluma-install.sh --version 2.5.0-rc.2
```

安装其他版本时，把 `--version` 的值换成 [Docker Hub 标签页](https://hub.docker.com/r/wsxyt/nowluma/tags)上已发布的 Linux/amd64 版本。省略 `--version` 时，新安装会提示输入具体版本。

先选语言。向导检查 Docker 后，请选择安装目录（默认 `$HOME/Nowluma`）。

向导中的设置与默认值：

| 提示                      | 说明                                   |
| ------------------------- | -------------------------------------- |
| 语言                      | `1. 简体中文` 或 `2. English`          |
| 访问方式                  | `1. 仅本机/SSH（推荐）` 或 `2. 局域网` |
| 控制台与 QQ 桌面端口      | 默认 `5099`                            |
| 机器人 HTTP 接口端口      | 默认 `3000`                            |
| 机器人 WebSocket 接口端口 | 默认 `3001`                            |
| 时区                      | 例如 `Asia/Shanghai`                   |

按回车使用默认值，三个端口需不同。已有 `deploy/.env` 会原样复用。

向导沿用现有 Docker 和镜像源。缺少 Docker 时，可选择官方安装脚本，或使用第三方 LinuxMirrors 选择镜像源；向导显示命令后等待确认。

如果首次拉取镜像失败，向导不会保存新部署，可以重新运行并选择已发布的版本。如果目标版本没有 Docker Hub 镜像，可从完整源码目录运行 `bash deploy/install.sh --docker`。

安装成功后，终端会显示控制台地址；新部署还会显示初始密码。

## 首次进入

```bash
bash deploy/manage.sh logs
```

打开 `http://127.0.0.1:5099`，用初始密码登录，按[首次启动](first-run.md)完成说明阅读和改密。然后：

1. 点「打开 QQ 桌面」进入容器内的图形 QQ。
2. 在 QQ 窗口扫码或密码登录，可在 QQ 自己的设置里勾选自动登录。
3. 回到「QQ 会话」，刷新并接入账号。
4. 第一次接入会要求为该真实 UIN 选择并确认内核。
5. 在「机器人连接」添加端点，把地址与令牌填进机器人程序。

桌面复用当前控制台会话，不需要额外 VNC 密码；不要把它直接暴露到公网。

## 日常命令

```bash
bash deploy/manage.sh start
bash deploy/manage.sh stop
bash deploy/manage.sh restart
bash deploy/manage.sh logs
bash deploy/manage.sh doctor
```

- `start` 使用本地已有的指定镜像（源码部署则构建），并等待健康检查。
- `restart` 正常结束进程再等待恢复，不拉取或构建镜像。
- `stop` 不删除任何数据卷。
- `doctor` 检查容器、进程、端口与目录。

## 端口与网络

默认只发布到宿主机回环地址。远程服务器推荐在自己的电脑建立隧道：

```bash
ssh -L 5099:127.0.0.1:5099 -L 3001:127.0.0.1:3001 用户名@服务器地址
```

保持隧道窗口打开，再访问本机 `http://127.0.0.1:5099`。

如果明确选择局域网访问，安装向导会绑定 `0.0.0.0` 并提示 HTTP 未加密。此时应配置 HTTPS 或只允许可信网络访问；不要把管理界面和桌面直接暴露到公网。详见[访问方式与网络](access-network.md)。

机器人端口 3000/3001 是否对机器人程序开放，取决于 Compose 的发布地址；每个端点仍需自己的访问令牌，控制台密码不能替代。

## 数据卷

Compose 项目名固定为 `nowluma`，卷名不随源码目录变化：

| 卷                | 容器目录        | 内容                                           |
| ----------------- | --------------- | ---------------------------------------------- |
| `nowluma_config`  | `/app/config`   | 控制台密码/2FA、连接、内核选择、运行与外观设置 |
| `nowluma_data`    | `/app/data`     | 账号消息库与媒体                               |
| `nowluma_logs`    | `/app/logs`     | 运行日志                                       |
| `nowluma_qq-home` | `/home/nowluma` | QQ 完整用户环境、自动登录设置、凭据与机器 ID   |

QQ 与程序固定以 UID/GID 1000 运行，共用 HOME 和 XDG 环境。机器 ID 在 HOME 中生成并在容器重建后复用；XDG 运行目录是临时 `/tmp/nowluma-runtime`，不要持久化陈旧的进程锁或套接字。

普通 `stop`、`restart`、重新创建容器都应复用这些卷。`docker compose down -v` 会删除数据，只有明确要清空一切时才使用。

## 桌面与认证

- 桌面通过同源 `/desktop/` 访问，只发布控制台一个管理端口，不再单独发布 6080。
- QQ、Xvfb、openbox 与 x11vnc 运行在同一个容器、同一个完整 HOME 中，不是每个账号一台 VM；多账号共用这个桌面环境。
- 浏览器使用 HttpOnly、SameSite=Strict 的路径限定会话 Cookie；控制台令牌或 VNC 密码不进入 URL。
- 后台 VNC 只监听回环 5900，并保留独立认证；网关在服务器侧完成会话校验。
- 退出、改密或会话过期后，桌面操作不再可用；WebSocket 还校验 Origin。

反向代理要保留 `/desktop/` 路径、真实 Host、WebSocket 升级头和足够的读超时。示例见[访问方式与网络](access-network.md)。

## 升级与卸载

1. 先停服务，再备份四个卷，避免复制正在写入的 SQLite/WAL。
2. 镜像部署：确认新标签已发布，只修改 `deploy/.env` 中 `NOWLUMA_IMAGE` 的 `docker.io/wsxyt/nowluma` 版本，再运行 `bash deploy/manage.sh update`。源码部署：更新源码并运行 `bash deploy/manage.sh start`。两种方式都复用原卷。
3. 不要用 `down -v` 升级。
4. 彻底删除前确认备份；普通 `stop` 不删除数据。

## 检查运行状态 {#自动化验证现状}

运行 `bash deploy/manage.sh doctor` 检查部署，或在 `logs` 中查看启动失败的原因。平台验收进度见[路线图](planned.md#平台)。

## 排障

| 现象               | 检查                                                                |
| ------------------ | ------------------------------------------------------------------- |
| 镜像拉取失败       | 确认版本标签、架构与镜像仓库访问                                    |
| 控制台打不开       | 容器健康、端口冲突、隧道或局域网发布地址                            |
| 桌面打不开         | 控制台会话、首次改密/说明确认、反向代理的 Host 与 WebSocket         |
| 没有 QQ 进程       | 查看 Xvfb 与 QQ 启动日志                                            |
| 无法接入           | 原生组件与架构、`SYS_PTRACE`、QQ 与程序用户是否一致                 |
| 重启后自动登录消失 | `nowluma_qq-home` 是否复用、HOME/XDG 是否被覆盖、是否用了 `down -v` |
| 文件都在但仍要扫码 | QQ 服务端会话失效；需要在 QQ 窗口验证                               |
| 配置损坏           | 按错误中的路径找到原文件，从备份恢复                                 |

更多入口见[排障与失败恢复](troubleshooting.md)。
