---
title: Nowluma 中文文档
description: 新工作台、账号内核与 GPL 许可的完整中文指南目录：安装、首次启动、六个页面、设置项、部署、数据与排障。
---

# Nowluma 文档

Nowluma 连接正在运行的 QQ 客户端，把账号接入 OneBot v11，并在浏览器里提供一套管理工作台。它不登录 QQ，也不保存 QQ 密码。

## 阅读路线

| 你的情况 | 从这里开始 |
| --- | --- |
| 第一次部署 Linux Docker | [Docker 安装](install-docker.md) → [首次启动](first-run.md) → [QQ 会话](qq-connection.md) |
| 已经能打开控制台，想连机器人 | [机器人连接](onebot-config.md) → [运行记录](logs.md) |
| 想先弄懂概念 | [Nowluma 是什么](introduction.md) → [访问方式与网络](access-network.md) |
| 帮别人排障 | [排障与失败恢复](troubleshooting.md) → [运行记录](logs.md) |
| 只想点一点界面 | [模拟练习模式](demo.md) |
| 改代码或提 PR | [参与开发](developing.md) |

## 章节

| 章节 | 内容 |
| --- | --- |
| [Nowluma 是什么](introduction.md) | 组成部分、连接状态、保存语义、账号内核与许可 |
| [Docker 安装](install-docker.md) | Linux 安装向导、端口、数据卷、日常命令 |
| [原生安装](install-native.md) | Linux Lite、Windows 单文件 exe、源码运行 |
| [首次启动](first-run.md) | 登录、双重验证、阅读说明、设置访问密码 |
| [工作台](overview.md) | 顶栏、底部导航、引导、布局、部件、展示模式 |
| [QQ 会话](qq-connection.md) | 进程状态、接入、账号内核选择、卸载、桌面 |
| [机器人连接](onebot-config.md) | 每个账号的消息行为与四种连接 |
| [运行记录](logs.md) | 实时日志、预设、级别、TRACE、导出 |
| [调试工具](debug.md) | 接口调用、发送消息、活动记录、接口库 |
| [偏好设置：外观与账号](settings-console.md) | 主题、性能模式、无障碍、密码与 2FA |
| [偏好设置：运行与服务](settings-runtime.md) | 全局配置、存储、通知、服务、更新 |
| [访问方式与网络](access-network.md) | SSH、局域网、反向代理、TLS、桌面认证 |
| [数据、备份与更新](data-backup.md) | 数据位置、备份恢复、清理、QQ 持久化 |
| [排障与失败恢复](troubleshooting.md) | 从现象定位到安全恢复 |
| [模拟练习模式](demo.md) | `/demo/` 能练什么、不能证明什么 |
| [计划中与未验证](planned.md) | 重写内核、平台与发行状态 |
| [参与开发](developing.md) | GPL、目录、验证、提交与发行 |

## 约定

- 文中引号里的文字是界面上真实出现的简体中文标签；英文文档只解释这些标签，不另造界面文案。
- 状态词以界面为准：QQ 进程是「可加载」「加载中」「等待连接」「等待登录」「已在线」「错误」「已断开」；机器人端点是「正常」「注意」「异常」「应用失败」「未启用」。
- 外部地址一律写成示例：`http://127.0.0.1:5700`、`https://bot.example.invalid`、`admin@example.invalid`。
- 「已保存」「已生效」「已连接」是三件不同的事，见[三种不同的保存结果](introduction.md#三种不同的保存结果)。
- 文档会对照源码与测试校对，但没有对当前界面做浏览器视觉验收；不写像素坐标，也不承诺帧率或视觉效果。
- 链接都是相对路径，离线打开也能用。站点构建使用 `https://wsxyt.github.io/Nowluma/` 基路径；实际发布由维护者执行，本文档不声称已经上线。`/demo/` 随同一次静态构建生成。

## 文档不承诺的事

- 不保证 QQ 服务端永远接受已保存的登录会话；过期或要求验证时仍要在 QQ 窗口完成。
- 不保证账号不受限制，也不提供封号/风控概率。
- 「端点正常」只表示正在监听或已连接，不表示机器人程序会自动回复。
- 未发布的能力、签名产物、镜像标签或性能基准不写成现状，统一列在[计划中与未验证](planned.md)。
