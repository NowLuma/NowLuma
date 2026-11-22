---
title: Nowluma 中文文档
description: 从安装 Nowluma 到接入 QQ 与 OneBot v11 机器人，查阅配置、维护和排障步骤。
tutorial: index
---

# Nowluma 文档

按下面的路线开始，或点上方的 **加载模拟器** 熟悉工作台。练习和配图使用示例数据。

![教学控制台中的工作台与主导航](/images/tutorials/overview.png)

## 阅读路线

| 你的情况     | 从这里开始                                                                                |
| ------------ | ----------------------------------------------------------------------------------------- |
| 在服务器部署 | [Docker 安装](install-docker.md) → [首次启动](first-run.md) → [QQ 会话](qq-connection.md) |
| 在桌面运行   | [原生安装](install-native.md) → [首次启动](first-run.md) → [QQ 会话](qq-connection.md)    |
| 接入机器人   | [QQ 会话](qq-connection.md) → [机器人连接](onebot-config.md) → [运行记录](logs.md)        |
| 定位故障     | [排障与失败恢复](troubleshooting.md) → [运行记录](logs.md)                                |
| 安装前先体验 | [模拟练习模式](demo.md)                                                                   |

## 章节

### 开始使用

| 章节                                      | 内容                             |
| ----------------------------------------- | -------------------------------- |
| [Nowluma 中文文档](index.md)              | 阅读路线与章节目录               |
| [Nowluma 是什么](introduction.md)         | 组成部分、连接状态、保存与许可   |
| [Docker 安装（Linux）](install-docker.md) | 安装向导、端口、数据卷与日常命令 |
| [原生安装](install-native.md)             | Linux Lite、Windows 启动器与源码 |
| [首次启动](first-run.md)                  | 登录、首次设置与选择账号内核     |

### 接入与调试

| 章节                           | 内容                                 |
| ------------------------------ | ------------------------------------ |
| [工作台](overview.md)          | 导航、连接工作流、部件与展示模式     |
| [QQ 会话](qq-connection.md)    | 进程状态、账号内核、接入与卸载       |
| [机器人连接](onebot-config.md) | 按账号设置消息行为与 OneBot 连接     |
| [运行记录](logs.md)            | 实时日志、筛选、TRACE 与导出         |
| [调试工具](debug.md)           | 接口调用、发送消息、活动记录与接口库 |

### 配置与维护

| 章节                                        | 内容                              |
| ------------------------------------------- | --------------------------------- |
| [偏好设置：外观与账号](settings-console.md) | 主题、无障碍、密码与双重验证      |
| [偏好设置：运行与服务](settings-runtime.md) | 监听、存储、通知与更新            |
| [访问方式与网络](access-network.md)         | SSH、局域网、反向代理、TLS 与桌面 |
| [数据、备份与更新](data-backup.md)          | 备份恢复、清理与升级              |
| [排障与失败恢复](troubleshooting.md)        | 按现象定位问题并恢复              |

### 学习与参与

| 章节                      | 内容                       |
| ------------------------- | -------------------------- |
| [模拟练习模式](demo.md)   | 章节引导与独立模拟器       |
| [路线图](planned.md)      | 内核、平台与发行计划       |
| [参与开发](developing.md) | 许可、仓库结构、测试与发行 |

<span id="文档不承诺的事" class="legacy-heading-anchor" aria-hidden="true"></span>

## 使用指南 {#约定}

- 控制台顶部的语言按钮可切换中英文，模拟器使用当前章节的语言。
- 交互练习和搜索请使用[公开文档站](https://nowluma.github.io/NowLuma/)或本地 HTTP 预览。
- 不确定改动何时生效时，查看[三种不同的保存结果](introduction.md#三种不同的保存结果)。
