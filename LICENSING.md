# Nowluma 许可与第三方声明 / Licensing and Notices

本文件记录自有源码的 GPLv3 许可、下述第 7 条附加链接许可，以及随包组件的独立条款；GPLv3 标准全文见 [LICENSE](LICENSE)。
This file records the GPLv3 licence for our source, the section 7 additional linking permission below, and the separate terms for supplied components. See [LICENSE](LICENSE) for the unmodified GPLv3 text.

## 1. 源码许可 / Source licence

Copyright (C) 2026 Nowluma contributors.

Nowluma 自有源代码、文档与资源采用 **GNU 通用公共许可证第 3 版（GPL-3.0-only）**。根目录 `LICENSE` 是 GNU 发布的 GPLv3 标准全文，逐字未改：来源 <https://www.gnu.org/licenses/gpl-3.0.txt>，35149 字节，SHA-256 `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`。GPL 源码没有附加限制：你可以按 GPLv3 使用、研究、修改和分发（包括商业用途），无需另行取得授权。
Nowluma's own source code, documentation and assets are licensed under the **GNU General Public License, version 3 only (GPL-3.0-only)**. The root `LICENSE` is the verbatim GNU GPLv3 text: source <https://www.gnu.org/licenses/gpl-3.0.txt>, 35149 bytes, SHA-256 `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`. There are no additional restrictions on the GPL-covered source: you may use, study, modify and redistribute it, including commercially, under GPLv3 without further permission.

## 2. GPLv3 第 7 条附加链接许可 / GPLv3 section 7 additional linking permission

作为 GPLv3 第 7 条下的附加许可，我们（就我们有权许可的 GPL 源码部分）允许你将该 GPL 源码与 `packages/runtime/native/` 中随包提供的预编译原生组件（`nowluma-*`、`websocket-*`、`ffmpeg/ffmpegAddon-*`）组合、链接。
As an additional permission under section 7 of the GPLv3, we — for the GPL-covered source that we are entitled to license — permit you to combine and link that source with the precompiled native components supplied in `packages/runtime/native/` (`nowluma-*`, `websocket-*`, `ffmpeg/ffmpegAddon-*`).

该许可只解决 GPL 源码与这些组件的组合与链接：它不重新许可这些原生组件，不授予其源代码权利，也不授权单独分发这些原生文件；它不改变或限制 GPL 源码本身的使用、修改与再分发条件。
This permission addresses only the combination and linking of the GPL-covered source with those components: it does not relicense the native components, grant rights to their source code or authorize their separate distribution, and it neither changes nor restricts the GPL source's own terms for use, modification and redistribution.

## 3. 随包原生组件 / Supplied native components

`packages/runtime/native/` 中的文件继续适用提供方的独立条款，本仓库不将它们重新许可为 GPL。其中六份 `nowluma-*` 预编译文件（三个平台各 `.node` 加 `.dll`/`.so`）除另有书面授权外，仅授权以随本软件提供的形式进行非商业运行；不授予其源代码、修改、单独再分发或再许可的权利。此范围仅针对这些原生文件，不限制 GPL 源码本身的权利；适用法律规定不得排除的权利不受影响。
Files under `packages/runtime/native/` retain their suppliers' separate terms and are not relicensed under the GPL here. Unless separately authorized in writing, the six `nowluma-*` prebuilds (one `.node` plus `.dll`/`.so` per platform) may only be run as supplied with this software for non-commercial use; no rights to their source, modification, separate redistribution or relicensing are granted. This scope applies only to those native files and does not restrict rights in the GPL-covered source. Non-waivable rights under applicable law remain unaffected.

## 4. 第三方组件 / Third-party components

- npm 依赖继续适用各自的许可证；本仓库不重新许可它们。
  npm dependencies keep their own licences; this repository does not relicense them.
- SQLite 原生绑定以其自带许可证随发行包提供（`dist/native/sqlite/LICENSE.sqlite3`，来源 `@appthreat/sqlite3`）。
  The SQLite native binding ships with its own licence (`dist/native/sqlite/LICENSE.sqlite3`; source `@appthreat/sqlite3`).
- 随包的 Jersey 20 字体版权归 The Soft Type Project Authors，采用 SIL Open Font License，许可证文本随字体提供（`packages/webui/src/appearance/targets/assets/Jersey20-OFL.txt`）。
  The bundled Jersey 20 font is copyright The Soft Type Project Authors and licensed under the SIL Open Font License; its licence text ships with it (`packages/webui/src/appearance/targets/assets/Jersey20-OFL.txt`).
- Windows 发行包另附 Node.js 与 .NET 的许可证文件（`licenses/`）。
  Windows release packages carry the Node.js and .NET licence files under `licenses/`.
