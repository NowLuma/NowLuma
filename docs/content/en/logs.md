---
title: Logs
description: Live log levels, filtering, view presets, highlight rules, the privacy cost of TRACE, exports and clearing — plus where each setting is stored.
---

# Logs

The 「日志」 page (`/logs`) is the main troubleshooting surface. It receives server logs over SSE and does filtering, highlighting and exporting in the browser.

## Header and live state

- Title 「运行日志」 (runtime log).
- A status dot: `实时` (live) / `连接中` (connecting) / `重连中` (reconnecting).
- A counter line: `{filtered}/{total} entries · SSE live push · server {LEVEL}`.

「服务端 {LEVEL}」 shows the level the server is recording. That is different from the levels you tick locally: the server level decides what gets **produced**, local filters decide what you **see**.

## Toolbar

| Control | Purpose | Persisted |
| --- | --- | --- |
| Search box (placeholder 「搜索消息 / 模块 / 级别」) | Match across message, module and level | No (this session) |
| 「清除搜索」 | Clear the search term | — |
| 「自动滚动已开启」 / 「自动滚动已暂停」 | Whether new entries scroll to the bottom | Yes (page preference) |
| 「自动换行」 | Wrap long lines | Yes |
| 「显示选项」 | Expand presets, server level and highlight rules | Expansion state is not saved |
| 「刷新」 | Re-fetch recent entries | — |
| 「导出当前视图」 | Export the **current filtered set** as a `.log` file, generated in the browser | — |
| 「导出完整 TRACE」 | Ask the server for a complete TRACE file | — |
| 「清空视图」 | Clear the browser view | — |

The two exports are not the same: 「导出当前视图」 respects your search and level filters; 「导出完整 TRACE」 is a server-side file with more content.

The clear confirmation states: 「此操作仅清空浏览器视图中的日志，不会影响服务端的日志缓冲区。」 *(this only clears the browser view; the server-side buffer is untouched)*. A refresh brings entries back.

## Level filters

Six toggles: `TRACE`, `DEBUG`, `INFO`, `SUCCESS`, `WARN`, `ERROR`. Disabled levels are hidden but may still be recorded server-side.

## View presets

「显示选项」 offers three presets plus custom:

| Preset | Levels | Max lines | Wrap |
| --- | --- | --- | --- |
| 开发 (development) | All levels | 2000 | On |
| 运维 (operations) | INFO and above | 1000 | Off |
| 精简 (minimal) | WARN + ERROR | 500 | Off |
| 自定义 (custom) | Whatever you tick | Yours | Yours |

The maximum line count is a browser-side cap: oldest lines are dropped so a tab left open for hours does not exhaust memory.

## Server log level

The options panel can switch the server level, and the text next to it says plainly that ordinary logging only affects the console and the live stream, while the file level is controlled by an environment variable and defaults to `debug`.

**In other words**: changing this makes the console/live stream more or less verbose; it does not change the level written to the log files on disk.

## The cost of TRACE

Enabling TRACE adds a permanent banner: 「TRACE 已开启：正在记录大量、可能未经脱敏的数据」 *(TRACE is on: recording a large volume of data that may not be redacted)*, with a 「恢复 INFO」 (restore INFO) button.

Enabling it first shows a one-time confirmation listing four warnings:

1. TRACE produces a very large amount of data.
2. It may contain privacy-sensitive data and credentials that have not been redacted.
3. It is not suitable for long-running use.
4. It is only meant for small-scale reproduction and bug reports.

This is the most important privacy section in this documentation:

- TRACE may write message content, account identifiers and token fragments into logs.
- Exported files contain the same data. Review and trim them before sharing.
- Restore INFO as soon as the reproduction is done; do not leave it on.

## Highlight rules

- A keyword is at most 50 characters.
- Five colours: amber, rose, emerald, sky blue, purple.
- Up to 20 rules, each removable.

**Example**: add the keyword `timeout` in rose, then wait for a connection timeout. Expected result: matching lines are tinted rose, which makes them easy to find among INFO noise.

## Save behaviour and recovery

| What is saved | Where | Failure |
| --- | --- | --- |
| Visible levels, max lines, auto-scroll, wrap, highlight rules, preset | Page preferences (UI configuration) | 「页面偏好同步失败」 (page preference sync failed) in the bottom-right; the local change still applies |

If the page is completely blank:

1. Check the status dot. `重连中` means SSE dropped; it reconnects when the server recovers.
2. Press 「刷新」 to make a normal request and confirm the server is readable.
3. Check whether a reverse proxy is buffering SSE — it needs `proxy_buffering off` and a generous read timeout.
4. Run `bash deploy/manage.sh logs` to confirm the process is alive.

## A complete troubleshooting loop

1. Start with the 「运维」 (operations) preset for the symptom.
2. When you need detail, switch to TRACE and reproduce **once**.
3. Use 「导出当前视图」 for that narrow slice, or 「导出完整 TRACE」 for the full file.
4. Restore INFO immediately.
5. Replace account identifiers, tokens and message content with placeholders before sharing.

Next: [Debug](debug.md), [Troubleshooting](troubleshooting.md).
