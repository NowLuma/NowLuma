---
title: Debug
description: The four developer-tools tabs — action tester, message composer, live activity and API browser — including real side effects and failure handling.
---

# Debug

The 「调试」 page (`/debug`) is titled 「开发者工具」 (developer tools) with the subtitle 「接口测试 · 消息构建 · 实时观测 · API 参考」 *(interface testing · message building · live observation · API reference)*. It is meant for development and troubleshooting; it is visible to any signed-in user by default and can be hidden from layout editing.

**Read this first: calls made here really happen.** Sending a message really sends it; kicking a member really kicks them. There is no simulation mode and no “dry run” button.

## The four tabs

| Tab | Purpose | Kept mounted |
| --- | --- | --- |
| 测试台 (tester) | Pick an account and action, fill parameters, run, read the result | Yes (switching keeps state) |
| 消息构建 (message builder) | Visually compose a message and send it to a group or friend | Yes |
| 实时活动 (live activity) | Merged live stream of events and action calls | Yes |
| API 浏览器 (API browser) | Search action docs, see side-effect badges, prefill the tester | Loaded on demand |

## Action tester

| Area | Description |
| --- | --- |
| Account selector | Which account the call applies to |
| Action selector | Choose from the available action list |
| Parameter area | A form generated from the action's fields; switch to JSON mode to paste directly |
| Run | A normal call; actions that stream show frames as they arrive |
| Result area | Return code, data and error |
| History | Calls made in this session, reviewable |

The safety line is always visible in the tester: 「调用会真实生效 (真发消息 / 真踢人等), 请谨慎。」 *(calls take real effect — real messages, real kicks; be careful)*.

Non-read-only actions first open 「确认执行破坏性操作」 *(confirm destructive operation)*, whose body reads 「该操作会真实生效且通常不可撤销」 *(it takes real effect and is usually irreversible)*.

Parameter fields carry semantic roles (`group_id`, `user_id`, `member_id`, `message_id`, `file`, `image`, `record`, …), so the form knows whether a value is a number, a file choice or a message segment.

**Example (a safe first call)**: choose an account → choose a read-only action such as querying sign-in information → run. Expected result: the result area shows a return code and data, and history gains an entry. No side effects — a good way to confirm the link works.

**Example (a call with side effects)**: choose `send_group_msg`, fill a real group number and message text → run → confirm. Expected result: the message really lands in that group and the result returns a message ID. **There is no undo.**

## Message composer

| Control | Description |
| --- | --- |
| Segment list | Add and remove segments — text, image, voice, file and so on |
| Upload | Select a local file, upload it, and reference the returned path; uploads use a separate temporary directory |
| Target | Choose group or friend and fill in the ID |
| Send | Really sends |

The segment structure is OneBot's 「数组」 (array) format, so what you build here matches what a downstream bot sees when an endpoint uses 「数组」 — see [Endpoint configuration](onebot-config.md#every-field-in-the-node-dialog).

**Example**: add a text segment “test: ignore this” plus an image segment (upload a small image) → target your own alt account → send. Expected result: the alt account receives text and image in the same order as the list.

**Upload note**: uploads consume 「文件传输临时数据」 (file-transfer temporary data) space and can be cleaned under storage settings — see [Settings: Nowluma and platform](settings-runtime.md#storage).

## Live activity

One line per event or action call, merged, so you can watch what the program is doing.

| Control | Description |
| --- | --- |
| Pause | Stop appending/scrolling so you can read |
| Search | Text filter |
| 「导出 JSON」 | Export the current view as JSON |
| 「清空」 | Clear the view (server side untouched) |

**Example**: send a message to the account from your phone and watch for the matching event. Seeing it proves the event path works; not seeing it means switching to DEBUG in [Logs](logs.md) for more detail.

## API browser

| Element | Description |
| --- | --- |
| Search | Filter by action name or description |
| Category counts | Number of entries per category |
| 「只读」 / 「有副作用」 badges | Whether a call is safe |
| 「试一下」 | Prefill the tester with that action and its default parameters |

The fastest way to learn: read the badge first. Read-only actions are safe to poke; actions with side effects deserve a careful look at the parameters before running.

## Save and restart semantics

The debug page stores no configuration. What it leaves behind:

| Item | Lifetime |
| --- | --- |
| Tester history | This page session |
| Live activity view | This page session; clearing only clears the view |
| Uploaded temporary files | Written to the transfer temp directory, cleaned manually |

Refreshing the page loses history, but **side effects that already happened do not disappear**.

## Failure and recovery

| Symptom | Fix |
| --- | --- |
| Empty action list | The account is not online; bridge it first via [QQ connection](qq-connection.md) |
| Returns a “not connected” style error | The account dropped or the endpoint is not ready; check node state |
| A streaming call returns only a few frames | The action or the peer finished early; reproduce once with TRACE logging |
| Upload fails | Check file size and disk space; large files time out |
| Sent a message by mistake | There is no recall control; use the QQ client to recall it manually if still within the window |
| Kicked a member by mistake | Not reversible — a group admin has to re-invite |

**Advice**: test parameters against a test environment or your own alt account before touching a real group. The debug page offers no privilege separation — anything the signed-in account can do, this page can do.
