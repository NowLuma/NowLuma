---
title: Workspace
description: The workspace page: connection workflow, runtime readings, editable widgets, bottom dock, navigation editing, kiosk and mobile layout.
---

# Workspace

The landing page is `/`. The masthead title comes from the current navigation item and reads `工作台`; the page heading is `从会话，到结果`. It combines the connection workflow, runtime readings and an editable widget grid.

## Page structure

1. Masthead: brand, current page title, connection state, theme, direct `工作区管理` and `更多操作`.
2. Connection workflow: fixed, not a widget; shows three stages and the next step.
3. Five instruments, four content widgets, and an entry to the full run log.
4. Floating main navigation with six labelled destinations; it is the only primary navigation.

## Masthead and workspace management

| Element | Purpose |
| --- | --- |
| Page title | Taken from the current navigation item, e.g. `工作台` |
| Connection state | Whether the console session is usable; when connected it reads `服务在线`; not QQ online state |
| Theme menu | Light, dark or follow system; one control, not an old three-icon pill |
| `工作区管理` | Directly opens the management sheet: reorder/show navigation, open hidden pages, edit layout and see updates |
| `更多操作` (`⋯`) | Session menu with `展示模式` and `退出登录`; logout is always available |

`退出登录` first asks `退出登录？`, then clears the current session token. The connection state, theme menu and kiosk entry can each be hidden under Settings → `外观` → `顶栏`; the page title, workspace management and logout cannot.

## Floating navigation

Desktop and mobile share a floating, labelled dock:

| Label | Path | Description |
| --- | --- | --- |
| 工作台 | `/` | 会话、连接与结果 |
| QQ 会话 | `/processes` | 选择并接入会话 |
| 机器人连接 | `/config` | 建立机器人连接 |
| 运行记录 | `/logs` | 查看连接结果 |
| 调试工具 | `/debug` | 测试动作与排查 |
| 偏好设置 | `/settings` | 外观、账号与设备 |

This bottom dock is the only primary navigation: there is no collapse button and hover does not push the content. On wide screens, Settings → `外观` → `显示导航说明` controls whether each description is shown; it persists as `sidebarPinned`.

### Rearranging navigation

Press `工作区管理` in the masthead, then `调整导航`:

- Drag rows or use `上移` / `下移` to reorder.
- Toggle `隐藏` / `显示`.
- `工作台` and `偏好设置` are locked (`必选项，不可隐藏`): they can be reordered but not hidden, so you cannot lock yourself out of layout editing or account settings.
- Hidden pages stay listed under `隐藏的页面` and can be opened from there.
- Press `完成调整`. Order and visibility are saved automatically.

## Connection workflow

The workflow is a fixed region, not a widget. Hiding all widgets does not remove it. An explicitly stopped session suppresses idle reattachment prompts, never read errors or in-flight operations.

Its `连接路径` shows three stages: `QQ 会话` → `机器人连接` → `查看结果`. The current stage is highlighted and finished stages show a check.

Below it are the `当前 QQ` card and the next-step prompt:

- The card shows the account nickname or `尚未选择`, plus `已登录`, `待确认` or `从会话开始`, followed by `QQ <UIN>` or `PID <pid>`. With more than one process, `更换会话` appears.
- The prompt states what to do now, one hint and a primary action; when everything is ready the action is `查看结果`, which opens the run log.
- `打开 QQ 桌面` appears next to the action only when the server actually provides the same-origin desktop.

| Action | When | Result |
| --- | --- | --- |
| `重新检查` | Read failed or state did not change | Re-reads processes and login state |
| `我已打开 QQ` | No QQ detected | Re-reads the process list |
| `选择 QQ` | Multiple processes | Opens `选择 QQ 会话`; one account at a time |
| `重试接入` | Attach failed | Retries attaching the current session |
| `重新连接` | Existing attachment disconnected | Reconnects the pipe without re-injecting |
| `选择内核并接入` | Account has no current risk acknowledgement | Opens `选择接入内核`; attaching starts only after confirmation |
| `已登录，检查状态` | Attached but not logged in | Re-checks login |
| `配置机器人连接` | Attached but no enabled endpoint | Opens Bot connections |
| `连接说明` | Everything ready | Explains that the console does not auto-reply |
| `查看原因` | Read/attach/endpoint problem | Opens the error; failures are not only transient toasts |

If any read fails, the panel shows the error and `重新检查`; it never treats failure as success.

## Layout editing

`编辑布局` toggles to `完成编辑`; `恢复默认` appears in the page header.

| Action | Desktop | Phone |
| --- | --- | --- |
| Move | Drag cards | Drag handles in the single column |
| Resize | Bottom-right corner | Default widget height |
| Add | `卡片库` plus button or drag | Eye toggle |
| Remove | Drag back to `卡片库` | Eye toggle |
| Configure | Gear on the card | Inline gear |
| Reset | `恢复默认` | Same |

Desktop is a free 12-column grid; cards do not auto-compact. Mobile order is independent and never rewrites the desktop layout.

The desktop grid also supports the keyboard: select a card, then use the arrow keys to move it, `Shift` + arrow keys to resize and `Delete` to hide it into the card library. Hidden cards can be re-added from `卡片库`.

Layout, widget settings and mobile order auto-save. On failure the local state remains and `界面布局同步失败` is shown. `恢复默认` resets only the layout, not accounts, connections or data. When every card is hidden, the empty state shows `所有工作台卡片都已隐藏` and `恢复默认布局`.

## Widgets

| Widget | Visible by default | Content |
| --- | --- | --- |
| 控制台连接 | Yes | Whether the console is `服务在线`; otherwise the current status |
| 已登录会话 | Yes | Attached session count; `—` or `更新失败，显示上次数据` on read failure |
| QQ 程序 | Yes | Process count with attached/unattached counts, links to QQ sessions |
| 运行设备 | Yes | Hostname, OS and architecture |
| 连续运行 | Yes | System and service process uptime |
| 机器人连接 | Yes | Live endpoint states and filters |
| 运行动态 | Yes | Recent warnings/errors |
| 资源用量 | Yes | CPU, memory, processes, heap, external memory |
| QQ 会话 | Yes | Online account sessions |
| 便签 | No | Local note up to 4000 characters |
| 链接卡 | No | Title and http/https link |
| 账号快捷卡 | No | Summary for one UIN |
| 通知投递 | No | Recent online/offline notification deliveries |

Instruments show only real data: a failed read with no cache shows `—`; with cache it says `更新失败，显示上次数据`. There are no invented online counts or FPS metrics.

Configurable widgets: `运行动态` (`显示条数`, `显示级别`), `QQ 会话` (sort/filter), `资源用量` (`CPU 使用率` / `内存使用` / `运行进程`), `机器人连接` (sort, `仅显示异常端点`, filter), plus note/link/account content. Link cards accept only http/https. Turning off every `资源用量` metric falls back to showing all instead of an empty card.

## Kiosk

- Enter from `更多操作` → `展示模式`, or `?kiosk=1`.
- Exit with `Esc` or the on-screen exit control.
- Hides the masthead, floating navigation and edit entry for wall displays. It only changes display, not authentication.
- Session-scoped: survives refresh, ends when the tab closes.

## Mobile

The same pages and dock adapt to narrow screens: the workflow stacks, widgets become a single column, editing opens a drag-sort panel, and the page-navigation sheet slides in from the right. Mobile order and desktop coordinates are stored separately.

## System banners

| Banner | When | Action |
| --- | --- | --- |
| Insecure access | Non-loopback without HTTPS | Use SSH or TLS; see [Access and network](access-network.md) |
| Account database status | Preparing, migrating or failed | Wait or check the log; states are counted separately |
| Low integrity | Windows only | Follow the temporary/permanent dismissal notice |
