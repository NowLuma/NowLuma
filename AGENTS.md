# Working on Nowluma

Read `CONTRIBUTING.md`, `LICENSE`, and the affected implementation/tests before editing.
Use `git status` to preserve unrelated work. Issues should be submitted manually using the repository web template; do not file private account data or logs for the user.

## Ownership

- `packages/bridge`: QQ process discovery, account detection, original native transport lifecycle.
- `packages/core`: per-account orchestration, WebUI backend, startup/update assembly.
- `packages/onebot`: actions, event conversion, account storage, HTTP/WebSocket transports.
- `packages/protocol`: packet parsing, identity mapping, protocol/media requests.
- `packages/common`: leaf utilities; browser imports must not pull in Node filesystem modules.
- `packages/webui`: React console. Follow its README interaction conventions.
- `packages/proto-defs` / `packages/proton`: typed schemas and codec generation.
- `packages/sqlite` / `packages/websocket`: supplied native bindings and wrappers.
- `packages/runtime`: release scaffold and original prebuilds.
- `packages/sdk` / `packages/mcp` / `packages/ui`: consumer APIs and UI/tool packages.
- `deploy`: Docker, installation, process supervision, persistence and smoke checks.

QQ connectivity is intentionally not redesigned in the current phase. New product naming is `Nowluma`, workspace imports are `@nowluma/*`, and environment variables use `NOWLUMA_*`.
Only the root README introduction contains the original project name. Original native bytes and their fallback socket ABI are explicit temporary exceptions; never patch arbitrary prebuild bytes to make a test pass.

## Safety and contracts

- Fix shared owners once; read all callers and neighboring tests before changing a function.
- Preserve per-account identity, message/media history, signed non-zero int32 message IDs, teardown order and in-flight work.
- Parse input separately from effects, validate trust boundaries, retain error details, and never turn a failed response into success.
- Keep desired persisted config distinct from applied runtime config and environment overrides.
- Do not overwrite corrupt credentials/config with defaults or automatically delete durable user data.
- Media sends await validated upload completion; do not retry uncertain writes blindly.
- HTTP/WS listeners retain configured binding, authentication, TLS failure handling and bounded buffering.
- SSE streams preserve account isolation, cursors, report filtering and revoked-token shutdown.
- SDK NodeNext relative imports keep explicit `.js`; maintain fresh-package import tests and public action-map coverage.
- OneBot action/catalog changes update tests, SDK contracts where affected, and generated MCP catalog via `pnpm --filter @nowluma/mcp gen`.
- Proton transformations must be used in tests as in production; do not substitute a duplicate test implementation.
- Never commit actual passwords, account databases, tokens, user HOME, or unredacted traffic captures.
- Do not claim a fixture/API success proves QQ delivery, rendering, automatic account login or ban risk.

## Deployment

The container uses a fixed UID/GID and complete persistent QQ HOME. Startup does not mint fresh QQ credentials. Required desktop/runtime processes must be supervised and fail visibly.
Normal stop/restart/recreation preserves every data volume. Destructive cleanup requires explicit user action.
Desktop access uses the WebUI session through a same-origin gateway; its loopback VNC backend retains independent password authentication. Do not return its private password to browsers, put session/QQ credentials in URLs, disable VNC authentication, or grant privileged/host-process access as a shortcut. Desktop HTTP and WebSocket routes enforce session revocation, consent/password gates and origin checks.

## Validation

Use the Node pin and pnpm version already declared in the workspace; do not change dependencies/lockfile to avoid failures.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm run build:all
node tools/check-release-layout.mjs dist
node tools/check-identity.mjs
node --test deploy/docker/healthcheck.test.cjs
```

Focused package tests run with `pnpm --filter @nowluma/<package> test`; the frontend package name is `webui`.
`pnpm dev` can attach to local QQ: only run it when real runtime testing is intended. Prefer isolated fakes and the Docker smoke container without a real account.
Native coverage remains separate (`pnpm test:native`). A missing native artifact or absent target is NOT_RUN, not permission to bypass validation.

Format only affected source files using root ESLint-format and Prettier. Use four-space TypeScript indentation and the existing imports, components and logging patterns.
Source-reference clones and `_re` artifacts are ignored local research, not publishable project inputs.

## Handoff

Target the current repository's `main` via a feature branch, not another repository's promotion/publish flow. Retain supplied license terms and third-party attribution.
Report actual commands, exit statuses, build artifacts and unverified platform/runtime gates. Keep an implementation task open if its code or required verification remains incomplete.
