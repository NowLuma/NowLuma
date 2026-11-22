---
title: QQ sessions
description: Discover and attach a running QQ, choose and acknowledge the access kernel per real UIN, refresh the pipe, unload and open the desktop.
tutorial: qq-connection
---

# QQ sessions

Use the lesson above to choose a kernel, attach the sample account, then unload it.

![QQ session page with the identified example process](/images/tutorials/qq-session.png)

![Per-account kernel dialog before risk acknowledgement](/images/tutorials/account-kernel.png)

Open `QQ 会话` (`/processes`) to find running clients, attach the selected account, reconnect its pipe or unload it.

## Page structure

| Area         | Content                                                                               |
| ------------ | ------------------------------------------------------------------------------------- |
| Header       | `刷新`; `打开 QQ 桌面` only when the server actually provides the same-origin desktop |
| Sort         | `PID`, `名称`, `状态`; hidden when there is only one process                          |
| Process list | Avatar or placeholder, name, state badge, `PID … · QQ …`, path and error              |
| Detail       | Process, account, attach state, session connection, optional path/error               |
| Actions      | `加载` or `卸载`, plus `刷新管道` when relevant                                       |

Desktop shows list and detail together; narrow screens select first. The selected PID owns every detail and action, so a disappearing or re-sorted process never retargets an operation.

## Process states

| State      | Meaning                               | Action                           |
| ---------- | ------------------------------------- | -------------------------------- |
| `可加载`   | QQ main process found, not attached   | `加载`                           |
| `加载中`   | Native component is being attached    | Wait                             |
| `等待连接` | Attached, pipe not connected          | `刷新管道` if needed             |
| `等待登录` | Pipe connected, QQ not logged in      | Log in inside QQ                 |
| `已在线`   | Logged in and real account recognized | Configure bot connections        |
| `错误`     | Attach or connection failed           | Read the error, retry or refresh |
| `已断开`   | Previous connection dropped           | `刷新管道`                       |

`刷新管道` has the tooltip `刷新管道状态 / 重连`. It reconnects an existing attach; it does not repeat the kernel acknowledgement.

## Step 1: make QQ appear

Open QQ on the same device and log in. When the server provides the same-origin desktop, `打开 QQ 桌面` opens the graphical QQ inside the container; native installs use the desktop QQ. Windows native does not show this entry even if a VNC address is configured.

Press `刷新`. If nothing appears, the empty state says `未检测到可加载 QQ 主进程` and `启动 QQ 后刷新`.

## Attaching an account

1. Select the process.
2. Press `加载`; it starts attaching directly, with no extra generic confirmation dialog.
3. If the account has no current-risk-version kernel acknowledgement yet, `选择接入内核` opens first and the attach continues only after you confirm.
4. The state moves through `加载中` → `等待连接` → `等待登录` → `已在线`. If QQ is not logged in, it stays at `等待登录`; finish login in QQ and press `刷新`.

Expected result: `PID … · QQ your-UIN`, attach state `Nowluma 已加载`, session connection `已建立连接`.

`加载` applies only to the selected PID and never attaches another process by the way; it is also not a kernel risk acknowledgement, which happens only in `选择接入内核`.

### Choosing the access kernel

The dialog title is `选择接入内核`, description `nickname · QQ UIN`, and the footer states `风险说明版本 … · 仅对 QQ … 生效`. Options:

| Option     | State      | Explanation                                                                          |
| ---------- | ---------- | ------------------------------------------------------------------------------------ |
| `兼容内核` | `可选择`   | Uses the bundled native component; an explicit risk acknowledgement is required      |
| `重写内核` | `暂不可用` | Not verified on this platform; cannot be selected and never falls back automatically |

Select `兼容内核`, review the notice, check the account's risk acknowledgement, then choose `确认并接入`. The option and checkbox start unchecked. `保存中…` indicates submission; errors stay in the dialog.

The notice covers account, data security and legal risks. Acknowledging it does not waive liability that cannot be waived by law or change the GPL licence of the source.

The choice is persisted **per real QQ number** in `config/kernel-selections.json`; it applies only to that UIN. A confirmation from one PID is never copied to another account.

Pressing `卸载` while the app is reading the account or waiting for your choice replaces that pending attach: the save request already sent finishes first, the old native load never continues, and nothing retries quietly afterwards. Attaching again needs another `加载`.

### Saving is not attaching

Saving the choice alone only writes that account's configuration; it does not attach immediately. Attachment normally starts when you press `加载`. If `自动连接已打开的 QQ` is enabled and this real UIN already has a current-risk-version compatibility acknowledgement, the service may attach after local QQ login makes the identity appear, without another click.

A newly acknowledged policy for an already-known UIN still needs one explicit load; refresh, auto-connect and re-reads do not perform that first attach. If you save and do not continue, QQ remains unattached.

### Account identity changes

- If no real UIN is recognized, the dialog does not open. The UI asks you to log in to QQ desktop first, then choose the account. It never uses a PID as an account or reuses another account's acknowledgement.
- If QQ changes account, the previous acknowledgement is invalid and the new UIN must be confirmed.
- If the local QQ account and the channel-reported account differ, attach is rejected with the reason; the app does not guess which is correct.
- Auto-connect, existing-pipe reconnect and CLI startup cannot bypass this step; all wait for the account's acknowledgement.

## Unload

Press `卸载` and confirm `确认卸载 Nowluma？` (`将从进程 … 卸载 Nowluma 注入，可能导致当前会话断开。`). Unloading needs no kernel confirmation and deletes no account data, connection config or QQ data.

**The PID stays manually stopped**: refresh, watcher ticks and auto-connect will not attach it again; only pressing `加载` resumes it. A PID that disappears and later reappears is a new session.

Expected result: state returns to `可加载`; detail shows `尚未加载`. If unload fails, restart QQ as prompted; restart does not remove configuration.

## Refresh the pipe

Use `刷新管道` when an attached process is disconnected or shows `已断开`. It reconnects the transport without re-injecting or changing the kernel choice.

If it still stays at `等待连接`, read the error and [Run log](logs.md). Linux Docker usually needs `SYS_PTRACE`; Windows may report an integrity-level warning.

## Empty states and errors

| Symptom        | UI                                    | Action                                        |
| -------------- | ------------------------------------- | --------------------------------------------- |
| No process     | `未检测到可加载 QQ 主进程`            | Open and log in to QQ, then `刷新`            |
| Read failed    | Error panel and `重试`                | Fix the service/permission and retry          |
| Stale data     | `…；当前显示上次成功读取的进程状态。` | Do not assume the process is online now       |
| Selection lost | `进程 … 已不在列表中`                 | Select again; the operation is not retargeted |
| Attach failed  | Error line and `重试接入`             | Fix permission, login or component issue      |

## Open QQ desktop

Select `打开 QQ 桌面` to open QQ in your browser. The entry uses same-origin `/desktop/` and appears only when the Linux server has an active desktop gateway, regardless of the browser's platform. A configured VNC address alone does not enable it.

Use your console session to enter; no separate VNC password is needed. See [Desktop authentication](access-network.md#desktop-authentication) for the gateway and [QQ persistence](data-backup.md#qq-persistence-and-manual-verification) for sign-in after restart.

## Save and restart

| Action                                 | Persisted?                                      | When it applies                                                                                |
| -------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Attach / unload                        | No                                              | Immediately                                                                                    |
| Kernel choice and risk acknowledgement | Yes, per UIN in `config/kernel-selections.json` | On future attaches for that account                                                            |
| Auto-connect running QQ                | Yes, service setting                            | After restart; an UIN with a current acknowledgement can attach once QQ login identity appears |
| Sort order                             | Yes, page preference                            | Immediately                                                                                    |
| Desktop entry                          | No                                              | Current session                                                                                |

## Troubleshooting

- **No QQ listed**: confirm QQ runs on the same machine/container; Docker needs `/proc` and `SYS_PTRACE`; check permissions in the log.
- **Stuck loading**: verify native component architecture and permission; wait for an error instead of repeated clicks.
- **Waiting for connection**: refresh the pipe; check ports, permissions and logs.
- **Waiting for login**: finish sign-in in QQ, then refresh.
- **It did not return after unload**: that is the manual stop; press `加载` to resume.
- **Online but no bot messages**: check [Bot connections](onebot-config.md).
- **New account asks for confirmation**: expected per-UIN isolation; old acknowledgements are not reusable.
- **Rewrite kernel unavailable**: use the compatibility kernel. See [Roadmap](planned.md#rewrite-kernel).
