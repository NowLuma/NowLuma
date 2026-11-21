---
title: Bot connections
description: 'Per-account message behaviour and HTTP/WebSocket endpoints: tabs, fields, tokens, auto-save, hot reload and recovery.'
tutorial: onebot-config
---

# Bot connections

Select the account in the lesson above, open a transport and edit its example configuration. Observe whether a successful save was also applied; use real endpoint addresses and tokens only in your own console.

![Bot connection configuration for an example account](/images/tutorials/connection.png)

_Figure: tutorial endpoints exist only in memory and never open a real listening socket._

Path `/config`. Heading: `按账号管理连接方式与消息行为，改动自动保存。` Every adapter belongs to the selected QQ account; switching accounts with unsaved edits asks `放弃未保存的修改？`.

## Layout

1. Account strip: `账号` chips with avatar, nickname and UIN.
2. Five category tabs: `消息行为`, `HTTP 接口`, `HTTP 推送`, `WebSocket 监听`, `反向 WebSocket`.
3. Editor bar: `UIN …`, save state chip, `立即保存`, and `添加连接` where relevant.
4. Editing area: message settings or a row table per transport.

The active tab is remembered.

## Message behaviour

### Login history sync

`登录时同步云端历史` — next login or restart. It fetches at most 3 groups and 3 friends, 20 messages each, at least 2 seconds apart. It only writes local history; it does not replay events or change read state.

### Status reply

| Setting            | Meaning                                                                    |
| ------------------ | -------------------------------------------------------------------------- |
| `启用状态回复`     | Anyone can trigger; off means no response                                  |
| `触发词`           | Default `#nl`, max 32 characters; leading/trailing spaces and case ignored |
| `回复冷却（秒）`   | Same conversation is not answered again during cooldown; 0 means unlimited |
| `拦截已命中的消息` | The trigger is not forwarded downstream; it still replies and logs         |

### Notification opt-in

`上下线通知渠道` selects global channels for this account. The badge shows `已选 N / 共 M`; `全选` selects only enabled channels. Empty states: `还没有全局渠道——先到「设置 → 通知」添加。` and `未选择任何渠道。展开以选择。`. Stale selected IDs are kept, not silently dropped. Channel CRUD is under [Settings → Notifications](settings-runtime.md#notifications).

## Four transports

| Tab              | Default                                     | Purpose                                    |
| ---------------- | ------------------------------------------- | ------------------------------------------ |
| `HTTP 接口`      | `127.0.0.1:3000`, path `/`                  | Local HTTP API; optional WebSocket and SSE |
| `HTTP 推送`      | `http://127.0.0.1:5700`                     | Push events to a URL                       |
| `WebSocket 监听` | `127.0.0.1:3001`, role `Universal`          | Wait for bot connections                   |
| `反向 WebSocket` | `ws://127.0.0.1:8080/ws`, reconnect 5000 ms | Connect out to the bot                     |

Copied addresses never include the token or query parameters: `复制地址不含令牌，请在机器人程序中单独填写。` Listening does not mean a bot has connected.

## Connection list

Rows are read-only summaries; all editing goes through the dialog.

- Name or `(未命名)`; badges `名称重复`, `已停用`.
- Meta: `数组` / `CQ 码`, `含自身消息` / `不含自身消息`, `令牌已设置` / `未设令牌`.
- Live state: `运行中`, `待检查`, `未连接`, `应用失败`, `未启用`, with detail and last error on hover.
- Actions: enable toggle, `编辑`, copy address, `删除`.

Deleting asks `删除连接 …？`, explains that this removes the configuration and stops that protocol service, and leaves other connections and message history alone. To pause a connection, use the toggle rather than deleting it.

## Dialog fields

| Section        | Fields                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Connection     | `启用`, `名称`, transport-specific defaults                                                                         |
| Authentication | `授权 Token` with generate, copy and show/hide                                                                      |
| Behaviour      | `启用 WebSocket`, `启用 SSE`, `消息格式` (`数组` / `CQ 码`), `角色` (`Universal` / `Event` / `Api`), `上报自身消息` |
| Address        | `主机`, `端口`, `路径` or `目标 URL`, `超时 (ms)`, `重连间隔 (ms)`                                                  |
| Advanced       | `单帧上限 (bytes)`                                                                                                  |

`127.0.0.1` accepts local connections only. `0.0.0.0` requires a firewall and a strong token; the dialog warns about this. Duplicate names show `名称与其它节点重复` and block save. The footer uses `添加连接` / `保存连接`, with `保存中…` while writing.

## Save and apply

- Message behaviour is debounced (500 ms) and auto-saved; `立即保存` forces it.
- Transport changes are written immediately.
- Chip meanings: `已保存并应用` (server hot-reloaded), `已保存，下次连接时应用` (offline account or next connect), `已保存，但热重载失败：…`, `保存失败：…`.
- If only part of the reload fails, the previous endpoints are restored best-effort; the failure is shown rather than reported as success.
- Offline accounts can still save; the change applies when the account next connects.

## Example

Goal: expose account `10001` over HTTP on port 3000.

1. Select the account, open `HTTP 接口`, `添加连接`.
2. Keep `127.0.0.1`, port `3000`, path `/`, leave WS/SSE off, copy the generated token.
3. Save. With the account online, expect `已保存并应用`; offline, expect `已保存，下次连接时应用`.
4. Copy the endpoint address (no token) and paste it, plus the token, into the bot.
5. Expected: the row changes to `运行中` once the bot connects. Listening alone is not proof the bot is receiving.

## Tokens and addresses

- Generate a fresh 32-byte token per endpoint; do not reuse the console password.
- Copying the address intentionally omits the token; configure it separately.
- Changing a token disconnects bots using the old one; update and reconnect them.
- For reverse WebSocket, enter the bot's address, not the console or desktop address.
- Multiple accounts using listeners need distinct ports and matching published ports.

## Troubleshooting

| Symptom                   | Check                                                      |
| ------------------------- | ---------------------------------------------------------- |
| Bot cannot connect        | Enabled, address, port, path, token                        |
| Row says `未启用`         | Turn the toggle on; deleting is not pausing                |
| `应用失败`                | Saved but hot reload failed; read the error and save again |
| Token change dropped bots | Expected; update the bot with the new token                |
| Offline account           | Save succeeds but waits for next connect                   |
| Empty tab                 | Create the first connection of that type                   |
