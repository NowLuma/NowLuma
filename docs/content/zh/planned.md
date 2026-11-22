---
title: 路线图
description: 重写内核、平台验证与发行分发的下一步计划。
tutorial: planned
---

<span id="计划中与未验证" class="legacy-heading-anchor" aria-hidden="true"></span>

# 路线图

接下来的重点是验证重写内核、扩展平台覆盖，并简化发行包的安装与校验。

![内核选择中的可用与暂不可用选项](/images/tutorials/account-kernel.png)

## 重写内核

重写内核尚未发布，现有部署请使用兼容内核。开放前，要在各支持平台用真实账号验证接入、重连与卸载。内核选择与风险确认仍按账号分别保存，内核之间不会静默切换。

## 平台

- **Linux Docker arm64**：在 arm64 实机验证桌面登录、账号接入，以及重建容器后完整 QQ HOME 的保留情况。现有部署请按 [amd64 安装指南](install-docker.md)操作。
- **Windows x64**：验证原生接入、登录与会话恢复。现有[启动器未签名](install-native.md#windows)，代码签名是单独的发行目标。
- **Linux Lite**：使用实际发行包，在桌面环境验证接入与重连。

## 发行与更新

已验证的 Docker Hub 版本见 [Docker 安装指南](install-docker.md#安装向导)。后续版本通过 Linux/amd64 匿名拉取和安装验收后，再列入指南。发行文件与校验值见 [GitHub 发行页](https://github.com/NowLuma/NowLuma/releases)。

<span id="文档站点" class="legacy-heading-anchor" aria-hidden="true"></span>

安装向导和双语指南按实际发布的平台与标签更新。

## 显示效果 {#性能与外观}

调整显示默认值前，在实机上测量玻璃材质与动效的开销，并检查减少动态效果、减少透明与高对比模式。

<span id="需要你自己验证" class="legacy-heading-anchor" aria-hidden="true"></span>

## 如何参与

协助验证账号或平台时，记录版本、系统架构、设置步骤和通过的检查项。会话恢复请在 [QQ 客户端](data-backup.md#qq-的持久化与手动验证)确认，消息投递以接收端为准。提交记录前可先查阅[本地验证](developing.md#本地验证)。
