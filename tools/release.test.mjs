import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'tools/release.mjs');

function run(...args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

test('requires a canonical SemVer target', () => {
  const missing = run();
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Usage: pnpm release <version>/);

  const invalid = run('2.5');
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Invalid SemVer: "2\.5"/);
});

test('a dry run plans the tag and the version guard, and writes nothing', () => {
  const tags = git('tag', '--list');
  const status = git('status', '--porcelain');
  const result = run('0.0.1', '--dry-run');

  // 0.0.1 is not the committed version, so the guard must reject it before any push.
  assert.equal(result.status, 1);
  assert.match(result.stdout, /check-version\.mjs --tag v0\.0\.1/);
  assert.match(result.stdout, /would run node tools\/ci-check\.mjs/);
  assert.match(result.stderr, /tag "v0\.0\.1" does not match package version/);

  assert.equal(git('tag', '--list'), tags, 'a dry run must not create or move a tag');
  assert.equal(git('status', '--porcelain'), status, 'a dry run must not touch the tree');
});
