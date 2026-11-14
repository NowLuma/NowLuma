---
title: Overview
description: The overview page — widget library, layout editing, the guidance panel, navigation editing, presentation (kiosk) mode and the mobile layout.
---

# Overview

The overview is the page you land on after signing in, at `/`. It arranges service status, accounts, endpoints, alerts and host resources into draggable widgets, plus a fixed guidance panel that tells you which step is still missing.

## Page structure

From top to bottom:

1. Top bar: page title 「总览」 (overview), subtitle 「主机与服务状态」 (host and service status), connection badge, theme toggle, presentation-mode button, sign-out.
2. Toolbar: 「编辑布局」 / 「完成」 (edit layout / done), and 「恢复默认」 (restore defaults) while editing.
3. Guidance panel: not a widget, fixed in place, cannot be dragged.
4. Widget grid: nine visible widgets by default plus four optional ones in the 「部件库」 (widget library) on the right.

## Layout editing

| Control | Purpose |
| --- | --- |
| 「编辑布局」 | Enter edit mode; this also opens navigation editing in the sidebar |
| 「完成」 | Leave edit mode and save the layout |
| 「恢复默认」 | Discard the current layout and restore default widgets and order |
| 「部件库」 area | Drag a widget from the right into the grid; drag a widget back to remove it |

The help text differs by width:

- Desktop: drag cards to move, drag the bottom-right corner to resize, use the top-right gear for settings, and drag a card back into the library to remove it.
- Mobile: use the handle to reorder, the eye icon to show or hide, the gear for settings.

If every widget is removed, the empty state offers 「恢复默认布局」 (restore the default layout).

**Save and effect**: layout changes are auto-saved with a debounce while you edit, and persist on 「完成」. A failed save shows 「界面布局同步失败」 (layout sync failed) in the bottom-right; the local layout still applies, but a refresh may return to the last successfully saved version.

**Example**: press 「编辑布局」 → drag 「便签」 (note) from the library into the grid → open its gear and type a memo of up to 4000 characters → press 「完成」. Expected result: the memo survives a page refresh.

## The guidance panel

The panel describes the twenty steps needed to get a bot actually working. It only reads data the page already has and never issues extra requests.

Its main buttons:

| Button | Purpose |
| --- | --- |
| 「重新检查」 | Re-read the current state and re-evaluate the steps |
| 「我已打开 QQ」 | Assert that QQ is already running, skipping the “no QQ process” step |
| 「选一个 QQ」 | Open the 「选择要使用的 QQ」 dialog; one account at a time |
| 「连接这个 QQ」 | Open the 「连接这个 QQ？」 confirmation, then inject the bridge |
| 「检查一下」 | Check whether the pipe or connection is ready |
| 「我已登录，检查一下」 | Re-check sign-in after you finished it in QQ |
| 「去设置」 | Jump to the relevant settings page |
| 「查看原因」 | Open a details dialog explaining the failure |
| 「再试一次」 / 「重新连接」 | Retry the current step |

One message matters more than the rest: the completed-state dialog states that the console **does not reply to messages automatically**, and that 「连接状态显示正常，只说明服务在监听或已连上」 *(a healthy connection only means the service is listening or connected)*.

**On read failures**: any resource read error is shown first, together with a note that the previously read data is being displayed. The guidance never treats a failure as success and moves on.

## Widget catalogue

| Widget | Visible by default | Minimum size | Contents |
| --- | --- | --- | --- |
| 服务状态 (service status) | Yes | 2×1 | Overall service health |
| 在线账号 (online accounts) | Yes | 2×1 | Number of signed-in accounts |
| 进程注入 (bridged processes) | Yes | 2×1 | Bridged QQ processes; links to 「QQ 连接」 |
| 主机名 (hostname) | Yes | 2×1 | Current hostname |
| 系统运行 (uptime) | Yes | 2×1 | Service uptime |
| OneBot 连接 (connections) | Yes | 3×3 | Endpoints and their state per account |
| 最近告警 (recent alerts) | Yes | 3×3 | Warnings and errors from the log stream |
| 主机资源 (host resources) | Yes | 4×3 | CPU, memory and runtime resources |
| 在线会话 (sessions) | Yes | 3×3 | Signed-in account sessions |
| 便签 (note) | No | 2×2 | Personal memo, up to 4000 characters |
| 链接卡 (link card) | No | 2×1 | Custom link |
| 账号快捷卡 (account shortcut) | No | 2×1 | Summary pinned to one UIN |
| 最近投递 (recent deliveries) | No | 3×3 | Recent notification deliveries |

The five stat tiles have no gear and cannot be configured.

### Configurable widgets and their options

| Widget | Options | Default |
| --- | --- | --- |
| 最近告警 | 「显示条数」 (rows), 「显示级别」 (levels) | 5 entries, `warn` + `error` |
| 在线会话 | 「排序」 (sort: recent / UIN / nickname), 「筛选（昵称 / QQ 号）」 (filter) | Recent first |
| 主机资源 | 「显示的指标」 (metrics: CPU / memory / runtime) | All on |
| OneBot 连接 | 「筛选（账号昵称 / QQ 号）」 (filter), 「仅显示异常端点」 (only abnormal), 「排序」 (sort) | Default order |
| 便签 | 「便签内容（纯文本，保留换行）」 (plain text, newlines kept), up to 4000 characters | Empty |
| 链接卡 | 「标题」 (label, ≤60), 「链接（http/https）」, 「图标」 (icon) | URL must start with `http://` or `https://` |
| 账号快捷卡 | 「QQ 号」 | Empty |

Link cards accept http/https only, which rules out executable schemes such as `javascript:`.

### Honest numbers

- A failed read with no cached value renders `—`.
- A failed read with a cached value shows the old number plus 「更新失败，显示上次数据」 *(update failed, showing previous data)*.

Both are deliberate: the interface refuses to paper over an error with an invented number.

### Status labels in the connections widget

| Label | Meaning |
| --- | --- |
| 正常 (ok) | The endpoint works — listening or connected |
| 注意 (warn) | A recent error, service still up |
| 异常 (down) | Listen or connect failed |
| 应用失败 (apply failed) | Saved, but the hot reload failed |
| 未启用 (disabled) | The node is switched off |

Endpoint kinds read 「HTTP 服务端」, 「HTTP 上报」, 「WS 服务端」, 「WS 客户端」, matching the four tabs in [Endpoint configuration](onebot-config.md).

## Navigation and sidebar

The sidebar holds the brand block, version, the line `OneBot v11 控制台` and six entries:

| Entry | Page | Subtitle |
| --- | --- | --- |
| 总览 | `/` | 主机与服务状态 |
| QQ 连接 | `/processes` | 连接 / 断开 / 登录 |
| 节点配置 | `/config` | OneBot 协议端点 |
| 日志 | `/logs` | 实时事件流 |
| 调试 | `/debug` | 测试台与实时活动 |
| 系统设置 | `/settings` | 主题与账号 |

Rules:

- 「总览」 and 「系统设置」 are pinned: reorderable but **never hideable**. Hiding the overview would strand you with no entry to layout editing.
- The other four can be hidden and reordered. 「调试」 is visible by default but is not in the stored default list — layout reconciliation appends it, so describe it as “visible by default, hideable”.
- The sidebar collapses to an icon rail and expands on hover. 「钉住侧栏展开」 (pin the sidebar open) is a desktop-width setting under appearance.

### Editing navigation

While layout editing is active, the sidebar enters 「编辑导航」 (edit navigation) mode: drag rows to reorder, toggle each entry, press 「完成」 to leave.

### Sidebar update notice

When a new version is detected the sidebar shows 「有新版本 v{version} · 点击查看」 *(new version … — click to view)*, which jumps to Settings → About. It never appears when update checking is disabled.

## Top bar

| Element | Purpose |
| --- | --- |
| Connection badge | Console session state — **not** QQ online state |
| Theme toggle | Light / dark |
| Presentation-mode button | Enter or leave presentation mode |
| Sign out | Asks 「确认登出？」 then clears the session |

All three togglable elements can be disabled under appearance → top bar. Sign-out is always present.

## Presentation (kiosk) mode

For a wall display or a duty screen:

- Enter with the top-bar button, or append `?kiosk=1` to the URL.
- Leave with `Esc`.
- The flag lives in browser session storage, so it survives a refresh and disappears with the tab.
- It hides console chrome (for example the layout-edit entry). It **only affects presentation**; it never changes authentication and never exposes data to a signed-out visitor.

## Mobile layout

On narrow screens the grid becomes a single column with an order and visibility independent of the desktop grid: rearranging on a phone does not disturb the desktop arrangement. Editing switches to handle-drag, eye and gear.

## Cross-cutting banners

| Banner | When | What to do |
| --- | --- | --- |
| Insecure access notice | Non-loopback address over plain HTTP | Use SSH or TLS, see [Access and networking](access-network.md) |
| Account database status | Some account database is preparing, migrating or failed | Wait or read the log; usable and unusable failures are counted separately |
| Low integrity warning | Windows only, low process integrity | 「临时关闭」 or 「永久关闭」 |

## Example — build a duty view from scratch

1. Press 「编辑布局」.
2. Remove the optional widgets except the ones you need; drag 「OneBot 连接」 and 「主机资源」 into the first row.
3. Turn on 「仅显示异常端点」 (only show abnormal endpoints) for the connections widget.
4. Press 「完成」, then the presentation-mode button.
5. **Expected result**: only the two operational widgets remain, with no navigation or toolbar. `Esc` returns to the full interface.

## Saving and recovery

| Action | How it is saved | Failure |
| --- | --- | --- |
| Layout, widget settings, mobile order | Auto-saved to the UI configuration | 「界面布局同步失败」 in the bottom-right; the local change still applies |
| Navigation visibility | Same | Same |
| Guidance step state | Not persisted; computed from live data | Read errors are shown rather than skipped |

The cheapest recovery from a broken layout is 「恢复默认」. If the page is unusable, add `?safe-mode=1` to rule out custom CSS — see [Settings: Nowluma and platform](settings-runtime.md#advanced).
