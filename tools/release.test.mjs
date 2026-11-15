import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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

/** A throwaway repo with a real origin, so preflight can run without the network. */
function fixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nowluma-release-'));
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(path.join(repo, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'packages'));
  for (const file of ['release.mjs', 'check-version.mjs']) {
    fs.copyFileSync(path.join(root, 'tools', file), path.join(repo, 'tools', file));
  }
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'fixture', version: '9.9.9' }));
  fs.writeFileSync(path.join(repo, 'CHANGELOG.md'), '## 2.0.0\n\n- old\n');
  const run = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe' });
  run('init', '-b', 'main');
  run('add', '-A');
  run('-c', 'user.name=Release Test', '-c', 'user.email=release@example.invalid', 'commit', '-m', 'fixture');
  const origin = path.join(dir, 'origin.git');
  execFileSync('git', ['init', '--bare', origin], { stdio: 'pipe' });
  run('remote', 'add', 'origin', origin);
  run('push', 'origin', 'main');
  return { dir, repo };
}

/** First PATH entry for a tool, so a fixture can run with a deliberately small PATH. */
function findTool(name) {
  const extensions = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE').split(';') : [''];
  for (const entry of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const extension of extensions) {
      const candidate = path.join(entry, name + extension);
      if (fs.existsSync(candidate)) return candidate;
      const lower = path.join(entry, name + extension.toLowerCase());
      if (fs.existsSync(lower)) return lower;
    }
  }
  return null;
}

test('--no-wait does not need gh but still enforces main, origin and the version guard', () => {
  const { dir, repo } = fixtureRepo();
  try {
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    // A failing `gh` simulates an operator without the CLI on both platforms.
    fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    fs.writeFileSync(path.join(bin, 'gh.cmd'), '@exit /b 1\r\n');
    // On Windows the executable shim is not runnable without a shell, so drop
    // the real gh directory; git and node keep the rest of PATH.
    const ghPath = findTool('gh');
    const ghDir = ghPath ? path.resolve(path.dirname(ghPath)).toLowerCase() : null;
    const entries = (process.env.PATH ?? '')
      .split(path.delimiter)
      .filter((entry) => !ghDir || path.resolve(entry).toLowerCase() !== ghDir);
    const smallPath = [bin, ...entries].join(path.delimiter);
    const release = (...args) =>
      spawnSync(process.execPath, [path.join(repo, 'tools/release.mjs'), '9.9.9', ...args], {
        cwd: repo,
        encoding: 'utf8',
        env: { ...process.env, PATH: smallPath },
      });

    const blocked = release();
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /gh is required to watch the release workflow/);

    const noWait = release('--no-wait');
    assert.equal(noWait.status, 1);
    assert.match(noWait.stderr, /CHANGELOG\.md has no non-empty "## 9\.9\.9" section/);
    assert.equal(/gh is required/.test(noWait.stderr), false, '--no-wait must not probe gh');

    assert.equal(execFileSync('git', ['tag', '--list'], { cwd: repo, encoding: 'utf8' }).trim(), '');
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim(), '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
