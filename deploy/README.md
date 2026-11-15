# Docker、Linux 与 Windows 部署指南

## 1. 安装与首次登录

安装向导第一步选择简体中文或 English，然后检查 Docker Engine 和 Compose v2。
缺少 Docker 时可选择：

- 不需要镜像源：显示 `curl -fsSL https://get.docker.com | bash -s docker`，确认后运行官方安装脚本。
- 需要镜像源：显示 `bash <(curl -sSL https://linuxmirrors.cn/docker.sh)`，确认后运行第三方安装脚本；镜像与防火墙等选项由你自行选择，本项目不要求关闭防火墙或 SELinux。

执行前的确认回车默认 `y`。已有 Docker 不重新安装、不改镜像设置；缺少 Compose v2 时另外询问插件安装。
官方手动安装指南：https://docs.docker.com/engine/install/

在源码目录执行：

```bash
bash deploy/install.sh --docker
```

首次可选访问方式、控制台/机器人端口、时区，回车使用默认值。配置保存在私有 `deploy/.env`；已有配置逐字保留。
安装成功后直接显示本次生成的控制台初始密码与实际地址；已有部署不会重新设置密码。
需要 sudo 访问 Docker 时，输出的日常命令也会包含 sudo。后续只运行 `manage.sh`，不用编辑 JSON。
默认 QQ 包固定版本并检查 SHA-256。官方地址不可用时会明确提示使用固定发行镜像，而非静默切换不同版本。
镜像来源是 `a1515333102/QQ-Releases` 的同名发行资产；校验保证匹配已固定的发行快照，不应把它说成腾讯提供的签名保证。
高级构建如指定 `QQ_DEB_URL`，必须同时指定该包的 `QQ_DEB_SHA256`，不会把自定义下载失败偷偷回退到默认包。

```bash
bash deploy/manage.sh logs
```

打开控制台 `http://127.0.0.1:5099`，设置自己的控制台密码，然后点 **打开 QQ 桌面**。
桌面复用控制台认证，不需要额外 VNC 密码。进入后仍在 QQ 窗口扫码，勾选 **QQ 自己的自动登录设置**。
不要把“程序启动”“接入成功”“QQ 登录成功”“机器人会自动回复”当成同一件事；首页会分别提示。

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

`start` 构建并等待健康检查，`restart` 正常结束进程再等待恢复，`stop` 不删除任何数据卷。
首次构建失败会返回非零状态，并保留原有数据。日志里的错误不是“安装完成”。

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

停止时先让程序关闭数据库和连接，再让 QQ 正常退出；超时才结束残留进程。
本地凭据不会在每次启动时生成、删除或由程序代替 QQ 重新登录。

**保留本地状态能避免部署导致的新环境，不保证 QQ 服务端永远认可会话。**
本项目不另存 QQ 密码，不伪造签名或设备令牌；会话过期或验证要求仍由 QQ 自己处理。

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

- 浏览器使用 HttpOnly、SameSite=Strict 的路径限定会话 Cookie；不把控制台令牌或 VNC 密码放进 URL。
- 桌面 HTTP、脚本和 WebSocket 都检查有效控制台会话；初始改密与协议确认不能绕过。
- WebSocket 必须携带与当前主机匹配的 Origin。退出、改密、会话到期后不能再发送桌面操作，空闲连接也会关闭。
- 后台 VNC 仍仅监听环回 5900，并保留独立认证；同源网关在服务器侧完成认证，不返回后台密码。
- 控制台高级入口配置仍支持外部桌面地址；外部服务由其自己的认证保护，不会自动获得控制台会话。

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

在控制台「配置」选择账号后，可新建/编辑/启停四种连接。复制按钮只复制端点地址，不带凭据或查询参数。
反向 WebSocket 要填写机器人程序提供的地址，不是控制台或 VNC 地址。
多账号使用监听服务时要为各账号分配不同端口，并发布对应端口；不能用一个正常账号来判断所有账号都就绪。

## 7. 排障

先运行：

```bash
bash deploy/manage.sh doctor
bash deploy/manage.sh logs
```

控制台「系统」显示工作目录、HOME、配置/消息/日志/默认 QQ 目录与是否可写，并能复制不含凭据的诊断。

| 现象 | 检查 |
| --- | --- |
| 控制台打不开 | 容器健康状态、端口冲突、SSH 隧道或局域网发布地址 |
| 桌面打不开 | 控制台会话是否有效、首次改密/协议是否完成、反代是否保留 Host 与 WebSocket 升级路径 |
| 没有 QQ 进程 | QQ 是否启动；Xvfb/QQ 错误日志，不要把空列表当成安装成功 |
| QQ 无法接入 | 原生组件与架构是否匹配、SYS_PTRACE、QQ 与程序用户是否一致 |
| 重启后 QQ 自动登录设置消失 | `nowluma_qq-home` 是否复用、HOME/XDG 是否被自定义启动方式覆盖、是否用了 `down -v` |
| 目录或凭据无法写入 | 数据卷属主、只读挂载、磁盘空间；不要使用 chmod 777 来掩盖问题 |
| 文件保留但 QQ 仍要求扫码 | QQ 服务端会话是否失效；需要在 QQ 窗口完成验证 |
| 配置损坏 | 程序会报错并保留原文件，不会静默覆盖成新配置 |
| #nl 仍有回复 | 检查当前账号的通用设置开关；下游机器人可能有自己的回复逻辑 |

### 验证自己的真实自动登录

第一次完成扫码并勾选 QQ 自动登录后：

```bash
bash deploy/manage.sh restart
```

在桌面确认 QQ 是否自动恢复，不要只看控制台的健康状态。再执行 `stop`、`start` 验证容器重建。
CI 可以验证目录/设置标记、机器 ID 和原生连接，但没有你的账号扫码，不会假报“真实 QQ 账号免扫码已验证”。

## 8. 升级、备份、卸载

- 先停服务再备份四个卷，避免复制正在写入的 SQLite/WAL。
- 升级源代码后运行 `start`，Docker 复用原卷。
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

`deploy/install.sh` 只在源码仓库里，不随 Lite 发行包分发。原生方式不自动安装 QQ 或修改你的用户目录。自己打开桌面 QQ 登录，再在首页按步骤连接。
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

CI 另外实际构建 Linux/amd64 Docker 镜像、启动官方 QQ/桌面/程序，检查原生连接，并验证停止/重启/重建时完整 HOME 和程序配置保留。
arm64 下载和原生产物有相应构建输入，未实际验证前不得把它标为已测试的平台。

许可和使用条款见根目录 LICENSE（Nowluma Non-Commercial License, NowlumaNC）、EULA.md、PRIVACY.md；冲突时以中文版本为准。第三方组件继续受其各自许可证约束，原生二进制适用 EULA 的单独条款。
