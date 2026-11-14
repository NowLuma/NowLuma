---
title: Troubleshooting
description: A symptom-first table, a recovery ladder, how to use logs and diagnostics, and the boundaries of every "it works" claim.
---

# Troubleshooting

Use this chapter by finding your symptom first, then doing only what that row says. Do not change three things at once — you will not know which one fixed it.

## Start with these three

```bash
bash deploy/manage.sh doctor   # processes, directories, permissions, listeners
bash deploy/manage.sh logs     # follow the log
```

Third: open service → runtime environment and save locations in the console, press 「复制诊断」 (copy diagnostics) and keep the output. It lists the working directory, HOME, and the config/messages/logs directories plus writability.

## Look up the symptom

### The console will not open

| Check | Where |
| --- | --- |
| Is the process running? | `docker compose ps` or `manage.sh doctor` |
| Is the port right? | `manage.sh start` prints the actually published port |
| Bind address | `BIND_ADDRESS` in `deploy/.env`; remote servers default to loopback only |
| Firewall or security group | Your host or cloud provider settings |
| Reverse proxy | Does it point at 5099, and does it keep `Host`? |

### The login page loads but sign-in fails

| Symptom | Fix |
| --- | --- |
| Wrong password | Confirm you are using the console access password, not an OneBot token |
| 2FA keeps being demanded | Use 「使用恢复码」; if that is exhausted see [First start](first-run.md#7-forgot-the-password-or-lost-2fa) |
| 「协议状态加载失败」 | The server cannot read the agreements; press 「重新加载」, then check whether the proxy blocks `/api/agreements` |
| Signed out immediately | Session expiry, or two tabs on different hosts/ports overwriting each other |

### No QQ process is found

| Check | Notes |
| --- | --- |
| Is QQ really running? | In Docker, read the Xvfb/QQ output from `manage.sh logs` |
| Architecture match | The bridge supports specific platform architectures |
| Privileges | Docker needs `SYS_PTRACE`, granted only to the fixed UID |
| Windows | Watch for the low-integrity warning; account detection needs QQ on the same machine |

### Stuck at 「等待登录」 (waiting for sign-in)

QQ is not signed in yet. Complete the scan or verification in the QQ window (or 「打开 QQ 桌面」), then refresh.

### 「已在线」 but the bot does not work

These are two different layers:

1. The account layer is fine.
2. You still need an endpoint in 「节点配置」 with the right address and token, and the bot program itself must handle the traffic.

Check in order: is the node disabled → address/port/path → token → the bot's own log. See [Endpoint configuration](onebot-config.md).

### A save did not take effect

Read the save-state chip:

| Chip | Meaning | Fix |
| --- | --- | --- |
| 已保存，下次连接时应用 | The account is offline | Bridge the account first |
| 已保存，但热重载失败 | Endpoint hot swap failed | Fix the configuration using the error and save again |
| 保存失败 | Nothing was written | Read the error; usually a port conflict or validation failure |
| 未保存 | Edits not submitted yet | General settings debounce — wait, or press 「保存」 |

Service-level settings (ports, TLS, desktop entry, auto-connect) need a **program restart** after saving; the console will not do it for you.

### Logs are not live

| Check | Notes |
| --- | --- |
| Status dot says `重连中` | SSE dropped; it reconnects when the server recovers |
| Proxy buffering | Requires `proxy_buffering off` |
| Proxy read timeout too short | Give it at least 3600 s |
| Server level too high | Check the server level under 「显示选项」; the file level comes from an environment variable |

### The desktop will not open

| Check | Notes |
| --- | --- |
| Is the session valid? | After sign-out or a password change the desktop stops working by design |
| Is `/desktop/` proxied? | Forward the path unchanged and pass WebSocket upgrade headers |
| `Origin` | Must match the current host; old tabs fail after a domain change |
| Entry hidden? | Port 0 with an empty address hides the entry |
| External desktop URL | That service handles its own auth; the console session is not forwarded |

### QQ asks for a QR scan after a restart

See [Data, backup and updates](data-backup.md#qq-persistence-and-manual-verification). The usual causes are a volume that was not reused, HOME/XDG overridden by a custom start command, or `down -v`.

### The interface is broken or unclickable

1. Open the console with `?safe-mode=1` appended (skips custom CSS).
2. Go to advanced → custom CSS and delete or clear the rules.
3. Still broken: advanced → backup and reset → 「重置全部界面配置」 (irreversible; loses appearance customisation).

### Old data is still showing

On a read failure the interface keeps the last successful data and labels it. Such data cannot tell you the current state: fix the read first, then look at the numbers.

## Recovery ladder

From cheapest to heaviest:

1. **Retry** — press 「重试」, 「刷新」 or 「重新连接」.
2. **Save again** — resubmit and see whether the error changes.
3. **Restart the service** — `bash deploy/manage.sh restart`. Disconnects bots.
4. **Restart QQ** — for failed unloads and stuck pipes. QQ signs in again.
5. **Rule out the interface** — `?safe-mode=1`.
6. **Restore configuration** — service → configuration backup / restore.
7. **Restore data** — stop, restore volumes or directories, start.
8. **Rebuild the environment** — only with a verified backup. Note that `down -v` deletes volumes.

## Common misreadings

| Claim | Reality |
| --- | --- |
| “Health check passed, so QQ is signed in” | The check verifies processes, the desktop listener and console reachability only |
| “Endpoint is ok, so the bot replies” | It means listening or connected, nothing more |
| “Local files are still there, so no QR scan” | Local state avoids a new environment; QQ decides session acceptance |
| “No errors in the log, so everything is fine” | Errors can be filtered out by level; only TRACE has full detail |
| “CI is green, so every platform works” | It covers only the platforms and scenarios actually exercised |

## Reporting a problem

Include:

- Diagnostics copied from service → runtime environment and save locations (no credentials).
- Reproduction steps and the expected result.
- The relevant log excerpt. **Remove account identifiers, tokens, message content and any personal data first.**
- Platform, architecture and version.

Do not include: QQ password, console password, 2FA recovery codes, raw traffic captures, or account database files.

## Related chapters

- Log detail: [Logs](logs.md)
- Endpoint fields: [Endpoint configuration](onebot-config.md)
- Access and proxies: [Access and networking](access-network.md)
- Backup and restore: [Data, backup and updates](data-backup.md)
