---
title: "Settings: console (appearance, data and format, account security)"
description: Every appearance sub-group, the data refresh and time-format options, changing the access password, signing out, and two-factor authentication with its recovery paths.
---

# Settings: console

The 「系统设置」 page (`/settings`) groups ten tabs into three sections: **console** (this chapter), **Nowluma**, and **platform** (both in [Settings: Nowluma and platform](settings-runtime.md)).

The left rail is a grouped navigation; desktop widths show the three section headers and mobile shows a flat strip. The active tab lives in the `?tab=` URL parameter, so a settings link can be shared directly; the default tab is 「外观」 (appearance).

| Section | Tabs |
| --- | --- |
| 控制台 (console) | 外观 (appearance), 数据与格式 (data and format), 账号安全 (account security) |
| Nowluma | 全局配置 (global config), 存储管理 (storage), 通知 (notifications) |
| 平台 (platform) | 服务 (service), 高级 (advanced), 开发者 (developer), 关于 (about) |

## Appearance

Appearance affects **this browser's** display only and is stored in the UI configuration. Changes debounce for 400 ms and save automatically; a failure shows 「外观同步失败」 (appearance sync failed) in the bottom-right while the local value keeps applying.

### Theme

| Control | Options |
| --- | --- |
| Palette | Eleven presets, including the default lavender accent |
| 「显示模式」 (display mode) | Light / dark / follow system |
| 「深色强度」 (dark intensity) | Soft / true black (OLED) |

Choosing a palette with a fixed light/dark identity (Catppuccin variants, for example) makes display mode and dark intensity inert. That is by design, not a defect.

### Accent colour

- Presets plus a custom colour picker.
- 「应用范围」 (scope): global / sidebar only.
- 「侧栏样式」 (sidebar style): follow background / light panel / accent.

A low-contrast choice raises a once-per-session dialog 「强调色对比度较低」 (accent contrast is low) offering 「恢复默认色」 (restore the default) or 「仍然使用」 (use it anyway). It warns once and does not nag on every edit.

### Background

| Control | Description |
| --- | --- |
| Type | None / solid / gradient / image |
| Solid | Colour picker |
| Gradient | Preset gradients |
| Image | Upload a wallpaper — PNG / JPEG / WebP, up to 5 MB — with a preview and 「移除」 (remove) |
| 「遮罩强度」 (overlay strength) | 0–1, how much the background is dimmed |
| 「背景模糊」 (background blur) | 0–40 px |

Uploaded wallpapers live in the UI configuration and are **not** included in the 「高级 → 备份与重置」 export; re-upload them on another machine.

### Typography and interface

| Control | Description |
| --- | --- |
| 「界面字体」 / 「等宽字体」 | Preset fonts, or 「自定义」 with a free-form family name |
| Local font list | Chromium-only; on failure it reports 「无法读取本机字体，请检查浏览器权限后重试。」 *(cannot read local fonts; check browser permissions and retry)* and you can still type a family manually |
| 「圆角」 (corner radius) | Interface corner rounding |
| 「界面缩放」 (zoom) | Whole-interface scale slider |
| 「显示密度」 (density) | Comfortable / compact |

### Theme variables

Ten whitelisted CSS variables, each with its own picker and per-token reset, plus 「全部恢复默认」 (restore all defaults).

The login page receives these values too (whitelist and colour values only), so the pre-sign-in page matches the console.

### Top bar

Three toggles for the togglable top-bar elements: 「连接状态徽章」 (connection badge), 「主题切换按钮」 (theme toggle), 「展示模式按钮」 (presentation-mode button). Sign-out is always present.

### Context menu

「自定义右键菜单」 decides whether the browser context menu is replaced by the console's own.

### Interaction and accessibility

| Toggle | Effect |
| --- | --- |
| 「自定义光标」 | Use a drawn cursor |
| 「减弱动效」 (reduce motion) | Lower animation amplitude |
| 「关闭全部动效」 (disable all motion) | No animation at all — for low-end devices or motion sensitivity |
| 「高对比模式」 (high contrast) | Increase contrast |
| 「钉住侧栏展开」 (pin the sidebar) | Desktop width only; keeps the sidebar expanded |

### When a host manages appearance

If a host program drives this console's appearance through integration mode (configured with `NOWLUMA_WEBUI_TARGET` at deployment), most appearance controls are disabled and a note explains: 「外观跟随{host}。原有配色、字体和背景已保留，退出集成后恢复；缩放与无障碍设置仍可调整。」 *(appearance follows {host}; your palette, fonts and background are preserved and restored when the integration ends; zoom and accessibility remain adjustable)*.

Zoom, custom cursor, high contrast and similar accessibility items keep working. Custom CSS is preserved but suspended.

## Data and format

| Control | Options | Effect |
| --- | --- | --- |
| 「轮询间隔」 (poll interval) | Seconds; `0` pauses foreground polling | Cadence for system metrics. QQ list, process and connection reconciliation use their own throttle (max of interval ×10 and 10 seconds) and prefer SSE pushes |
| 「登录后落地页」 (landing page) | Any navigation entry | Where you land after the next sign-in |
| 「时间格式」 (time format) | 24-hour / 12-hour (AM/PM) | How timestamps render; the log content itself is unchanged |

**Example**: set the poll interval to `0` and the resource numbers stop refreshing while logs and connection state keep streaming over SSE. Useful on a constrained network or when you want a static snapshot.

These auto-save to the UI configuration. The interval changes browser behaviour only, never the server.

## Account security

### Change the access password

| Element | Description |
| --- | --- |
| Entry | 「访问密码」 → 「修改密码」 (change password) |
| Hint | 「修改后其他设备的会话将立即失效。」 *(sessions on other devices are invalidated immediately)* |
| On success | 「已更新（hh:mm:ss）— 其他设备的会话已失效。」 |

The password is stored as a salted scrypt hash in `webui.json` in the program config directory; no plaintext is kept.

**Example**: change the password → another signed-in device is asked to sign in on its next request. That is the point: it is how you cut off someone who has your old password.

### Sign out

「退出登录」 asks 「确认退出登录？」 and then clears the current session.

### Two-factor authentication

The card has two states:

| State | Shows | Actions |
| --- | --- | --- |
| Off | An `Authenticator` row and 「开启 2FA」 | Start enrolment |
| On | 「已绑定 {label} · 剩余 {n} 个恢复码」 and a status row | 「恢复码」 → 「重新生成」, 「关闭 2FA」 |

Enrolment flow:

1. Press 「开启 2FA」; a QR code and a copyable one-time secret appear.
2. Scan the QR code or type the secret into your authenticator app.
3. Confirm with the current 6-digit code.
4. The page shows a set of recovery codes and states 「这些恢复码只显示一次…」 *(these recovery codes are shown only once)*. **Write them down now and store them safely.**

Disabling 2FA warns: 「关闭后，只需访问密码即可登录。其他已登录会话会立即失效。」 *(after disabling, only the access password is needed to sign in; other signed-in sessions are invalidated immediately)*.

**Example (using a recovery code)**: the phone is lost → on the second sign-in step choose 「使用恢复码」 → enter an 8-character recovery code → reach the console → regenerate codes or disable and re-enrol.

**If it fails**:

| Symptom | Fix |
| --- | --- |
| Codes are always rejected | Check that the device clock syncs; codes rotate every 30 seconds |
| Recovery codes exhausted | Regenerate from another signed-in device; if none exists, follow [First start](first-run.md#7-forgot-the-password-or-lost-2fa) (which also clears the 2FA binding) |
| Other devices signed out after a password change | Expected behaviour |

## Save and effect summary for this section

| Setting | Stored in | Takes effect | Restart |
| --- | --- | --- | --- |
| All appearance sub-groups | UI configuration | Immediately (debounced auto-save) | No |
| Data and format | UI configuration | Immediately | No |
| Access password | `webui.json` | Immediately; other devices are signed out | No |
| Two-factor authentication | `webui.json` | Immediately | No |
| Sign out | Server-side session | Immediately | No |

Next: [Settings: Nowluma and platform](settings-runtime.md), [Access and networking](access-network.md).
