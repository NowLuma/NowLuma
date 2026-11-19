---
title: First run
description: From the splash and console password through 2FA, the notices step and setting a new password, to the first account entry point.
---

# First run

The first visit checks the console password, then completes four browser-based stages: notices, password, display effects and account kernel.

During first setup, running and result feedback occupies a dedicated row in the document rather than covering confirmation/save controls. After setup, the same viewport returns to the workspace's bottom-right position, preserving in-flight operations, notification countdowns and keyboard focus.

## Splash

The centre shows `初始化中…` with skeleton placeholders while the app checks the local session and backend.

If it never leaves this screen: confirm the service is running (`bash deploy/manage.sh logs` in Docker), the port is free, and a reverse proxy preserves `/api/`. See [Troubleshooting](troubleshooting.md).

## Login

The login page heading is `进入工作台`, with the subtitle `管理 QQ 会话与机器人连接。`. Enter the **console access password** (not the QQ password) in `访问密码` and press `打开工作台`; the eye button toggles `显示密码` / `隐藏密码`.

- A wrong password reports `登录失败`; the failure is never treated as success.
- Motion and glass quality are selected manually during first setup and under Settings → Appearance. Login uses the saved choices; no frame-rate detector turns motion off. System accessibility preferences still take precedence.
- Network errors or a required second factor leave you on the login page with the error preserved.

The installer or startup log prints the initial password. It is only for the first entry; after onboarding, use the password you chose.

## Two-factor authentication

When 2FA is enabled, a correct password also needs a one-time code:

| Control | Use |
| --- | --- |
| `验证码` | 6-digit Authenticator code; paste the whole code into any cell |
| `使用恢复码` | Switch to a recovery code; hyphens are ignored |
| `改用验证码` | Switch back to the 6-digit code |
| `恢复码` | Each code works once; remaining count is shown under Settings → `账号安全` |

Wrong second factors show `验证码不正确，改错的那一位即可。` or `恢复码不正确，改错的那一位即可。` without clearing the other cells.

## Link login

Append `?token=<access password>` to the console URL to skip manual entry. The page removes the parameter from the address bar and browser history immediately so it does not leak through Referer or screenshots.

This is a one-shot convenience, not a long-lived token. Do not share the link; use an [SSH tunnel or HTTPS](access-network.md) for remote access.

## Reading notices and setting a password

After login, `完成首次使用设置` opens with four stages: `阅读使用说明`, `设置访问密码`, `显示效果` and `选择接入内核`.

`选择接入内核` is an extra step before attaching: it saves a kernel choice for a detected QQ account. With no account detected, press `继续` and choose later once QQ is logged in.

### Reading the notices

- Heading `阅读使用说明`, subtitle `阅读后确认，即可继续设置。`.
- The `说明文档` control switches between the Usage notice and Privacy notice; each shows `版本 / Version … · 生效 / Effective …`.
- `确认并继续` becomes available only after checking `我已阅读《使用说明》和《隐私说明》`; the footer shows `说明版本 …`.
- `退出` returns to login without recording an acknowledgement.
- If text fails to load: `未能加载说明文本，请刷新页面重试。`; submission failures show `提交失败，请重试` or `网络错误，请重试`.

This is an acknowledgement that you read the notices, not consent to an extra commercial contract. It does not change the GPL licence or add obligations.

### Setting the access password

- Heading `设置新的访问密码`, with the hint `设置用于打开控制台的密码。`.
- The password you just logged in with is the current one, so it is not asked for again; enter the new password twice (`新密码`, `确认新密码`).
- The page rules: at least 10 characters, lowercase, uppercase, a special character, and no spaces.
- `保存并继续` invalidates sessions on other devices; choose display effects and the account kernel next to enter the workspace.
- Entering from Settings → `开发者 → 重新进入` runs a rehearsal: the button becomes `完成演练`, nothing is saved, and the real password and acknowledgement record are untouched.

### Display effects

Actively select `动效` (on/off) and `玻璃材质` (full/frosted), then press `保存并继续`. Neither choice is preselected. The preview changes immediately; the next stage opens only after the server confirms the save.

Motion-off retains static glass. Frosted quality reduces refraction cost without changing motion. System reduced-motion, reduced-transparency and high-contrast settings remain accessibility constraints. Developer replay previews locally, restores the previous presentation on exit, and never saves appearance.

## What happens next

1. The workspace connection workflow asks you to open or log in to QQ.
2. In `QQ 会话`, select a process and press `加载`.
3. On the first attach for that account, `选择接入内核` opens: select `兼容内核`, check the risk acknowledgement, then press `确认并接入`; see [QQ sessions](qq-connection.md).
4. After attach, add an HTTP or WebSocket endpoint in `机器人连接`.

When you need the graphical QQ, press `打开 QQ 桌面` (shown only when the server provides the same-origin desktop). The desktop reuses the current console session; no separate VNC password is needed, and Windows native does not show this entry.

## Forgot password or lost 2FA

There is one local account and no email recovery. If you cannot log in:

```bash
bash deploy/manage.sh stop
cp -a config config.backup-$(date +%F)
mv config/webui.json config/webui.json.old
bash deploy/manage.sh start
bash deploy/manage.sh logs
```

The startup log prints a new initial password. This also clears 2FA and all sessions; `config.backup-*` is a rollback copy, not something to delete. `NOWLUMA_WEBUI_BOOTSTRAP_PASSWORD` only supplies an initial password when `webui.json` does not exist.

## Notice status failed to load

If the page says `协议状态加载失败`, the console cannot confirm the notice state. It refuses entry rather than bypassing the required acknowledgement.

- `重新加载` retries.
- `退出登录` returns to login.
- Check `/api/agreements`, reverse-proxy path rewriting, and server time.

## Save and restart

| Action | Stored in | Restart? |
| --- | --- | --- |
| Notice acknowledgement | Server config | No |
| Password change | scrypt hash in `config/webui.json` | No; other sessions expire |
| Enable/disable 2FA | `config/webui.json` | No |
| Log out | Current browser session only | No |
