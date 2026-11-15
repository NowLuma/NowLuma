---
title: 参与开发
description: 许可与署名边界、仓库结构、Node 与 pnpm 基线、测试与格式约定、提交与评审流程，以及发行相关声明的限制。
---

# 参与开发

这一章写给要改代码、提 PR 或做二次分发的人。使用文档见 [文档首页](index.md)。

## 许可与你能做什么

| 事项 | 情况 |
| --- | --- |
| 源码是否开源 | **不是** OSI 定义的开源许可。它叫「Nowluma 非商业许可（NowlumaNC）」 |
| 允许 | 查看、学习、个人或其他非商业使用、非商业自托管，以及在条款条件下修改和非商业传播 |
| 需要事先书面授权 | 任何商业使用；超出许可明确允许范围的发布 |
| 修改版传播 | 必须保留完整许可、显著标注 Nowluma 归属并标记修改版；不得冒充官方版本 |
| 原生二进制 | 随包的 `nowluma-*.node` / `*.dll` / `*.so` 是独立的专有组件，不属于源码许可范围 |
| 官方发行包 | 另外受 EULA 与 PRIVACY 条款约束；三者中中文版本在冲突时优先 |

上游项目署名只保留在根 `README.md` 的**最后一行**，作为许可与历史记录要求的归属说明。**不要在产品名、包名、界面、环境变量或新文档里重新引入上游品牌名**：这一轮更名已经把工作区包名（`@nowluma/*`）、环境变量（`NOWLUMA_*`）、SDK 标识和备份应用标识都换过了。`tools/check-identity.mjs` 会从该行推导旧名称，并检查文件名、文本、原生 ABI 例外和二进制跳过规则；不要用拆分字符串绕过检查。

原生组件当前只改了**外部文件名**，内部字节和必要的旧套接字 ABI 保持不变。仓库保留的六份 `nowluma-*` 原始预编译文件（三个平台各两份）就是当前发行使用的原生组件。另有外部重写尝试，尚未完成、未随包发布；其观察只覆盖部分 Windows DLL 构建，`.node` 链接、真实注入、收发校准、登录和 Linux 配对都未在本仓库验证。不要为了「看起来更干净」去改当前预编译文件的二进制内容。

本轮不重写 QQ 接入内核。双内核选择器尚未实现；将来引入时，原内核需要用户主动知情并接受风险，所有 QQ 接入路径都不会预勾选或静默回退。

## 仓库结构

| 目录 | 职责 |
| --- | --- |
| `packages/bridge` | QQ 进程发现、账号检测、原生通信生命周期 |
| `packages/core` | 按账号编排、WebUI 后端、启动/更新组装 |
| `packages/onebot` | 动作、事件转换、账号存储、HTTP/WebSocket |
| `packages/protocol` | 包解析、身份映射、协议与媒体请求 |
| `packages/common` | 叶子工具；浏览器导入不能拉进 Node 文件系统模块 |
| `packages/webui` | React 控制台 |
| `packages/proto-defs` / `packages/proton` | 类型 schema 与编解码生成 |
| `packages/sqlite` / `packages/websocket` | 提供的原生绑定与封装 |
| `packages/runtime` | 发行脚手架与原始预编译产物 |
| `packages/sdk` / `mcp` / `ui` | 消费端 API 与工具包 |
| `deploy` | Docker、安装、进程监管、持久化、Windows 启动器与冒烟检查 |
| `docs/content` | 本文档树（中文 `zh/`、英文 `en/`、覆盖表 `coverage.json`） |

## 环境

使用 `.node-version` 固定的 Node（`24.22.1`）和 `package.json` 指定的 pnpm（`11.25.0`）。运行时支持范围以 `packages/runtime/check-node-version.cjs` 和各包 engines 为准，不要为了跑通而降低版本检查。

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm run build:all
node tools/check-release-layout.mjs dist
node tools/check-identity.mjs
node --test deploy/docker/healthcheck.test.cjs
```

不要通过改依赖或锁文件来绕过失败。

## 测试

| 场景 | 命令 |
| --- | --- |
| 单个包 | `pnpm --filter @nowluma/<package> test`（前端包名是 `webui`） |
| 全部工作区 | `pnpm test` |
| 原生覆盖 | `pnpm test:native` |
| Docker 真实检查 | `docker build -f deploy/docker/Dockerfile -t nowluma:ci .` 然后 `node deploy/docker/smoke.mjs nowluma:ci` |

规矩：

- 优先跑变更所有者的测试，再跑工作区检查。
- QQ 本地目录、令牌、密码、抓包数据不进 fixtures、不进 Git、不进公开日志。
- 普通单测使用 fake；`pnpm dev` 可能发现本机真实 QQ，只有明确要做真实运行时测试才用。
- `pnpm test:native` 缺原生产物或目标平台缺失是 NOT_RUN，**不是**跳过验证的许可。

## 格式

四个空格缩进 TypeScript，沿用现有 import、组件与日志模式。只格式化你改过的文件：

```bash
pnpm exec eslint --config eslint.format.config.ts --fix <修改的文件>
pnpm exec prettier --write <修改的文件>
```

## 生成文件

改了 OneBot 动作名称、文档或返回 schema 之后：

```bash
pnpm --filter @nowluma/mcp gen
```

生成目录检查会比较已提交快照。要把源定义和生成文件一起提交，不要只提交一半。

## 提交与评审

- 提交信息用英文 Conventional Commits，例如 `fix(deploy): preserve QQ home across container recreation`。
- 目标分支是当前仓库的 `main`，用功能分支提 PR；不依赖其他仓库的发布流程。
- 仓库有 issue 模板（缺陷、功能请求）和 PR 模板；PR 还会经过一个策略检查脚本。
- 提交 issue 请通过仓库网页模板手动创建，写清可复现步骤。**不要上传私密账号数据、日志或抓包。**
- 评审关注：账号隔离、输入校验、错误上下文、数据保护；失败不能被静默转成成功。

## 变更边界

- 本轮不重写 QQ 接入内核。修共享函数时先读所有调用方和相邻测试。
- 保留按账号的身份、消息/媒体历史、有符号非零 int32 消息 ID、停止顺序与在途任务。
- 解析输入与产生副作用要分开；在信任边界上校验；保留错误细节。
- 期望保存的配置要和已应用的运行时配置、环境变量覆盖区分开。
- 不要用默认值覆盖损坏的凭据/配置，也不要自动删除用户数据。
- 媒体发送要等待校验过的上传完成，不要盲目重试不确定的写入。
- HTTP/WS 监听必须保留配置的绑定、认证、TLS 失败处理与有界缓冲。
- SSE 保留账号隔离、游标、上报过滤与令牌失效后的关闭。
- SDK 的 NodeNext 相对导入保留显式 `.js`，并维持新包导入测试与公开动作映射覆盖率。

## CI 与发行

现有流水线做的是：类型检查、静态检查、测试、发行布局检查，并实际构建、启动和重建 Linux/amd64 Docker 测试容器。成功的构建会产生对应平台的 Lite 发行产物和 Windows x64 单文件 exe（当前未签名）。

**尚未配置**的发布通道包括 npm、镜像仓库和跨仓库自动发布。因此：

- 不要把源码里的 SDK/UI/MCP 包示例当成「已经发布到 npm 的版本」。
- 不要声称存在签名过的可执行文件、官方镜像或未经验证的安装包。
- 发布前要自己核对实际产物与校验值；本文档不背书的平台不要标成「已测试」。

## 文档贡献

- 只改 `docs/content/` 下的 Markdown 与 `coverage.json`。
- 页面用相对 `.md` 链接互连，每个文件开头有 `title` 和 `description` 的 YAML frontmatter。
- 中英文两棵树结构一致；改一章要同时改两种语言。
- 不要编造功能、截图或执行结果。界面外观仍在调整，文档引用**稳定的标签与行为**而不是像素位置。
- `coverage.json` 把每个控制台功能/分组映射到页面；新增界面功能时要同步更新它。

## 提 PR 前的自查

1. `pnpm typecheck`、`pnpm lint`、相关包测试都过了吗？
2. 改了生成内容吗？源文件和生成文件都提交了吗？
3. 新增/修改的文案是否泄漏真实账号、令牌或主机名？
4. 文档改动是否同时改了 `zh/` 和 `en/`，并更新了 `coverage.json`？
5. 有没有把「计划中」的功能写成「已发布」？
