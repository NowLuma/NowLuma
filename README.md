# Nowluma

<p align="center">
  <img src="assets/readme/hero.svg" alt="Nowluma" width="720" />
</p>

连接真实 QQ 客户端，向机器人程序提供 OneBot v11 接口，并用浏览器控制台管理账号、连接、日志和桌面。

QQ 登录始终由 QQ 自己完成。Nowluma 不保存 QQ 密码，不伪造设备令牌，也不替你完成扫码或风控验证。

[中文文档](docs/content/zh/index.md) · [English docs](docs/content/en/index.md) · [部署指南](deploy/README.md) · [开发指南](CONTRIBUTING.md) · [许可](LICENSE)

## 快速开始

| 平台 | 发行形态 | 需要 |
| --- | --- | --- |
| Windows x64 | `Nowluma.exe` 单文件，内置 Node 与运行环境 | 无需 Docker、Node 或 .NET；当前构建未签名 |
| Linux x64 | Lite 发行包 + `launcher.sh` | Node.js `24.22.1`（24.x）或 `>=26.12.1` |
| Docker（Linux） | 从源码目录运行安装向导 | Docker Engine 与 Compose v2 |

Windows 双击 `Nowluma.exe`，按提示选择本机 QQ；若已有 Linux Docker，也可选择隔离桌面。程序解压到 `%LOCALAPPDATA%\Nowluma` 并在浏览器打开控制台。发行说明应给出 SHA-256；没有校验值的二进制不要直接运行。

Linux 解压 Lite 包后运行 `bash launcher.sh`。`deploy/install.sh` 只存在于源码仓库，**不随 Lite 发行包分发**；从源码安装时可运行：

```bash
bash deploy/install.sh --docker          # Docker
bash deploy/install.sh --native --directory /发行包解压目录
```

Docker 向导先询问中文/English，检查 Docker 与 Compose，可选官方或 LinuxMirrors 镜像安装脚本，并显示将执行的命令。默认只发布到宿主回环地址：控制台与桌面 **5099**、机器人 HTTP **3000**、WS **3001**。

## 它做什么

- 发现本机 QQ 进程，按账号加载/卸载接入，保留账号隔离与消息/媒体历史。
- 提供 OneBot v11 的 HTTP API、HTTP 客户端、WS 服务端、WS 客户端四种端点。
- 控制台包含总览、QQ 连接、节点配置、日志、调试和系统设置。
- 桌面通过控制台同源路径 `/desktop/` 打开，复用控制台会话；只发布 5099，不再单独发布 6080。后台 VNC 只监听回环并保留独立密码，浏览器不会拿到该密码。
- Docker 完整持久化 `/home/nowluma`（QQ 设置、凭据、用户存储与机器 ID）；停止、重启、重建容器都复用同一组卷。

不要用 `docker compose down -v` 重启：它会删除卷。保留本地状态只避免因重建部署产生新环境，**不保证** QQ 服务端永远接受会话；过期、异地验证或风控要求扫码时，仍需在 QQ 窗口完成。

## 性能设置

外观设置里的「性能模式」提供 **自动检测（默认）**、**完整效果**、**低性能 / 关闭动效** 三档。自动模式只在本机前台持续低帧率时关闭动画和实时折射；检测结果不写回服务器，也不影响其他设备。它是中性的显示设置，不改变消息、账号或网络行为，不承诺帧率、省电或低端设备收益。

## 文档、站点与演示

- 文档源码：[`docs/content/zh`](docs/content/zh/index.md) / [`docs/content/en`](docs/content/en/index.md)，共 18 章。
- 静态站点由 `.github/workflows/pages.yml` 构建，项目路径为 `/Nowluma/`；是否已在线以仓库 Pages 设置为准。
- 演示路径 `/demo/` 是明确标注的模拟数据练习模式，不连接真实 QQ、不接收真实凭据，也不能用来证明机器人会回复。
- 文档不提供截图或“已视觉验收”的保证；界面外观仍在调整。

## 独立性与使用边界

Nowluma 是独立的第三方互操作项目，**与腾讯或 QQ 没有隶属、合作、授权或背书关系**。使用 QQ 客户端、账号、网络和第三方服务时，你须遵守 QQ 用户协议、相关法律以及获得授权的非商业研究边界。

你对自己使用的账号、数据、网络、凭据和操作负责。软件按“现状”提供，不保证 QQ 自动登录、消息投递、机器人回复、长期稳定性或账号安全，也不提供封号/风控概率保证。arm64 Docker 与原生产物有构建输入但未实际验证，不要标成已测试平台。

原生接入仍是当前实现：仓库保留的六份 `nowluma-*` 原始预编译文件（三个平台各 `.node` 加 `.dll`/`.so`）就是当前发行使用的原生组件，内部字节与必要的旧套接字 ABI 保持不变。另有外部重写尝试，尚未完成、未随包发布，也不在本轮验证范围内；本项目没有重写 QQ 接入内核。双内核选择器尚未实现；将来引入时，原内核需要用户主动知情并接受风险，不会预勾选或静默回退。

## 许可

源码采用 **Nowluma Non-Commercial License (NowlumaNC)**：源码可见、仅限非商业使用，允许在许可条件下修改与非商业传播。传播修改版必须保留完整许可、显著标注 **Nowluma** 归属并标记修改版；商业使用需事先书面授权。它不是 GPL，也不授予任何商业权利。

第三方组件继续受其各自许可证约束；`nowluma-*.node` / `*.dll` / `*.so` 是单独提供、仅可随包运行的专有组件，适用 `EULA.md`。本许可不重新许可、也不删除第三方或原生组件的版权与义务。完整条款以中文文本为准，见 [`LICENSE`](LICENSE)、[`EULA.md`](EULA.md)、[`PRIVACY.md`](PRIVACY.md)。

## 联系与侵权处理

项目联系、商业授权与侵权处理：**ws675170761@gmail.com**

本项目参考了 **SnowLuma** 的实现思路。
