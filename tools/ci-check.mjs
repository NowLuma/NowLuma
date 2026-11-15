#!/usr/bin/env node
// Local run of the `verify` job in `.github/workflows/ci.yml`.
//
//   pnpm ci
//
// tools/ci-check.test.mjs parses that job and fails when this list drifts, so
// adding a gate to the workflow means adding it here too. The `docker` and
// `windows` jobs need their own runners and only run in CI; the release
// workflow re-runs the whole of ci.yml (Docker included) before it publishes,
// and tools/release.mjs runs this before it tags anything.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// [title, command, tool needed to run it]. A missing tool is reported as NOT
// RUN instead of passed: the same gate still runs in CI.
export const checks = [
  ['Install dependencies', 'pnpm install --frozen-lockfile'],
  ['Type check all packages', 'pnpm typecheck'],
  ['Lint managed source files', 'pnpm lint'],
  ['Check identity/name boundaries', 'node tools/check-identity.mjs'],
  ['Run all package tests', 'pnpm test'],
  ['Verify generated action catalog is up to date', 'node tools/check-action-catalog.mjs'],
  [
    'Test the deployment scripts and container health check',
    'node --test deploy/docker/healthcheck.test.cjs deploy/install.test.cjs',
  ],
  [
    'Check the shell entrypoints',
    'bash -n deploy/install.sh && bash -n deploy/manage.sh && bash -n deploy/docker/entrypoint.sh',
    'bash',
  ],
  ['Check the Docker Compose file', 'docker compose -f deploy/docker-compose.yml config --quiet', 'docker'],
  ['Build release inputs', 'pnpm run build:all'],
  ['Check the release layout', 'node tools/check-release-layout.mjs dist'],
  ['Build the documentation site', 'node tools/build-docs.mjs'],
  [
    'Build the static demo console',
    'pnpm --filter webui exec vite build --config vite.demo.config.ts',
  ],
  ['Check the documentation site and demo route', 'node tools/check-docs.mjs --with-demo'],
];

function installed(command) {
  const probe = spawnSync(command, ['--version'], { stdio: 'ignore', shell: true });
  return probe.status === 0;
}

function main() {
  const failed = [];
  const skipped = [];

  for (const [title, command, tool] of checks) {
    if (tool && !installed(tool)) {
      console.log(`\n▸ ${title}\n! NOT RUN: ${tool} is not installed here; this gate runs in CI`);
      skipped.push({ title, tool });
      continue;
    }
    console.log(`\n▸ ${title}\n$ ${command}\n`);
    const result = spawnSync(command, {
      cwd: repoRoot,
      shell: true,
      stdio: 'inherit',
      env: process.env,
    });
    const code = result.status === 0 ? 0 : (result.status ?? 1);
    if (code !== 0) {
      failed.push({ title, command, code });
      console.error(`\n✗ ${title} failed (exit ${code})`);
    } else {
      console.log(`\n✓ ${title}`);
    }
  }

  if (failed.length > 0) {
    console.error('\nLocal verify checks failed:');
    for (const item of failed) {
      console.error(`  - ${item.title}: \`${item.command}\` (exit ${item.code})`);
    }
    process.exit(1);
  }

  console.log('\nLocal verify checks passed (same commands as the `verify` job of .github/workflows/ci.yml).');
  if (skipped.length > 0) {
    console.log(
      `NOT RUN here (tool missing): ${skipped.map((item) => item.tool).join(', ')}. ` +
        'CI still runs them, and release.yml will not publish unless they pass.',
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
