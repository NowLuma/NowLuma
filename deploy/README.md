# Docker、Linux 与 Windows 部署指南

## 1. 安装与首次登录

预构建安装使用 [Docker Hub 标签页](https://hub.docker.com/r/nowluma/nowluma/tags)中已发布的 Linux/amd64 版本。在 Linux 终端运行：

```bash
bash -c 'set -e; tmp=$(mktemp); trap "rm -f -- \"\$tmp\"" EXIT; curl -q --proto "=https" --proto-redir "=https" -fsSL -o "$tmp" https://nowluma.github.io/NowLuma/install.sh; test -s "$tmp"; bash "$tmp" "$@"' nowluma-install
```

先选简体中文或 English，向导再检查 Docker 和 Compose v2。缺少 Docker 时，可选择官方安装脚本或第三方 LinuxMirrors；后者提供镜像源选择。向导显示命令并等待确认。已有 Docker 则沿用当前配置。

选择安装目录（默认 `$HOME/Nowluma`）、已发布的 Docker Hub 版本、访问方式、端口和时区。已知版本时，可在命令末尾加 `--version 版本`。新安装将 Compose 配置和管理脚本放在 `deploy/`，并用其中的 `.env` 记录设置。再次运行会复用原有配置。

首次拉取镜像失败时，向导不会保存新部署；可重新运行并选择已发布的版本。GitHub 发行或 GHCR 标签不代表 Docker Hub 已发布。

向导在容器通过健康检查后打印地址和新生成的初始密码。需要 sudo 访问 Docker 时，输出的管理命令也会带 sudo。

### 从源码构建（可选）

在完整源码目录执行 `bash deploy/install.sh --docker`。此模式构建 `nowluma:local`，不需要已发布的 Nowluma 镜像。
默认 QQ 包固定版本并校验 SHA-256；官方地址不可用时会提示使用固定镜像。该镜像来自 `a1515333102/QQ-Releases` 的同名发行资产，校验不代表腾讯签名。自定义 `QQ_DEB_URL` 必须同时设置 `QQ_DEB_SHA256`。

### 首次登录

```bash
bash deploy/manage.sh logs
```

打开向导输出的控制台地址，用初始密码完成[首次设置](https://nowluma.github.io/NowLuma/zh/first-run.html)。点击 **打开 QQ 桌面**，在 QQ 窗口登录并可选启用 QQ 的自动登录。返回 **QQ 会话** 刷新和加载进程；首次接入时选择兼容内核并确认该账号的风险说明。

### 远程服务器

默认只把服务发布到宿主机回环地址。推荐在自己电脑执行：

```bash
ssh -L 5099:127.0.0.1:5099 -L 3001:127.0.0.1:3001 用户名@服务器地址
```

保持隧道窗口打开，再访问本机控制台。安装向导也能显式选择局域网访问；不要直接把管理界面和明文 VNC 暴露到公网。

## 2. 日常命令

```bash
bash deploy/manage.sh start
bash deploy/manage.sh stop
bash deploy/manage.sh restart
bash deploy/manage.sh logs
bash deploy/manage.sh doctor
```

`start` 使用已拉取的版本镜像（源码部署则构建 `nowluma:local`）并等待健康检查。`restart` 正常结束进程并等待恢复，不拉取或构建。`stop` 不删除数据卷。
拉取失败返回状态码 `3`；启动失败也返回非零。两者都保留已有数据，不算安装成功。

## 3. 数据与自动登录

Compose 项目名固定为 `nowluma`，卷名不随源码目录名变化：

| 卷 | 容器目录 | 内容 |
| --- | --- | --- |
| `nowluma_config` | `/app/config` | 控制台密码/2FA、连接、运行和外观设置 |
| `nowluma_data` | `/app/data` | 账号消息库、媒体 |
| `nowluma_logs` | `/app/logs` | 运行日志 |
| `nowluma_qq-home` | `/home/nowluma` | QQ 完整用户环境、自动登录设置、凭据、用户存储和机器 ID |

QQ 和程序固定运行于 UID/GID **1000**，使用相同 HOME 和 XDG 环境；不是使用安装脚本调用者的 UID。
`XDG_CONFIG_HOME=/home/nowluma/.config`，QQ 的配置目录是其中的 `QQ`。
整个 HOME 会保存，包括 `.local/share` 等目录，而不仅是 `login.db`。
机器 ID 在 HOME 中首次生成，容器重建后继续复用；主机名固定为 `nowluma`。
XDG 运行目录是临时的 `/tmp/nowluma-runtime`，不要持久化陈旧进程锁或套接字。

停止时先关闭程序的数据库和连接，再让 QQ 正常退出。重启后沿用原 QQ HOME；如 QQ 要求重新验证，请打开 QQ 桌面完成验证。

## 4. 健康检查和注入权限

健康检查验证：QQ 进程仍存在、VNC/桌面监听正常、WebUI 可访问。
若必要进程退出，入口脚本会结束服务并报告失败，让 Docker 重启，不会悄悄留下一个只有控制台的容器。

原生会话接入需要附加到同容器中的 QQ 进程，因此 Compose 增加 `SYS_PTRACE`。
入口只给固定用户保留这个附加能力。不使用 `--privileged`、宿主 PID 命名空间或宿主网络。
默认保留 Docker seccomp 策略；不能靠关闭全部隔离把一次错误伪装成成功。
镜像内 QQ 使用容器所需的 `--no-sandbox` 启动，因而桌面访问应保持在可信网络或 SSH/TLS 代理后。

原生组件仅改外部文件名；内部二进制、接口和必要的旧套接字 ABI 保留。
这些兼容标识不是新的产品名称，也不能据此声称已移除腾讯的风控识别特征。

## 5. 桌面认证和反向代理

Docker 的桌面通过控制台同源路径 `/desktop/` 访问，只有一个管理端口 5099，不再单独发布 6080。

QQ、Xvfb、openbox 与 x11vnc 运行在同一个容器、同一个完整 HOME 中，不是每个账号一台 VM；多账号共用这个桌面环境。

- 浏览器使用 HttpOnly、SameSite=Strict 的路径限定会话 Cookie；不把控制台令牌或 VNC 密码放进 URL。
- 桌面 HTTP、脚本和 WebSocket 都检查有效控制台会话；说明阅读确认与首次改密不能绕过。
- WebSocket 必须携带与当前主机匹配的 Origin。退出、改密、会话到期后不能再发送桌面操作，空闲连接也会关闭。
- 后台 VNC 仍仅监听环回 5900，并保留独立认证；同源网关在服务器侧完成认证，不返回后台密码。
- 自动的「打开 QQ 桌面」始终使用同源 `/desktop/`，不会使用浏览器 UA 或配置的外部地址；只有实际应用同源网关的 Linux 服务器会显示入口。

Nginx 示例（先配置 TLS；`Host` 必须保留真实访问端口）：

```nginx
location / {
    proxy_pass http://127.0.0.1:5099;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 3600s;
    # 保留 X-Nowluma-Token；Authorization 可以由代理用于 Basic Auth。
}
location /desktop/ {
    proxy_pass http://127.0.0.1:5099;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
}
```

不要移除桌面路径中的 `/desktop/`，也不要把它代理到旧的 6080 端口。
只在已配置受信任代理时设置 `trustProxy`；不要无条件信任公网请求的转发头。

## 6. 机器人连接

默认 HTTP/WS 端口为 3000/3001；安装时选择其他端口后，工厂监听与宿主发布端口一致，控制台复制的端点地址使用实际监听端口。
客户端分别连接 `http://地址:HTTP端口/`、`ws://地址:WS端口/`。
Docker 的工厂监听会绑定容器网卡，宿主侧是否开放由 Compose 的发布地址决定。
默认只在宿主回环发布。每个接入端点仍需要独立访问令牌；控制台密码不能代替 OneBot 令牌。

在控制台「机器人连接」选择账号后，可新建/编辑/启停四种连接。复制按钮只复制端点地址，不带凭据或查询参数。
反向 WebSocket 要填写机器人程序提供的地址，不是控制台或 VNC 地址。
多账号使用监听服务时要为各账号分配不同端口，并发布对应端口；不能用一个正常账号来判断所有账号都就绪。

机器人端点不会绕过账号内核：QQ 会话必须先用该账号确认的内核接入，端点才可能进入 `运行中`。

## 7. 排障

先运行：

```bash
bash deploy/manage.sh doctor
bash deploy/manage.sh logs
```

控制台「偏好设置 → 服务」显示工作目录、HOME、配置/消息/日志/默认 QQ 目录与是否可写，并能复制不含凭据的诊断。

| 现象 | 检查 |
| --- | --- |
| 控制台打不开 | 容器健康状态、端口冲突、SSH 隧道或局域网发布地址 |
| 桌面打不开 | 控制台会话是否有效、说明阅读与首次改密是否完成、反代是否保留 Host 与 WebSocket 升级路径 |
| 没有 QQ 进程 | QQ 是否启动；Xvfb/QQ 错误日志，不要把空列表当成安装成功 |
| QQ 无法接入 | 原生组件与架构是否匹配、SYS_PTRACE、QQ 与程序用户是否一致 |
| 重启后 QQ 自动登录设置消失 | `nowluma_qq-home` 是否复用、HOME/XDG 是否被自定义启动方式覆盖、是否用了 `down -v` |
| 目录或凭据无法写入 | 数据卷属主、只读挂载、磁盘空间；不要使用 chmod 777 来掩盖问题 |
| 文件保留但 QQ 仍要求扫码 | QQ 服务端会话是否失效；需要在 QQ 窗口完成验证 |
| 配置损坏 | 程序会报错并保留原文件，不会静默覆盖成新配置 |
| #nl 仍有回复 | 检查当前账号「机器人连接 → 消息行为」的状态回复开关；下游机器人可能有自己的回复逻辑 |

### 验证自己的真实自动登录

第一次完成扫码并勾选 QQ 自动登录后：

```bash
bash deploy/manage.sh restart
```

在桌面确认 QQ 是否自动恢复，不要只看控制台的健康状态。再执行 `stop`、`start` 验证容器重建。
CI 可以验证目录/设置标记、机器 ID、进程发现与未确认账号的接入门禁，但没有你的账号扫码，不会假报“真实 QQ 账号免扫码已验证”。最新 smoke 使用全新 HOME，真实 hook 接入与真实 QQ 登录是 NOT RUN。

## 8. 升级、备份、卸载

- 先停服务再备份四个卷，避免复制正在写入的 SQLite/WAL。
- 镜像部署：确认新标签发布后，只修改 `deploy/.env` 的 `NOWLUMA_IMAGE` 版本（保留 `docker.io/nowluma/nowluma:` 前缀），然后执行 `bash deploy/manage.sh update` 拉取并启动。拉取失败时可改回原标签。
- 源码部署：更新源码后运行 `start`。两种方式均复用原卷，普通启动不会改变部署模式。
- 原生升级保留 `config/`、`data/`、`logs/`；QQ 的目录不搬动。
- 不要用 `down -v` 升级。彻底删除所有数据前请自行确认备份；普通 `stop` 不删除卷。
- 后台 VNC 凭据保存在 QQ HOME 卷的私有 `.vnc/password`；浏览器和安装向导不需要读取它，勿公开导出。

## 9. 原生 Linux 与 Windows

### Linux Lite

使用 Linux 发行包，并安装支持的 Node；启动器也可使用同目录的可执行 `node`。

```bash
bash launcher.sh
# 或从源码目录指定已有发行包
bash deploy/install.sh --native --directory /发行包目录
```

Lite 包自身不含 `deploy/install.sh`。原生方式不自动安装 QQ 或修改你的用户目录。自己打开桌面 QQ 登录，再在首页按步骤连接。
完整发行包的 Node 基线以 `check-node-version.cjs` 为准；不要用低版本 Node 绕过安全检查。

### Windows 单文件 exe

Windows x64 使用自包含的 `Nowluma.exe`：

- 内置 Node 与运行环境，不需要 Docker、Node 或 .NET。
- 双击后解压到 `%LOCALAPPDATA%\Nowluma` 并在浏览器打开控制台；可选本机 QQ，或在已有 Linux Docker 时选择隔离桌面。
- 当前构建**未签名**，可能触发 SmartScreen；发行说明应给出 SHA-256，没有校验值的二进制不要直接运行。
- 关闭窗口可能提前结束进程；建议按 Ctrl+C 正常停止。QQ 用户数据和设置不会被删除。
- 真实 QQ 登录、注入与长期会话仍需你自己验证；这不是签名或真实账号验收声明。

## 10. 构建与验证

开发工具：`.node-version` 固定 Node、pnpm 11.25.0。

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm run build:all
node tools/check-release-layout.mjs dist
node --test deploy/docker/healthcheck.test.cjs
docker compose -f deploy/docker-compose.yml config --quiet
```

`pnpm docs:build:all` 从 `deploy/` 复制安装脚本、管理脚本和 Compose 配置到 Pages 根目录。站点检查会逐一核对发布文件。

CI 另外实际构建 Linux/amd64 Docker 镜像、启动官方 QQ/桌面/程序，并验证全新 HOME 下的进程发现、未确认账号不会自动接入、桌面认证、停止/重启/重建时完整 HOME 和程序配置保留。真实 hook 接入与真实 QQ 登录在该 smoke 中是 NOT RUN；历史 CI 通过记录不构成本次账号验收。
arm64 下载和原生产物有相应构建输入，未实际验证前不得把它标为已测试的平台。

许可和使用条款见根目录 LICENSE（GNU GPLv3，GPL-3.0-only）、LICENSING.md、EULA.md 与 PRIVACY.md。GPL 源码可自由使用、修改和分发（含商业用途）；随包的预编译原生组件与第三方组件适用各自条款，不属于 GPL 源码范围。
