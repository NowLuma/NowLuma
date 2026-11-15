# 开发指南

## 环境

使用 `.node-version` 固定的 Node，以及 `package.json` 指定的 pnpm 11.25.0。
运行时支持范围以 `packages/runtime/check-node-version.cjs` 和各包 engines 为准，不要降低版本检查。

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm run build:all
node tools/check-release-layout.mjs dist
node tools/check-identity.mjs
```

修改 OneBot 动作名称、文档或返回 schema 后运行：

```bash
pnpm --filter @nowluma/mcp gen
```

生成目录检查会比较已提交快照；修改生成文件后，需要把对应源定义和生成文件一起提交。

## 主要目录

| 目录 | 职责 |
| --- | --- |
| `packages/bridge` | QQ 进程发现、原生通信、接入生命周期 |
| `packages/core` | 账号编排、WebUI 后端、运行/更新入口 |
| `packages/onebot` | 动作、事件转换、连接与存储 |
| `packages/protocol` | 协议解析、身份、媒体传输 |
| `packages/common` | 浏览器安全工具与基础设施 |
| `packages/webui` | 管理界面 |
| `deploy` | Docker、首次安装、日常管理、重建测试 |
| `packages/sdk`、`packages/mcp` | 客户端与工具接入 |

workspace 包名使用 `@nowluma/*`。重命名已同步 SDK 标识符、环境变量、构建和测试；新代码不要再引入旧产品标识。
原生二进制内容和旧套接字 ABI 暂时保持不变，外部文件名由发行构建管理。

## 测试与隔离

优先运行变更所有者的测试，然后跑工作区检查。
QQ 本地目录、令牌、密码和抓包数据不进入 fixtures、Git 或公开日志。
普通单测使用 fake；`pnpm dev` 可能发现本机 QQ，只有明确需要真实运行时才使用。

Docker 验证必须检查真实进程和重建结果，而非只检查 YAML 文本：

```bash
docker build -f deploy/docker/Dockerfile -t nowluma:ci .
node deploy/docker/smoke.mjs nowluma:ci
```

smoke 使用临时容器和自建测试卷，测试结束仅删除自己的测试资源。
它验证启动、原生连接、桌面、配置、完整 HOME 和机器 ID 的重启/重建保留；不会替用户扫码，也不证明 QQ 服务端长期接受某个账号。

## 格式与变更

保留账号隔离、输入校验、错误上下文和数据保护。不要用静默回退掩盖配置/存储失败。
不要为排障关闭全部容器隔离；只声明运行时实际需要的能力。
改动 UI 遵循 `packages/webui/README.md` 的交互约定；本轮不大改 QQ 接入内核。

```bash
pnpm exec eslint --config eslint.format.config.ts --fix <修改的文件>
pnpm exec prettier --write <修改的文件>
```

提交使用英文 Conventional Commit，例如 `fix(deploy): preserve QQ home across container recreation`。
本仓库使用 `main` 和功能分支，不依赖原维护者的发布账号、跨仓库 GitHub App 或自动关闭 PR 的政策。
若提交 issue，请通过仓库网页模板手动创建，记录可重现步骤，不上传私密账号数据。

## CI 与发行

`.github/workflows/ci.yml` 执行类型/静态/测试/发行布局检查，并实际构建、启动和重建 Linux/amd64 Docker 测试容器。
成功的构建会产生对应平台的 Lite 发行产物和 Windows x64 单文件 exe（当前未签名）。
尚未配置 npm、Docker Hub 或跨仓库自动发布；源码中的 SDK/UI/MCP 包可在工作区构建，不能把 npm 示例理解为已经发布的版本。
公开分发仍按 LICENSE（Nowluma Non-Commercial License, NowlumaNC）、EULA.md、PRIVACY.md 的条款和取得的授权进行。
修改版必须保留完整许可、显著标注 Nowluma 归属并标记修改版；商业使用须事先书面授权（ws675170761@gmail.com），非商业传播修改版须遵守许可条件。
根 README 末尾保留唯一的上游项目归属行，`tools/check-identity.mjs` 会从该行推导旧名称并检查全仓库；不要在其他文件、文件名或拆分字符串中重新引入旧品牌名。
第三方组件继续受其各自许可证约束，原生二进制适用 EULA 的单独条款；不要移除或追溯改写任何第三方、上游或贡献者的版权、归属与历史记录。
