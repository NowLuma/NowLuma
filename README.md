# Nowluma

<p align="center">
  <img src="assets/readme/hero.svg" alt="Nowluma" width="720" />
</p>

连接 QQ 客户端，提供 OneBot v11 接口，在一个浏览器控制台里管理账号、连接、日志和桌面。

[下载发行包](https://github.com/WSXYT/Nowluma/releases) · [中文文档](docs/content/zh/index.md) · [English docs](docs/content/en/index.md) · [部署指南](deploy/README.md) · [参与开发](CONTRIBUTING.md)

## 开始使用

| 环境 | 安装方式 | 运行要求 |
| --- | --- | --- |
| Windows x64 | 双击 `Nowluma.exe`，在浏览器进入控制台 | 已内置运行环境，无需安装 Node、.NET 或 Docker |
| Linux x64 | 解压 Lite 包，运行 `bash launcher.sh` | Node.js `24.22.1`（24.x）或 `>=26.12.1` |
| Linux Docker | 从源码目录运行下方安装向导 | Docker Engine 与 Compose v2，向导可协助安装 |

```bash
bash deploy/install.sh --docker
```

向导先选择中文或 English，再检查 Docker、选择安装来源，并配置访问地址、端口和时区。执行安装脚本前会展示命令。`deploy/install.sh` 位于源码仓库，不包含在 Lite 包中。

默认通过本机或 SSH 隧道访问：控制台与 QQ 桌面 **5099**、机器人 HTTP **3000**、WebSocket **3001**。

1. 打开安装结果中的控制台地址，使用初始密码完成首次设置。
2. 点击 **打开 QQ 桌面**，在 QQ 窗口登录；桌面直接使用控制台会话。
3. 在 **节点配置** 中选择账号，连接自己的机器人程序。

Windows 启动器可使用本机 QQ；已有可用的 Linux Docker 引擎时，也可选择容器桌面。程序文件位于 `%LOCALAPPDATA%\Nowluma`。当前 EXE 未签名，下载后可用发行页的 `SHA256SUMS` 核对文件。

## 一个控制台，照顾日常操作

- **总览**：账号、端点与主机状态，带首次使用引导和可编辑布局。
- **QQ 连接**：选择进程、接入账号、打开桌面、查看连接问题。
- **节点配置**：HTTP API、HTTP 客户端、WebSocket 服务端与客户端。
- **日志与调试**：搜索、筛选、导出日志，查看事件和测试动作。
- **设置**：外观、账号安全、通知、存储、备份、TLS 与更新。

默认采用中性配色，深浅主题、强调色和现有调色板均可调整。性能模式支持自动、完整效果和低性能；检测结果只影响当前设备。

发送纯文本 `#nl` 可查看版本、平台和运行时间。在 **节点配置 → 选择账号 → 通用设置** 中可关闭内置状态回复。

双语文档共 18 章。站点包含复用真实控制台组件的 `/demo/` 练习模式，使用内存中的示例数据，不连接真实 QQ。

## 运行与数据

```bash
bash deploy/manage.sh start       # 启动
bash deploy/manage.sh restart     # 重启并检查状态
bash deploy/manage.sh stop        # 停止，保留数据
bash deploy/manage.sh logs        # 查看日志
bash deploy/manage.sh doctor      # 部署诊断
```

程序设置、消息与媒体、日志分别保存在 `config/`、`data/`、`logs/`。Docker 另外完整保留 QQ 的 `/home/nowluma` 用户目录；升级时同时保留程序数据卷和 QQ HOME 卷。

**重启不要使用 `docker compose down -v`，该命令会删除数据卷。** QQ 自动登录由 QQ 自己管理，过期或要求验证时仍需在 QQ 窗口完成。

桌面通过同源 `/desktop/` 访问，无需输入 VNC 密码，也无需额外开放桌面端口。远程访问、备份与故障恢复见[部署指南](deploy/README.md)。

## 使用与许可

Nowluma 是独立的第三方项目，与腾讯及 QQ 无隶属、合作、授权或背书关系。使用 QQ 客户端、账号与第三方服务时，请遵守 QQ 用户协议及适用法律。

软件按现状提供。使用者负责自己的账号、数据与操作；项目不保证自动登录、消息投递或账号不受限制。

源码采用 **GNU 通用公共许可证第 3 版（GPL-3.0-only）**：可自由使用、研究、修改与分发，包括商业用途，无需额外授权；分发时遵守 GPLv3 的源码与许可要求。根目录 [LICENSE](LICENSE) 是 GNU 发布的 GPLv3 标准全文，未作修改。随包的预编译原生组件与第三方组件不属于 GPL 源码，各自条款见 [LICENSING.md](LICENSING.md)；[使用说明](EULA.md)与[隐私说明](PRIVACY.md)分别说明运行边界与数据处理。

侵权投诉：**ws675170761@gmail.com**（仅用于侵权投诉；源码与使用问题请通过 GitHub issues 提出，不要附带个人信息）。

本项目参考了 **SnowLuma** 的实现思路。
