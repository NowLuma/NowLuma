---
title: Contributing
description: Licence and attribution boundaries, repository layout, Node and pnpm baselines, tests and formatting, commit and review workflow, and the limits of release claims.
---

# Contributing

This chapter is for people changing code, opening a pull request, or redistributing. For usage, start at the [documentation index](index.md).

## Licence and what you may do

| Item | Status |
| --- | --- |
| Is the source open source? | **No** — it is not an OSI open-source licence. It is the Nowluma Non-Commercial License (NowlumaNC), a source-available non-commercial licence |
| Allowed | Reading, studying, personal or otherwise non-commercial use, non-commercial self-hosting, and modification and non-commercial distribution under the stated conditions |
| Requires prior written permission | Any commercial use; distribution beyond what the licence expressly permits |
| Distributing a Modified Version | Must retain the complete licence, give prominent Nowluma attribution and mark the Modified Version; must not impersonate an official release |
| Native binaries | The bundled `nowluma-*.node` / `*.dll` / `*.so` files are a separate proprietary component outside the source licence |
| Official release packages | Additionally covered by the EULA and privacy notice; where texts conflict, the Chinese version prevails |

The upstream project attribution exists only in the **last line** of the root `README.md`, as the licence and history require. **Do not reintroduce the upstream brand** in the product name, package names, interface, environment variables or new documentation: this renaming round already moved the workspace packages (`@nowluma/*`), environment variables (`NOWLUMA_*`), SDK identifiers and backup application identifier. `tools/check-identity.mjs` derives the old name from that line and checks filenames, text, the native ABI exception and binary skips; do not evade it with split strings.

The native components currently have only their **external filenames** changed; internal bytes and the required legacy socket ABI stay as they are. The six original `nowluma-*` prebuilds kept in the repository (two per platform) are the native components used by current releases. A separate external rewrite attempt is unfinished and not shipped; its observations cover only some Windows DLL builds, and `.node` linking, real injection, send/receive calibration, login and Linux pairing are not verified in this repository. Do not rewrite the current prebuild bytes to look cleaner.

This phase does not rewrite the QQ bridge kernel. The dual-kernel selector is not implemented; a future selector would require active informed risk acceptance for the original kernel on every QQ attach path, with no pre-checked acceptance and no silent fallback.

## Repository layout

| Directory | Responsibility |
| --- | --- |
| `packages/bridge` | QQ process discovery, account detection, native transport lifecycle |
| `packages/core` | Per-account orchestration, WebUI backend, startup/update assembly |
| `packages/onebot` | Actions, event conversion, account storage, HTTP/WebSocket |
| `packages/protocol` | Packet parsing, identity mapping, protocol and media requests |
| `packages/common` | Leaf utilities; browser imports must not pull in Node filesystem modules |
| `packages/webui` | React console |
| `packages/proto-defs` / `packages/proton` | Typed schemas and codec generation |
| `packages/sqlite` / `packages/websocket` | Supplied native bindings and wrappers |
| `packages/runtime` | Release scaffold and original prebuilds |
| `packages/sdk` / `mcp` / `ui` | Consumer APIs and tooling packages |
| `deploy` | Docker, installation, process supervision, persistence, the Windows launcher and smoke checks |
| `docs/content` | This documentation tree (Chinese `zh/`, English `en/`, coverage map `coverage.json`) |

## Environment

Use the Node pinned by `.node-version` (`24.22.1`) and the pnpm version in `package.json` (`11.25.0`). The supported runtime range is defined by `packages/runtime/check-node-version.cjs` and the per-package `engines`; do not lower the version check to make something run.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm run build:all
node tools/check-release-layout.mjs dist
node tools/check-identity.mjs
node --test deploy/docker/healthcheck.test.cjs
```

Do not change dependencies or the lockfile to get past a failure.

## Tests

| Case | Command |
| --- | --- |
| One package | `pnpm --filter @nowluma/<package> test` (the frontend package is `webui`) |
| Whole workspace | `pnpm test` |
| Native coverage | `pnpm test:native` |
| Real Docker check | `docker build -f deploy/docker/Dockerfile -t nowluma:ci .` then `node deploy/docker/smoke.mjs nowluma:ci` |

Rules:

- Run the tests owned by your change first, then the workspace checks.
- QQ local directories, tokens, passwords and traffic captures never enter fixtures, Git or public logs.
- Unit tests use fakes; `pnpm dev` may discover a real local QQ, so use it only when real runtime testing is intended.
- A missing native artifact or target platform for `pnpm test:native` is NOT_RUN, **not** permission to skip validation.

## Formatting

Four-space indentation in TypeScript; keep the existing imports, components and logging patterns. Format only the files you changed:

```bash
pnpm exec eslint --config eslint.format.config.ts --fix <changed files>
pnpm exec prettier --write <changed files>
```

## Generated files

After changing OneBot action names, documentation or return schemas:

```bash
pnpm --filter @nowluma/mcp gen
```

The generated-directory check compares against the committed snapshot. Commit the source definitions and the generated files together, never half.

## Commits and review

- Commit messages use English Conventional Commits, for example `fix(deploy): preserve QQ home across container recreation`.
- Target `main` in this repository via a feature branch. Do not depend on another repository's release flow.
- The repository ships issue templates (bug, feature request) and a pull-request template; PRs also pass a policy check script.
- File issues through the repository's web templates, with reproducible steps. **Never upload private account data, logs or traffic captures.**
- Review focuses on account isolation, input validation, error context and data protection; failures must never be silently converted into success.

## Change boundaries

- This phase does not rewrite the QQ bridge kernel. When changing a shared function, read all callers and neighbouring tests first.
- Preserve per-account identity, message/media history, signed non-zero int32 message IDs, teardown order and in-flight work.
- Separate input parsing from effects, validate at trust boundaries, and keep error detail.
- Keep desired persisted configuration distinct from applied runtime configuration and environment overrides.
- Never overwrite corrupt credentials or configuration with defaults, and never delete durable user data automatically.
- Media sends await validated upload completion; do not blindly retry uncertain writes.
- HTTP/WS listeners keep their configured binding, authentication, TLS failure handling and bounded buffering.
- SSE keeps account isolation, cursors, report filtering and shutdown on token revocation.
- SDK NodeNext relative imports keep the explicit `.js` suffix, and fresh-package import tests plus public action-map coverage must keep passing.

## CI and releases

The current pipeline runs type checks, static checks, tests and the release-layout check, and actually builds, starts and rebuilds a Linux/amd64 Docker test container. A successful build produces platform-specific Lite release artifacts and the Windows x64 single-file exe (currently unsigned).

**Not configured** are npm publishing, registry images and cross-repository automated releases. Therefore:

- Do not treat SDK/UI/MCP examples in the source as versions already published to npm.
- Do not claim signed executables, official images or unverified packages exist.
- Verify real artifacts and checksums yourself before release; do not label platforms this documentation has not endorsed as “tested”.

## Documentation contributions

- Only change Markdown under `docs/content/` and `coverage.json`.
- Pages link to each other with relative `.md` paths, and every file starts with YAML `title` and `description`.
- The Chinese and English trees mirror each other; changing a chapter means changing both languages.
- Never invent features, screenshots or execution results. The interface is still changing, so reference **stable labels and behaviour**, not pixel positions.
- `coverage.json` maps every console feature or group to its pages; update it whenever the interface gains a feature.

## Before opening a pull request

1. Did `pnpm typecheck`, `pnpm lint` and the affected package tests pass?
2. Did you change generated content? Are both the source and the generated files committed?
3. Do new or changed strings leak real accounts, tokens or hostnames?
4. Did you update both `zh/` and `en/` and refresh `coverage.json`?
5. Did anything planned get described as shipped?
