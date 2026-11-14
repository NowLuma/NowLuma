---
title: First start — sign-in, agreements and the access password
description: Every screen between opening the console and reaching the overview, including ?token= links, two-factor codes, agreements, the forced password change, and how to recover from each failure.
---

# First start

This chapter covers everything between opening the browser and seeing the overview. On a fresh install the console enforces a fixed order: sign in → accept agreements (if required) → set the access password (if required).

## Three credentials that are not interchangeable

| Credential | Used for | Who can reset it |
| --- | --- | --- |
| Console access password | Signing in to this browser console | You, on the server; see the recovery steps at the end |
| Two-factor (2FA) code | The second sign-in step | Recovery codes, or a fresh enrolment |
| OneBot access token | What a bot program presents to an endpoint | Regenerate it in 「节点配置」; unrelated to console sign-in |

Your QQ password is not on this list. The program never asks for it and never stores it.

## 1. Splash

Before anything else you see 「初始化中…」 (initialising) with a skeleton. This only waits for the frontend and session state.

**Expected result**: within a few seconds you reach the login page, or straight to the overview if the browser already holds a valid session.

**If it never finishes**: confirm the console process is running (Docker: `bash deploy/manage.sh doctor`), that the URL and port are right, and that a reverse proxy is not blocking `/api/`. See [Troubleshooting](troubleshooting.md).

## 2. The login page

The subtitle reads 「OneBot v11 协议网关 · 安全登录」 *(OneBot v11 protocol gateway · secure sign-in)* and there is a single field whose placeholder is 「输入访问令牌」 *(enter access token)*.

Despite the wording, this field wants the **console access password**, not a OneBot token and not your QQ password.

| Control | Purpose |
| --- | --- |
| Password field | Enter the access password |
| 「显示密码」 / 「隐藏密码」 | Show or hide the plaintext |
| Submit | Submit; a wrong password shows an error banner and shakes the form |
| 「界面有点卡顿？」 | Opens a small dialog that turns off the animated login background — a purely local toggle |

The login page themes itself from a public appearance endpoint that works before sign-in, so your chosen theme applies immediately. Custom CSS is excluded from that subset and never affects the login page.

### One-shot sign-in with a URL

If the URL carries `?token=<access password>`, the page consumes it, signs you in, and then strips it from the address bar with `replaceState` before using it.

If a second factor is required, the password is carried into the code step, so you only type the code.

**Warning**: this path is for one-off devices only. Do not paste a URL containing your password into chat logs, issue trackers or screenshots.

### Two-factor authentication

An account with 2FA enabled sees a second step:

| Control | Purpose |
| --- | --- |
| 6-digit code | Read it from your authenticator app |
| 「使用恢复码」 | Switch to an 8-character alphanumeric recovery code |
| 「改用验证码」 | Switch back to the 6-digit code |
| 「返回」 | Back to the password step |

The code can be pasted into any cell and is distributed across the six boxes. Recovery codes are single-use; the remaining count is shown under 「账号安全」 (Account security).

**Expected result**: you reach the onboarding wizard or the overview.

**If it fails**: codes depend on the local clock, so check that the device syncs time. If the recovery codes are also exhausted, regenerate them from a signed-in device as described in [Settings: console](settings-console.md#two-factor-authentication), or use the recovery steps at the end of this chapter.

## 3. Agreement state failed to load

If even the agreement state cannot be read, the whole console is replaced by an error screen:

- Title 「协议状态加载失败」 *(agreement state failed to load)*.
- Buttons 「重新加载」 (reload) and 「退出登录」 (sign out).

The copy states that agreement confirmation cannot be skipped. That is intentional: without the agreement version there is no way to know whether you already consented.

**Order of attempts**: press 「重新加载」 → check the server is healthy → confirm a reverse proxy is not blocking `/api/agreements` → read the server log.

## 4. First-use setup (onboarding)

When required, the wizard 「完成首次使用设置」 *(complete first-use setup)* appears with the subtitle 「按顺序完成必要步骤后即可进入控制台。」 *(finish the required steps in order to enter the console)*.

The order comes from two server-side flags:

1. `needsConsent` gives you the 「阅读并同意协议」 (read and accept the agreements) step.
2. `mustChangePassword` gives you the 「设置访问密码」 (set the access password) step.

When neither applies you go straight to the console. The server has already applied environment policy — for example accepting the legal terms through an environment flag removes the agreement step.

### 4.1 Read and accept the agreements

- Heading 「请阅读并同意以下协议」 *(read and accept the following agreements)* with a scrolling document region.
- Note: 「同意一次后无需重复确认；仅当协议内容更新时才会再次请求确认。」 *(you consent once; you are only asked again when the content changes)*.
- Checkbox 「我已阅读并同意《用户协议》与《隐私政策》」 *(I have read and accept the User Agreement and Privacy Policy)*.
- Buttons 「不同意并退出」 (decline and sign out) and 「同意并继续」 (accept and continue), showing 「提交中…」 while submitting.

**Example**: tick the checkbox → press 「同意并继续」 → expected result: the next step or the overview. After the agreement version changes, this step returns on the next sign-in.

### 4.2 Set the access password

- Heading 「设置访问密码」 with live strength rules while you type.
- Rules: at least 10 characters, contains a lowercase letter, contains an uppercase letter, contains a special character (such as `!@#$%`), and contains no spaces.
- Submit button 「保存并完成」 (save and finish).

The password is stored as a salted scrypt hash in `webui.json` inside the program config directory; no plaintext is kept. Saving it invalidates sessions on other devices.

**Example**: `EXAMPLE-Aa1!` satisfies every rule (it is a formatting example — do not reuse it). Press 「保存并完成」 → expected result: the wizard closes and the overview appears.

**If it fails**: the rule list marks exactly which rule is unmet; a failed submission keeps you in the dialog with the error rather than silently succeeding.

### 4.3 Wizard footnotes

「上一步」 (back), 「下一步」 (next), 「完成」 (finish) and 「跳过」 (skip) are available as appropriate. 「跳过」 is only usable when no step is mandatory.

## 5. What to do first after signing in

1. The guidance panel on [Overview](overview.md) lists whichever step is still missing.
2. Click 「打开 QQ 桌面」 (Open QQ desktop), scan the QR code inside the QQ window, and enable automatic login in QQ's own settings.
3. Go to [QQ connection](qq-connection.md) and load the account.
4. Only when a bot needs it, continue with [Endpoint configuration](onebot-config.md).

## 6. Insecure-access banner

When the console is reached over a non-loopback address and the protocol is not HTTPS, a warning banner appears at the top. It does not block you, but it means the password and session travel in plaintext.

Fix it by using an SSH tunnel, configuring TLS, or binding back to loopback only. See [Access and networking](access-network.md).

## 7. Forgot the password or lost 2FA

Run these steps on the server itself; they need filesystem access. Back up before changing anything.

1. Stop the service: `bash deploy/manage.sh stop` (or end the process for a native run).
2. Back up the config directory: `cp -a config config.backup-$(date +%F)`.
3. Delete or rename `config/webui.json`.
4. Start the service: `bash deploy/manage.sh start`.
5. Read the new initial password from the startup log: `bash deploy/manage.sh logs`, search for `initial credentials`.

Alternatively, set `NOWLUMA_WEBUI_BOOTSTRAP_PASSWORD` to a temporary password before starting. It only applies when `webui.json` is absent.

**The cost, stated plainly**: this file holds both the password hash and the 2FA binding. Removing it also removes 2FA (you must re-enrol) and invalidates every signed-in session. That is why step 2 exists.

If only the 2FA device is lost and you still know the password, do not delete the file — sign in with a recovery code, or regenerate recovery codes / disable 2FA under 「系统设置 → 账号安全」 (Settings → Account security).

## 8. Save and restart semantics

| Action | Stored where | Takes effect | Restart needed |
| --- | --- | --- | --- |
| Agreement consent | Program config directory | Immediately, for good (asked again after a version change) | No |
| Change access password | `webui.json` | Immediately; other devices are signed out | No |
| Enable / disable 2FA | `webui.json` | Immediately | No |
| Sign out | Server-side session | Immediately | No |

Next: [Overview](overview.md), [Settings: console](settings-console.md#account-security).
