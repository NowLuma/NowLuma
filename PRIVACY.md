# Nowluma 隐私与数据处理说明 / Privacy & Data Handling Notice

- **生效日期 / Effective date:** 2026-11-15
- **版本 / Version:** 1.3
- **维护者 / Maintainer:** Nowluma contributors
- **问题反馈 / Issues:** GitHub issues

中英文文本有冲突时，以中文文本为准。 / If the texts conflict, the Chinese version prevails.

## 中文版

### 1. 运行与数据存放

Nowluma 在你选择的设备或服务器上运行。程序配置、账号和关系信息、消息与媒体缓存、运行日志保存在该部署的 `config/`、`data/`、`logs/` 等目录中；具体内容和保留时间取决于启用的功能与设置。

QQ 自己的登录状态保存在 QQ 用户目录中。Docker 部署会持久化整个 QQ HOME；Nowluma 不另建 QQ 密码库。控制台密码以加盐哈希保存；连接令牌、两步验证配置、通知地址等仍属于需要保护的本地配置。导出的备份和日志也可能包含个人信息。

### 2. 浏览器中的数据

浏览器保存控制台会话令牌、外观缓存和部分设备偏好。桌面使用同源、HttpOnly 的会话 Cookie；后台 VNC 密码不会返回给浏览器。退出会话会撤销访问，但不会删除部署中的消息、配置或 QQ 自己的登录状态。

文档站的模拟器使用内存中的示例数据，重置或刷新后恢复初始状态。请在练习时使用页面给出的示例凭据。

### 3. 网络请求与接收方

运行相应功能时，可能发生以下网络通信：

- **QQ 与媒体服务**：QQ 客户端、协议请求、头像及媒体加载会访问对应服务；例如头像请求包含账号标识。相关服务按其自身规则处理请求信息。
- **机器人与通知渠道**：已配置的 OneBot HTTP/WebSocket 端点、Webhook 或邮件服务会接收设置允许的事件、消息或通知内容。运营者决定目的地址、凭据和转发范围。
- **版本查询与下载**：查询版本、检测下载线路或下载更新时，会请求 GitHub 和所配置的镜像；协助安装 QQ、Docker 时会访问所选下载来源。这些服务可见 IP 地址、请求路径和常规请求头等网络信息。
- **远程控制台**：访问控制台、桌面、日志或导出功能的已授权用户可以取得对应内容。反向代理、托管平台及运营者自己的日志规则也可能影响数据处理。

当前源码没有内置使用统计、匿名遥测上报或向项目维护者上传账号、消息的功能，也没有可供关闭这些功能的遥测开关。若未来改变该行为，应同步更新本说明与控制台展示的文档。

### 4. 运营者的选择与责任

请按实际需要配置消息保留、媒体缓存、日志、通知和端点访问权限。处理联系人或群成员的信息时，应取得所需授权，并响应适用的访问、更正、删除等请求。

清理、备份和恢复由运营者在自己的部署中执行；停止或卸载程序不等同于删除数据卷或备份。向维护者提交问题时，请先移除令牌、密码、账号数据库和无关个人信息。

### 5. 联系与变更

隐私问题请通过仓库 GitHub issues 提出，并先移除令牌、密码、账号数据库和无关个人信息。维护者通常无法操作你自己的部署；请勿为排障发送真实登录凭据。

本说明的更新会随发行包发布并注明版本。控制台按文档内容计算版本，内容变化后会重新展示文档供阅读确认；这不是许可接受条件，GPLv3 不要求为运行软件接受许可。

## English Version

### 1. Runtime and local storage

Nowluma runs on the device or server you choose. Configuration, account and relationship information, message and media caches, and runtime logs are stored in directories such as `config/`, `data/` and `logs/` in that deployment. Their contents and retention depend on the enabled features and settings.

QQ manages its own login state in its user directory. Docker persists the complete QQ HOME; Nowluma does not maintain a separate QQ password database. The console password is stored as a salted hash. Connection tokens, two-factor settings and notification destinations remain sensitive local configuration. Exported backups and logs may also contain personal information.

### 2. Browser data

The browser stores the console session token, appearance cache and some device preferences. The desktop uses a same-origin HttpOnly session cookie; its backend VNC password is not returned to the browser. Logging out revokes access but does not delete messages, configuration or QQ's own login state.

The documentation simulator uses example data in memory and returns to its initial state on reset or refresh. Use the example credentials shown in the practice guide.

### 3. Network requests and recipients

Using the relevant features may cause the following communication:

- **QQ and media services:** the QQ client, protocol requests, avatars and media access their corresponding services. Avatar requests, for example, include an account identifier. Those services process requests under their own rules.
- **Bots and notification channels:** configured OneBot HTTP/WebSocket endpoints, webhooks and email services receive the events, messages or notifications allowed by the settings. The operator chooses destinations, credentials and forwarding scope.
- **Version queries and downloads:** version checks, download-route probes and updates access GitHub and configured mirrors. Assisted QQ or Docker installation accesses the selected download sources. These services can observe network information such as IP addresses, request paths and ordinary request headers.
- **Remote console access:** authorized users of the console, desktop, logs or export features can obtain the corresponding content. Reverse proxies, hosting platforms and the operator's logging rules may also affect processing.

The current source contains no built-in usage analytics, anonymous telemetry reporting, or account/message uploads to project maintainers. It has no telemetry switch for disabling such features. Any future change should update this notice and the documents shown in the console.

### 4. Operator choices and responsibilities

Configure message retention, media caches, logs, notifications and endpoint access according to your needs. Obtain any required authority to process contacts' or group members' information and respond to applicable access, correction and deletion requests.

The operator performs cleanup, backup and recovery on their own deployment. Stopping or uninstalling the application does not delete data volumes or backups. Remove tokens, passwords, account databases and unrelated personal information before submitting an issue.

### 5. Contact and changes

For privacy questions, use the repository's GitHub issues and remove tokens, passwords, account databases and unrelated personal information first. Maintainers generally cannot operate your deployment; do not send real login credentials for troubleshooting.

Updates to this notice ship with a versioned release. The console derives the version from the documents' contents and shows them again for reading when those contents change; this is not a licence acceptance condition, and GPLv3 does not require accepting a licence to run the software.
