---
title: Planned and unverified
description: What is not shipped or not verified yet — the Windows single-file exe, performance mode, native prebuilds and the dual-kernel selector, fused styles, the site simulator, artifacts and long-term QQ sessions.
---

# Planned and unverified

This page collects capabilities that are not shipped, not verified, or need a qualified claim, so the documentation cannot quietly turn a plan or an unverified conclusion into a promise. Each entry states its current status, what you can see today, and when to check back.

## One-line summary

| Item | Status | What we can say today |
| --- | --- | --- |
| Windows single-file exe | Built, unsigned | `Nowluma.exe` is produced by `tools/build-windows-exe.mjs` and bundles Node; the current build is unsigned and not validated on a real QQ account |
| Performance mode | Implemented, display setting only | Appearance offers auto-detect / full effects / low-performance; auto mode only degrades on sustained low foreground frame rates and promises no FPS, power or device gain |
| Six original prebuilds | Used by current releases, not rewritten | Internal bytes and the required legacy socket ABI stay unchanged; the separate external rewrite attempt is unfinished and not shipped |
| Dual-kernel selector | Not implemented | A future selector would require active informed risk acceptance for the original kernel; never pre-checked, never a silent fallback |
| Fused styles | Interface under restructuring | Glass/fusion components exist; the current UI is being structurally redesigned, with no visual acceptance or screenshots |
| Site practice mode `/demo/` | Built with the site | Boundaries in [Practice mode](demo.md); the page is produced by the simulator build |
| Static site and publishing pipeline | Owned by the publisher | This documentation supplies content only |
| arm64 Docker | Build inputs exist, unverified | Do not label it a tested platform |
| Long-term QQ sessions | Cannot be verified in CI | Only you can verify it on your own account |
| Update mirrors | Supplied by you | No third-party mirror is recommended or verified here |
| Signed artifacts / official images / npm packages | Nonexistent or unconfirmed | Do not claim they exist |

## Windows single-file exe

Windows x64 ships as a self-contained `Nowluma.exe`:

- It is packaged by `tools/build-windows-exe.mjs` and bundles Node and the runtime; no Docker, Node or .NET installation is required.
- Double-clicking it unpacks to `%LOCALAPPDATA%\Nowluma` and opens the console in your browser; choose local QQ, or an isolated desktop when an existing Linux Docker engine is available.
- The current build is **unsigned** and may trigger SmartScreen. Release notes should provide a SHA-256; do not run a binary without a checksum.
- Closing the window may end the process early; prefer Ctrl+C in the console for a graceful stop. QQ user data and settings are not deleted.

This is not a claim that the exe is signed or accepted on a real account. Real QQ login, injection and long-term sessions remain yours to verify; see [Native install](install-native.md#windows).

## Performance mode

The appearance setting 「性能模式」 (performance mode) is implemented as a neutral display option:

- 「自动检测（默认）」 (auto-detect, default) turns off animation and live refraction only after sustained low foreground frame rates. Results are not written back to the server and do not affect other devices.
- 「完整效果」 (full effects) and 「低性能 / 关闭动效」 (low performance / motion off) are manual choices.
- It does not change messages, accounts or networking, and promises no frame rate, power saving or low-end device gain. There is no benchmark to cite.

Automatic account selection or resource strategy is still a direction with no interface. Do not conflate performance mode with 「自动连接已打开的 QQ」 (auto-connect to an already-open QQ): the latter tries to bridge on startup and is **not** QQ auto-login.

## Six original prebuilds and the dual kernel

- The six original `nowluma-*` prebuilds kept in the repository (`.node` plus `.dll`/`.so` for three platforms) are the native components used by current releases; only their external filenames have changed. Internal bytes and the required legacy socket ABI stay as they are.
- A separate external rewrite attempt is unfinished and not shipped; its observations cover only some Windows DLL builds, and `.node` linking, real injection, send/receive calibration, login behaviour and Linux pairing are not verified in this repository.
- This phase does not rewrite the QQ bridge kernel. The dual-kernel selector is not implemented; a future selector would require active informed risk acceptance for the original kernel on every QQ attach path, with no pre-checked acceptance and no silent fallback.

## Fused styles

Glass and fusion components already exist; the interface is currently being structurally redesigned, so visual details will keep changing. The existing appearance system (palettes, accent colour, background, theme variables, custom CSS) keeps its previous precedence — see [Settings: console](settings-console.md#appearance).

This round did not run a separate visual acceptance and provides no screenshots; this documentation avoids pixel positions and specific colour values. Fused styles do not change the precedence of custom CSS or the host-managed overlay.

## Practice mode `/demo/`

- Path `/demo/`, generated by the site build (when that build includes the simulator).
- Approach: render the real interface over an independent simulated API layer, with a permanent “simulated data” marker.
- No real credentials, no requests to external addresses.

**Still yours to confirm**:

1. A persistent “simulated” marker is present and no real token or password fields are offered.
2. Simulated results never write into real configuration files.

## Releases and the publishing pipeline

- The automation is being expanded; this documentation describes nothing beyond what already exists.
- Known artifact forms: platform-specific Lite release builds, the Windows x64 `Nowluma.exe` single file, and Docker images built locally (`docker build -f deploy/docker/Dockerfile`).
- `deploy/install.sh` lives only in the source repository; it is not shipped in Lite or Windows release packages.
- Not configured: npm publishing, registry image publishing, cross-repository automated releases.
- Therefore: do not claim official registry tags, signed installers or release files that do not exist.

## Things only you can verify

| Item | How |
| --- | --- |
| Whether your QQ signs in automatically | Restart and watch the QQ window, as in [Data, backup and updates](data-backup.md#qq-persistence-and-manual-verification) |
| Whether your bot replies | Real account + real endpoint + the bot's own log |
| Long-running stability | Observe it yourself; record version and time |
| Ban or risk-control exposure | This project offers no probability estimate |
| arm64 usability | Build and run it yourself on that machine |

## How to read any claim

If a statement falls into one of these categories, assume it is unverified:

- Absolute conclusions such as “guaranteed”, “always” or “never”.
- A claim that a platform is “tested” without saying how.
- A download address with no checksum.
- A screenshot with no version attached.

In this documentation set such content is always labelled with its status instead of being mixed into instructions.
