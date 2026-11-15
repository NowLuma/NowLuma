import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repoRoot, 'tools/package-release.mjs');
// Same archive implementation the release package uses.
const tar = createRequire(path.join(repoRoot, 'packages/core/package.json'))('tar');

function fixture({ version = '2.5.0-rc.1', target = 'linux-x64', files = {}, entries } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nowluma-package-'));
  const dist = path.join(root, 'dist');
  const contents = {
    'index.mjs': '// entry\n',
    'package.json': JSON.stringify({ version }),
    'check-node-version.cjs': '// guard\n',
    'launcher.sh': '#!/bin/sh\n',
    'LICENSE': 'license\n',
    'EULA.md': 'eula\n',
    'PRIVACY.md': 'privacy\n',
    'client/index.html': '<!doctype html>\n',
    'native/sqlite/manifest.json': '{}\n',
    ...files,
  };
  for (const [name, body] of Object.entries(contents)) {
    const file = path.join(dist, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  const topLevel = [
    ...new Set([...Object.keys(contents), 'release.json'].map((name) => name.split('/')[0])),
  ].sort();
  fs.writeFileSync(
    path.join(dist, 'release.json'),
    JSON.stringify({ version, target, entries: entries ?? topLevel }, null, 2),
  );
  return { root, dist, out: path.join(root, 'out') };
}

function run(dist, out) {
  return execFileSync(process.execPath, [script, dist, out], { encoding: 'utf8', stdio: 'pipe' });
}

function failure(dist, out) {
  try {
    run(dist, out);
  } catch (error) {
    return error;
  }
  assert.fail('package-release.mjs must fail');
}

test('packages a linux-x64 release that reopens with its own manifest', async () => {
  const { dist, out } = fixture();
  const stdout = run(dist, out);
  const archive = path.join(out, 'nowluma-linux-x64-2.5.0-rc.1.tar.gz');
  assert.ok(fs.statSync(archive).isFile());
  assert.match(stdout, /SHA256: [0-9a-f]{64}/);

  const names = [];
  await tar.list({ file: archive, onReadEntry: (entry) => names.push(entry.path.replace(/^\.\//, '')) });
  for (const name of ['release.json', 'LICENSE', 'EULA.md', 'PRIVACY.md', 'native/sqlite/manifest.json']) {
    assert.ok(names.includes(name), `archive is missing ${name}`);
  }
  assert.ok(!names.some((name) => /^(?:config|data|logs)\//.test(name)));
});

test('rejects a release without the legal documents the console serves', () => {
  const { dist, out } = fixture();
  fs.rmSync(path.join(dist, 'EULA.md'));
  const error = failure(dist, out);
  assert.equal(error.status, 1);
  assert.match(error.stderr, /release is missing EULA\.md/);
});

test('rejects a release that carries user data', () => {
  const { dist, out } = fixture({
    files: { 'data/accounts.db': 'sqlite' },
    entries: ['LICENSE', 'EULA.md', 'PRIVACY.md', 'check-node-version.cjs', 'client', 'data', 'index.mjs', 'launcher.sh', 'native', 'package.json', 'release.json'],
  });
  const error = failure(dist, out);
  assert.equal(error.status, 1);
  assert.match(error.stderr, /must not contain user data: \.\/data\//);
});

test('rejects a release.json manifest that does not describe the archive', () => {
  const { dist, out } = fixture({ entries: ['index.mjs', 'package.json', 'release.json'] });
  const error = failure(dist, out);
  assert.equal(error.status, 1);
  assert.match(error.stderr, /do not match the release\.json manifest/);
});

test('rejects a Windows build, which ships as the one-click exe', () => {
  const { dist, out } = fixture({ target: 'win32-x64' });
  const error = failure(dist, out);
  assert.equal(error.status, 1);
  assert.match(error.stderr, /Linux packages come from a linux-x64 build/);
});
