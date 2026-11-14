---
title: Endpoint configuration (OneBot)
description: Per-account general settings and the four OneBot network endpoints — HTTP API, HTTP client, WS server and WS client — with every field, token rules, message formats and save semantics.
---

# Endpoint configuration (OneBot)

The 「节点配置」 page (`/config`) manages two things per account: that account's general behaviour (history sync, the `#nl` status command, notification opt-in) and the OneBot endpoints it exposes.

The left rail lists accounts under 「在线连接」 (online connections), showing 「暂无在线会话」 (no online sessions) when empty. **Only online accounts appear there** — saving still works for an offline account, but the result says it will apply on the next connection.

## Header and save state

| Element | Description |
| --- | --- |
| 「OneBot 协议端点」 | Page title |
| `UIN {selectedUin}` | Selected account |
| Save-state chip | See the table below |
| 「新建 {service type}」 | Only on the four network tabs |
| 「保存」 | Save this account's configuration |

Chip values:

| Chip | Meaning |
| --- | --- |
| 未保存 (unsaved) | Changes not yet saved |
| 保存中 (saving) | Request in flight |
| 已保存并应用 (saved and applied) | Persisted, and the running endpoints hot-reloaded |
| 已保存，下次连接时应用 (saved, applied on next connection) | Persisted; the account is offline |
| 已保存，但热重载失败：{reason} | Persisted; hot reload failed and the old endpoints were restored best-effort |
| 保存失败：{reason} | Nothing was persisted |
| 上一版本已保存，当前修改待保存 | The older change succeeded; the newer one is pending |

The chip clears after three seconds. Switching accounts with unsaved edits opens 「放弃未保存的修改？」 (discard unsaved changes?); choosing 「放弃并切换」 discards them.

## Tabs

The fixed order is general settings, HTTP API, HTTP client, WS server, WS client. Each network tab carries a node-count badge, supports arrow keys and Home/End, and the last tab you used is remembered.

| Tab | Description text | Node noun | Defaults for a new node |
| --- | --- | --- | --- |
| HTTP API | Listen on a local HTTP port; OneBot clients send requests | HTTP API 服务 | `http-N`, `127.0.0.1:3000`, path `/`, WS/SSE off, a generated 32-byte token |
| HTTP client | POST events to a remote URL | HTTP 推送客户端 | `httppost-N`, `http://127.0.0.1:5700` |
| WS server | Listen on a local WebSocket port for persistent clients | WebSocket 服务 | `ws-N`, `127.0.0.1:3001`, role `Universal` |
| WS client | Connect out to an external WebSocket server (reverse WS) | WebSocket 反向客户端 | `wsclient-N`, `ws://127.0.0.1:8080/ws`, reconnect 5000 ms |

Above the node list on all four tabs sits the same warning: the copied address excludes the token, the token must be entered in the bot program separately, and **a healthy listener does not mean a bot is connected**.

## General settings

### Backfill cloud history on sign-in

- Label 「登录时补齐云端历史记录」 with the subtitle 「下次账号登录或重启后生效」 *(applies on the next sign-in or restart)*.
- Deliberately bounded: at most 3 groups and 3 friends, 20 messages per session, at least 2 seconds apart.
- It only fills locally missing history. It **never replays events** and never changes read state on the server.
- Changing it while the account is online does not backfill immediately; wait for the next sign-in or restart.

### Built-in `#nl` status command

| Control | Description |
| --- | --- |
| Toggle | Off means the program stops answering `#nl`; a downstream bot's own reply logic is unaffected |
| 「触发词」 (trigger word) | Up to 32 characters, trimmed and lowercased on save; default `#nl` |
| 「不转发给下游（swallow）」 | When on, messages matching the trigger are not forwarded to the bot, so both sides do not answer |
| 「回复冷却（秒）」 | `0` means unlimited |

**Example**: send the plain text `#nl` and expect a reply with version, platform and uptime. Change the trigger to `#status` and save: `#nl` no longer answers, `#status` does.

### Notification opt-in

This selects **which channels this account** may trigger:

- The collapsed row summarises how many channels are selected; expanding reveals a searchable list.
- 「全选」 (select all) only selects enabled channels — it never turns on disabled ones.
- Channel creation, webhook/email fields and test sends live under [Settings: Nowluma and platform](settings-runtime.md#notifications).

**Save semantics**: general settings debounce for 500 ms and save automatically — no 「保存」 needed. Any node mutation (create, edit, delete, enable/disable) saves immediately.

## Node cards

Each node is summarised as a card:

| Element | Description |
| --- | --- |
| Name | A 「名称重复」 (duplicate name) badge when it collides, or 「已停用」 (disabled) |
| Status chip | 正常 / 注意 / 异常 / 应用失败 / 未启用 |
| Summary line | Listen address or target address |
| Message format | 「数组」 (array) or 「CQ 码」 (CQ codes) |
| Self messages | 「上报自身」 or 「不上报自身」 |
| Token | 「已设 Token」 or 「无 Token」 |
| 「复制端点地址（不含凭据）」 | Copies the address only, without the token, user info or query string |
| Enable switch / edit / delete | Toggling takes effect immediately; deleting removes the node at once |

The empty state offers 「暂无 {type} 节点」 plus 「创建第一个」 (create the first one).

## Every field in the node dialog

| Field | Where | Description |
| --- | --- | --- |
| 启用 (enabled) | All | Off means the node is disabled when saved |
| 名称 (name) | All | Required; a duplicate reports 「名称与其它节点重复」 and blocks saving |
| 授权 Token | All | Generate, copy, toggle visibility; policy feedback appears inline |
| 主机 (host) | Inbound (HTTP API / WS server) | Listen address; `0.0.0.0` allows external access and needs firewall rules |
| 端口 (port) | Inbound | Listen port |
| 路径 (path) | Inbound | For example `/` or `/onebot` |
| 启用 WebSocket | HTTP API | Serve WebSocket on the same port |
| 启用 SSE | HTTP API | Serve SSE reporting on the same port |
| 消息格式 (message format) | All | 「数组」 = standard OneBot message segments; 「CQ 码」 = compatible string form |
| 角色 (role) | WS server | `Universal` / `Event` / `Api`, deciding which frames this connection sends and receives |
| 上报自身消息 | All | 「上报自身」 or 「不上报自身」 |
| 目标 URL | Outbound (HTTP client / WS client) | The address your bot provides, not the console address |
| 超时 (ms) | HTTP client | Request timeout |
| 重连间隔 (ms) | WS client | Reconnect delay after a drop |
| 单帧上限 (bytes) | WS client | Maximum frame size; larger frames are rejected |
| 取消 / 创建节点 / 保存修改 | Footer | Create for new nodes, save changes for edits |

## Examples for the four endpoint types

### 1 — Give a local bot an HTTP API

1. Select an account → 「HTTP API」 → 「新建 HTTP API 服务」.
2. Host `127.0.0.1`, port `3000`, path `/`, message format 「数组」.
3. Generate a token with the button next to the token field and copy it.
4. Press 「创建节点」. If the account is online, the chip reads 「已保存并应用」.
5. Configure `http://127.0.0.1:3000/` and that token in the bot.

**Expected result**: the card reports 「正常」 and the overview's 「OneBot 连接」 widget lists it. Actions succeeding proves the address and token are right; it does not prove the bot will reply in a group.

### 2 — Push events to your own service

1. 「HTTP client」 → create a node.
2. Target URL `http://127.0.0.1:5700` (example), keep the default timeout.
3. Save and log requests on your service.

**Expected result**: your service receives POST requests. If nothing arrives, check the node state first: 「异常」 means the connection failed; 「正常」 with no traffic means your service's auth or path is rejecting it.

### 3 — Let a bot connect in (reverse WS)

1. 「WS server」 → create a node.
2. Host `127.0.0.1`, port `3001`, role `Universal`.
3. Use 「复制端点地址（不含凭据）」 and enter the token separately in the bot.

**Expected result**: after the bot connects, the card reads 「正常」. If it keeps reconnecting, the token or path is usually wrong.

### 4 — Connect out to a bot's WebSocket

1. 「WS client」 → create a node.
2. Target URL `ws://127.0.0.1:8080/ws`, reconnect `5000`, frame cap per the other side's documentation.

**Expected result**: 「正常」 once connected, and an automatic reconnect after the peer restarts. **This is the peer's address**, not the console or desktop address.

## Tokens, addresses and what “ok” means

- The copy button copies only the address. Copy the token separately so credentials do not end up in chats or screenshots.
- Every endpoint has its own token; the console access password cannot substitute for an OneBot token.
- 「正常」 means the port is listening or a connection is established. Whether the bot handles actions correctly, and whether it replies, must be verified on the bot side.
- Accounts sharing a listener need distinct ports, and those ports must be published by your deployment.

## Saving, hot reload and restarts

| Case | Result | When it takes effect |
| --- | --- | --- |
| Account online | `saved=true, applied=true` | Hot-reloaded immediately; chip reads 「已保存并应用」 |
| Account offline | `saved=true, applied=false` | On the account's next connection |
| Partial hot-reload failure | `saved=true, applied=false` plus per-endpoint errors | Old endpoints restored best-effort; fix the configuration and save again |
| Validation or write failure | `saved=false` | Nothing changed |

Configuration lives in the program config directory and does not need a program restart to affect online accounts. **Listener-level** changes (console port, bind address, TLS) are elsewhere — see [Settings: Nowluma and platform](settings-runtime.md#service).

## Recovery

| Symptom | Fix |
| --- | --- |
| 「名称与其它节点重复」 | Choose another name; names must be unique per account |
| Chip says hot reload failed | Read the per-endpoint message: a busy port means change the port; an invalid bind address means change the address |
| Bot cannot connect | Confirm the node is not disabled, then check address, port, path and token |
| Old bot dropped after changing the token | Expected: the old credential is invalid. Put the new token in the bot |
| Need to pause an endpoint | Use the card's enable switch rather than deleting the node |
| Account never comes online | Fix [QQ connection](qq-connection.md); the configuration is not the problem |
