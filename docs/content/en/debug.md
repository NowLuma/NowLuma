---
title: Debug tools
description: Four workspaces for action calls, message composition, live activity and the API library, plus side-effect and account safety boundaries.
tutorial: debug
---

# Debug tools

Use Debug tools to test an action or inspect the events coming from the selected account.

![Debug action, account and parameter controls](/images/tutorials/debug.png)

Path `/debug`. It is a developer and troubleshooting workspace: call OneBot actions, compose and send messages, watch live activity, and read the API catalog. The header says `选择账号与接口，构建消息并查看实时结果。` and shows `N 个账号 · N 个接口`.

## Four workspaces

| Tab        | Purpose                                                                           |
| ---------- | --------------------------------------------------------------------------------- |
| `接口调用` | Choose account/action, fill parameters, run; streaming and history                |
| `发送消息` | Choose group or friend, compose OneBot segments, send                             |
| `活动记录` | Live events and calls; pause, export, search                                      |
| `接口库`   | Browse signatures, parameters, constraints and returns; `试一下` opens the tester |

The first three stay mounted when switching tabs, so drafts and the live feed survive a glance elsewhere. The large API library loads on demand.

## Action tester

1. Choose `账号` and `接口` (searchable).
2. Fill `请求参数` as a form or JSON; a no-parameter action says `该接口无参数。`.
3. Read the badges: `只读`, `有副作用`, `流式`.
4. Press `运行调用` or `运行流式调用`. Use `取消` to stop a running stream.

Results show `响应内容` or `实时帧` / `N 帧`, with the error detail if a call fails. `历史` keeps this session's calls for replay; `清空` clears only history.

Validation blocks malformed input: `参数 JSON 格式无效`, `参数必须是 JSON 对象`, `请选择账号`, `请选择或输入接口名称`.

Upload-style actions can also be found in `接口库` and run from `接口调用`; confirm the account and target first, and do not auto-retry a failed upload.

<span id="safety-boundaries" class="legacy-heading-anchor" aria-hidden="true"></span>

**Destructive actions** such as deleting or recalling open `确认执行破坏性操作`. Other actions marked `有副作用`, including sending a message, may submit as soon as you press `运行调用`. Check the selected account and destination first. If you're unsure what a call does, start with a read-only action.

**In the simulator:** follow the prompts to run `send_private_msg` for the sample account, then use its returned `message_id` with `get_msg` to retrieve the same record.

## Send message

- Choose `账号` and `目标` (`群聊` / `私聊`).
- Compose `消息内容`; `内容预览` shows the actual segments.
- A merge-forward may contain only forward nodes; other segments must be placed inside one, otherwise the UI explains the error.
- `发送` becomes `发送 (合并转发)` when forward nodes are present.
- `发送失败` shows the error; `请求完成` means the request was processed. To verify delivery, check the conversation on the receiving side.

Empty messages, missing account or target are rejected with a reason.

## Live activity

Shows `调用` and `事件`.

| Control        | Effect                                                          |
| -------------- | --------------------------------------------------------------- |
| State          | `已连接`, `重连中`, `未连接`; a deliberate pause reads `已暂停` |
| Pause / resume | Stops UI updates, not the server                                |
| `导出 JSON`    | Exports current activity                                        |
| `清空`         | Clears the current view                                         |
| Search         | Filter by type/account/content; type `全部` / `事件` / `调用`   |

`因客户端过慢丢弃了 N 条` reports dropped events. Redact account, message and path data before sharing the activity feed or an export.

## API library

Browse by category; search name, summary or alias. Each action shows `只读` / `有副作用` / `流式`, aliases, a parameter table (name, type, required, description, default, constraints) and returns.

`试一下` carries the action into the tester and switches tabs; it does not execute automatically. The catalog is derived from the debug action definitions, not hand-maintained separately.
