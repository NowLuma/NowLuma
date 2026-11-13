# Docker 与 Linux 部署指南

## 1. 安装与首次登录

需要 Docker Engine 和 Compose v2。官方安装指南：
https://docs.docker.com/engine/install/

在源码目录执行：

```bash
bash deploy/install.sh --docker
```

首次安装会生成私有的 `deploy/.env`，已有文件不会被覆盖。之后只运行 `manage.sh`，不用编辑 JSON。

```bash
bash deploy/manage.sh logs
bash deploy/manage.sh vnc-password
```

打开控制台 `http://127.0.0.1:5099`，设置自己的控制台密码，然后点 **打开 QQ 桌面**。
桌面密码只保护远程桌面，进入后仍需要在 QQ 窗口扫码。勾选的是 **QQ 自己的自动登录设置**。
不要把“程序启动”“接入成功”“QQ 登录成功”“机器人会自动回复”当成同一件事；首页会分别提示。

### 远程服务器

默认只把服务发布到宿主机回环地址。推荐在自己电脑执行：

```bash
ssh -L 5099:127.0.0.1:5099 -L 6080:127.0.0.1:6080 -L 3001:127.0.0.1:3001 用户名@服务器地址
```

保持隧道窗口打开，再访问本机控制台。安装向导也能显式选择局域网访问；不要直接把管理界面和明文 VNC 暴露到公网。

## 2. 日常命令

```bash
bash deploy/manage.sh start
bash deploy/manage.sh stop
bash deploy/manage.sh restart
bash deploy/manage.sh logs
bash deploy/manage.sh doctor
bash deploy/manage.sh vnc-password
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

## 5. 桌面地址和反向代理

控制台首页和 QQ 连接页可一键打开已运行的 noVNC；系统设置提供可选地址。

- `vncPort=6080`：按浏览器当前主机名生成端口入口。
- `vncPort=0` 且地址留空：隐藏入口。
- 通过 HTTPS 同源代理时，地址可填写 `/desktop/vnc.html?path=desktop/websockify`。
- 地址不允许 `javascript:`、协议相对地址或密码/令牌参数；打开桌面不会转发控制台令牌。
- 改入口不等于更改 websockify 监听端口。
- 环境变量覆盖会在设置中标出，界面显示实际入口，不把覆盖值偷偷写回配置文件。

Nginx 示例（TLS 和代理鉴权请按你的服务器设置）：

```nginx
location / {
    proxy_pass http://127.0.0.1:5099;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # 保留 X-Nowluma-Token；Authorization 可以由代理用于 Basic Auth。
}
location /desktop/ {
    proxy_pass http://127.0.0.1:6080/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

只在已配置受信任代理时设置 `trustProxy`；不要无条件信任公网请求的转发头。

## 6. 机器人连接

默认 HTTP/WS 端口为 3000/3001，客户端分别连接 `http://地址:3000/`、`ws://地址:3001/`。
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
| 桌面打不开 | 6080 映射、桌面密码、反向代理 WebSocket 升级路径 |
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
- 桌面访问密码保存在 QQ HOME 卷的私有 `.vnc/password` 中；需要时用 `vnc-password` 查看，勿公开导出。

## 9. 原生 Linux

使用 Linux 发行包，并安装支持的 Node；启动器也可使用同目录的可执行 `node`。

```bash
bash launcher.sh
# 或从源码目录指定已有发行包
bash deploy/install.sh --native --directory /发行包目录
```

原生方式不自动安装 QQ 或修改你的用户目录。自己打开桌面 QQ 登录，再在首页按步骤连接。
完整发行包的 Node 基线以 `check-node-version.cjs` 为准；不要用低版本 Node 绕过安全检查。

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

许可和使用条款见根目录 LICENSE、EULA.md、PRIVACY.md；更名不改变这些条款。
