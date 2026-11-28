---
layout: home
title: Nowluma — 自托管 QQ 与 OneBot 控制台
description: 自托管 QQ 会话与 OneBot v11，管理机器人连接、运行日志和调试。提供 Windows x64、Linux Lite 与 Linux Docker 安装入口。
hero:
  name: Nowluma
  text: QQ 会话与 OneBot v11
  tagline: 在自己的设备上运行，用浏览器管理 QQ 会话、机器人连接和运行日志。
  actions:
    - theme: brand
      text: 下载发行包
      link: https://github.com/NowLuma/NowLuma/releases
    - theme: alt
      text: 阅读文档
      link: /zh/index.html
features:
  - title: QQ 会话
    details: 查看进程、账号和连接状态。Linux Docker 部署还能在控制台打开 QQ 桌面。
  - title: 机器人连接
    details: 按账号配置 OneBot v11 的 HTTP 和 WebSocket 端点，接入你自己的机器人。
  - title: 日志与调试
    details: 查看实时日志、导出记录，在控制台测试接口和检查返回结果。
---

## 下载与安装 {#downloads}

Linux 不需要浏览器下载：在终端运行命令即可。Windows 使用发行页的单文件 EXE。

- **Linux Docker（amd64，推荐）**：在 Bash 终端运行安装向导。向导检查 Docker 与 Compose v2，默认只发布到本机回环；公网模式必须显式选择并确认风险。
- [Linux x64 Lite](/zh/install-native.html#linux-lite)：在终端下载并核对 `SHA256SUMS`，解压后运行 `bash launcher.sh`。
- [Windows x64](/zh/install-native.html#windows)：从发行页下载内置运行环境的单文件 EXE（未签名）。

Linux Docker 安装命令：

```bash
bash <(curl -qfsSL --proto =https https://nowluma.github.io/NowLuma/install.sh || echo 'exit 1')
```

Docker 安装完成后用 `nowluma` 管理服务：直接运行显示数字菜单，也可用 `nowluma start`、`stop`、`restart`、`logs`、`doctor`、`pull`、`update`。旧安装可继续使用 `bash deploy/manage.sh`。

Windows 发行文件、Linux Lite 包与校验值都发布在 [GitHub 发行页](https://github.com/NowLuma/NowLuma/releases)。

## 先试用，再部署

[打开模拟器](/demo/) 用示例数据熟悉控制台。部署完成后，按[首次启动指南](/zh/first-run.html)进入自己的控制台。
