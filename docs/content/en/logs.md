---
title: Run log
description: Live log stream, four presets, level filters, search, highlight rules, server log level, TRACE warning, export and clearing.
tutorial: logs
---

# Run log

Practise filtering and searching above, then inspect the complete error. Check for account data or tokens before exporting real logs; clearing the view is different from deleting stored logs.

![Run log stream with level and search filters](/images/tutorials/logs.png)

_Figure: sample events. Level text and error details matter more than colour._

Path `/logs`. It shows console and access-layer events as they happen. It does not change QQ connections or repair errors automatically.

## Live stream

The header shows `实时`, `连接中`, `重连中` or `未连接`, plus the filtered count. If the stream drops, already-read entries remain and the error is visible.

Levels are `TRACE`, `DEBUG`, `INFO`, `SUCCESS`, `WARN`, `ERROR`, with distinct colours. Colour is only a cue; filtering and search use text.

## Presets

| Preset   | Content                                   |
| -------- | ----------------------------------------- |
| `开发`   | All levels, 2000 lines, auto-scroll, wrap |
| `运维`   | INFO and above, 1000 lines                |
| `精简`   | WARN/ERROR only, 500 lines                |
| `自定义` | Shown after you change any setting        |

The preset is saved as a page preference. Switching changes visible levels, line limit, auto-scroll and wrapping together.

## Level filter

Level buttons are multi-select; turning all off shows nothing. Filtering only changes the view, not the server log.

## Search and display options

Search accepts message, module or level; `清除搜索` clears it. The toolbar toggles auto-scroll (`自动滚动已开启` / `自动滚动已暂停`), wrapping, and `显示选项`.

Auto-scroll follows only while you are at the bottom; scrolling up does not snap you back.

### Highlight rules

Add a keyword and choose amber, rose, emerald, sky or violet. Up to 20 rules are saved; removing a rule does not remove log entries. Highlights change the background of matches only, not filtering.

## Server log level and TRACE

`服务端日志级别` controls server verbosity:

- Normal levels affect the console and live stream; first-login credentials are printed only to the startup terminal.
- File level is controlled by an environment variable, default `debug`.
- Changing the level asks the server; on failure the old value stays and an error is shown.

Selecting `TRACE` opens `开启 TRACE 日志？` with the risks. Confirming (`开启 TRACE`) shows a persistent banner: `TRACE 已开启：正在记录大量、可能未经脱敏的数据`, with `恢复 INFO`.

Do not leave TRACE on, and do not post unredacted logs publicly.

## Export and clear

| Control          | Result                                                             |
| ---------------- | ------------------------------------------------------------------ |
| `导出当前视图`   | Exports the filtered text; disabled when empty                     |
| `导出完整 TRACE` | Reads the server TRACE file; can be slow, reports `TRACE 导出失败` |
| `清空视图`       | After `清空当前日志视图？`, clears only the browser view           |

New entries continue after clearing. Export first if the log is evidence.

## Save and apply

| Item                                             | Saved as                   | Applies                                               |
| ------------------------------------------------ | -------------------------- | ----------------------------------------------------- |
| Preset, levels, search, scroll, wrap, highlights | Page preference, auto-save | Immediately; survives refresh                         |
| Server log level                                 | Server setting             | Immediately; file level still follows the environment |
| Clear view                                       | Current browser            | Immediately, not persisted                            |

## Troubleshooting

- **No entries**: check the stream state, service and network, then refresh.
- **Too much output**: use `运维` or `精简`, or disable levels.
- **Missing a recent event**: clear search, check the level filter, scroll to the bottom.
- **TRACE export fails**: confirm TRACE is enabled and the file is writable.
- **Poor colour visibility**: level text is still present; high-contrast mode is available in Appearance.
