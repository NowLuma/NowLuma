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
2. Choose `加载` to start attaching the selected process.
3. On first selection or after the risk notice changes, confirm the choice for this account in `选择接入内核`.
4. The state moves through `加载中` → `等待连接` → `等待登录` → `已在线`. If QQ is not logged in, it stays at `等待登录`; finish login in QQ and press `刷新`.

Expected result: `PID … · QQ your-UIN`, attach state `Nowluma 已加载`, session connection `已建立连接`.

### Choosing the access kernel

The dialog title is `选择接入内核`, description `nickname · QQ UIN`, and the footer states `风险说明版本 … · 仅对 QQ … 生效`. Options:

| Option     | State      | Explanation                                                                          |
| ---------- | ---------- | ------------------------------------------------------------------------------------ |
| `兼容内核` | `可选择`   | Uses the bundled native component; an explicit risk acknowledgement is required      |
| `重写内核` | `暂不可用` | Awaiting platform testing |

Select `兼容内核`, review the notice, check the account's risk acknowledgement, then choose `确认并接入`. The option and checkbox start unchecked. `保存中…` indicates submission; errors stay in the dialog.

The notice covers account, data security, and legal risks.

Each QQ number has its own kernel choice in `config/kernel-selections.json`.

Choose `卸载` while the console is detecting the account or waiting for a kernel choice to cancel the pending attach. Any save already sent finishes first. Choose `加载` to attach again.

### Attaching after saving a kernel choice {#saving-is-not-attaching}

After confirming a kernel for an account, return to QQ sessions and choose `加载` to attach it for the first time.

With `自动连接已打开的 QQ` enabled, an account with a current compatibility-kernel acknowledgement can attach automatically once QQ is signed in and its UIN is detected.

### Account identity changes

- Sign in in the QQ window, wait for the console to detect the QQ number, then choose a kernel.
- After switching accounts in QQ, choose a kernel and acknowledge the risks for the new QQ number.
- If the local account and channel account differ, read the attach error in the process details.
- Auto-connect, pipe reconnect, and command-line startup check the acknowledgement for the current QQ number.

## Unload

Choose `卸载` and confirm `确认卸载 Nowluma？`. Unloading can disconnect the current session. Account data and connection settings are kept.

**The PID stays manually stopped.** Choose `加载` to attach again. A process that exits and starts again is a new session.

Expected result: state returns to `可加载`; details show `尚未加载`. If unload fails, restart QQ as prompted.

## Refresh the pipe

For an attached process marked `已断开`, choose `刷新管道` to reconnect using the current kernel choice.

If it still stays at `等待连接`, read the error and [Run log](logs.md). Linux Docker usually needs `SYS_PTRACE`; Windows may report an integrity-level warning.

## Empty states and errors

| Symptom        | UI                                    | Action                                        |
| -------------- | ------------------------------------- | --------------------------------------------- |
| No process     | `未检测到可加载 QQ 主进程`            | Open and log in to QQ, then `刷新`            |
| Read failed    | Error panel and `重试`                | Fix the service/permission and retry          |
| Stale data     | `…；当前显示上次成功读取的进程状态。` | Resolve the read error and refresh for the current status |
| Selection lost | `进程 … 已不在列表中`                 | Select the target process again                          |
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
