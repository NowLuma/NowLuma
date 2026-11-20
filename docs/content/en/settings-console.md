---
title: "Settings: appearance and account"
description: Ten settings categories, theme and background, manual display effects, accessibility, data format, access password and 2FA.
---

# Settings: appearance and account

Path `/settings`; ten categories use a document-style index and the active one is stored in `?tab=`. The index wraps on narrow screens; direct links remain available.

| Category | Content |
| --- | --- |
| `外观` | Theme, palette, background, typography, top bar, manual motion/glass, accessibility |
| `数据与格式` | Polling interval, default page, time format |
| `账号安全` | Access password, 2FA, logout |
| `全局配置` | rkey fallback, video upload connections, music signing |
| `存储管理` | Space usage, log retention, cleanup |
| `通知` | Debounce window, notification channels |
| `服务` | WebUI listener, desktop, TLS, backup, runtime |
| `高级` | Custom CSS, UI config import/export/reset |
| `开发者` | Re-enter onboarding, trigger crash |
| `关于` | Version, updates, licence, feedback |

Appearance changes apply immediately and auto-save. Service settings state whether a restart is required. Runtime categories are covered in [Settings: runtime and services](settings-runtime.md).

## Appearance

### Theme and palette

- `主题`: light, dark or follow system.
- `配色方案`: default or Catppuccin. Catppuccin decides its own light/dark mode, so mode and darkness controls no longer change it.
- `深色强度`: `纯黑` suits OLED and is visible only in dark mode.
- `导航样式`: follow background, light panel or accent.
- `显示密度`: comfortable or compact.

The UI explains that changes synchronise across devices. When a host manages appearance, a banner says appearance follows the host and the previous colours, fonts and background are retained until the integration exits.

### Accent

Preset colours or a custom colour; `应用范围` is `全局` or `仅导航`. If contrast is below about 3:1, `强调色对比度较低` offers `恢复默认色` or `仍然使用` once per session. The choice is not blocked.

### Background

Solid colour, gradient or wallpaper, shown between cards and on the login page. Wallpapers accept PNG/JPEG/WebP up to 5 MB; `遮罩强度` and `背景模糊` improve foreground readability. Removing the wallpaper leaves other appearance settings intact.

### Typography and UI

`界面字体` and `等宽字体` (monospace is used by logs and code), `圆角`, `界面缩放`, `显示密度`. Font loading failures report a browser-permission problem.

`主题微调` overrides ten theme variables: page background, foreground, card, primary, muted foreground, border, navigation background, destructive, success and warning. Unset values follow the palette; `全部恢复默认` clears them.

### Top bar

`连接状态`, `主题菜单` and `展示模式` can be hidden independently. The page title, workspace management and logout always remain. This only affects display.

### Context menu

`自定义右键菜单` is on by default; turning it off restores the browser menu immediately.

### Interaction and accessibility

| Setting | Effect |
| --- | --- |
| `自定义光标` | Themed adaptive cursor, off by default |
| `动效` | Manually enable or disable motion; static glass remains when off |
| `玻璃材质` | Manually choose full or frosted glass; no automatic degradation |
| `减弱动效` | System or manual accessibility reduction for movement and springs |
| `高对比模式` | Strengthens borders and secondary text |
| `显示导航说明` | Shows each destination's purpose in the wide dock; persisted as `sidebarPinned` |

Motion and glass quality are independent: full glass can be static and frosted glass can animate. System reduced-motion, reduced-transparency and high-contrast preferences are accessibility constraints, not frame-rate-driven settings.

### Display effects

- **Full glass**: supported Chromium renders real backdrop displacement; labels and focus rings are not filtered.
- **Frosted glass**: skips displacement maps while retaining readable edges and the selected motion setting.
- **Motion**: changes immediately and is chosen during first setup or in Appearance; no continuous FPS detector runs.

Choices use the existing UI configuration and synchronise across devices. Legacy automatic quality becomes full glass; saved motion-off, palette and unrelated preferences are preserved. Material quality does not change account, message or network behavior.

Glass itself degrades: high contrast, system reduced transparency or a host overlay use solid surfaces; only Chromium with backdrop-filter support attempts refraction, others use frost. Optics are limited to small chrome, never a full-page filter.

## Data and format

- `轮询间隔`: refresh accounts, processes and system info; may be paused.
- `默认页面`: where login lands; options come from the six navigation entries.
- `时制`: 24-hour or 12-hour.

These are UI preferences, auto-saved and immediate.

## Account security

There is one local `admin` account. The password is stored as a scrypt hash in `config/webui.json`, never in plaintext.

- `访问密码` → `修改密码`: requires the current password and a matching new password; other sessions expire immediately.
- `退出登录`: clears the current browser session only.
- Password recovery: see [First run](first-run.md#forgot-password-or-lost-2fa).

## Two-factor authentication

2FA is off by default. Enabling it:

1. `开启 2FA`; scan the QR with an Authenticator or copy the secret.
2. Enter the current password and a 6-digit code; `确认开启`.
3. Save the recovery codes shown once.

| Action | Requirement |
| --- | --- |
| Regenerate recovery codes | Current password and a code; old codes become invalid |
| Disable 2FA | Current password plus a code or recovery code; sessions expire |
| Login with `使用恢复码` | Each recovery code works once; hyphens ignored |

The remaining recovery-code count appears in `账号安全`. Store the codes separately from the password.

## Save and apply

| Item | Storage | Applies |
| --- | --- | --- |
| Appearance, data and format | Server UI config, auto-save | Immediately, cross-device |
| Password, 2FA | `config/webui.json` | Immediately; relevant sessions expire |
| UI config import/export | Manual | Reloads the interface after import |

Failures keep the current state and show the reason; defaults never overwrite your configuration silently.
