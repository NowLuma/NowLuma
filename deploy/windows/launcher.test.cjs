const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const exe = path.resolve(process.env.NOWLUMA_TEST_EXE || '_re/releases/windows-exe/Nowluma.exe');
test(
  'single Windows exe extracts in a spaced path and preserves user data on reinstall',
  { skip: process.platform !== 'win32' },
  () => {
    assert.ok(fs.existsSync(exe), 'Build the Windows exe first');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nowluma-exe-test-'));
    const directory = path.join(root, 'app with spaces');
    try {
      const result = execFileSync(exe, ['--self-test', directory], {
        encoding: 'utf8',
        timeout: 60000,
      });
      assert.match(result, /PASS: bundled Node/);
      const release = JSON.parse(fs.readFileSync(path.join(directory, 'release.json'), 'utf8'));
      assert.equal(release.target, 'win32-x64');
      for (const name of ['config', 'data', 'logs']) {
        fs.mkdirSync(path.join(directory, name));
        fs.writeFileSync(path.join(directory, name, 'keep'), 'unchanged');
      }
      fs.unlinkSync(path.join(directory, '.launcher-payload'));
      execFileSync(exe, ['--self-test', directory], { encoding: 'utf8', timeout: 60000 });
      for (const name of ['config', 'data', 'logs'])
        assert.equal(fs.readFileSync(path.join(directory, name, 'keep'), 'utf8'), 'unchanged');
      assert.ok(fs.existsSync(path.join(directory, 'licenses', 'Node-LICENSE.txt')));
      assert.ok(fs.existsSync(path.join(directory, 'licenses', '.NET-LICENSE.txt')));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'failed program replacement rolls back its copy without deleting existing user data',
  { skip: process.platform !== 'win32' },
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nowluma-exe-rollback-'));
    let lock;
    try {
      execFileSync(exe, ['--self-test', root], { encoding: 'utf8', timeout: 60000 });
      fs.mkdirSync(path.join(root, 'config'));
      fs.writeFileSync(path.join(root, 'config', 'keep'), 'unchanged');
      const previous = fs.readFileSync(path.join(root, 'index.mjs'));
      fs.unlinkSync(path.join(root, '.launcher-payload'));
      const script =
        '$f=[IO.File]::Open($env:LOCK_TARGET,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None); Write-Output "locked"; [Console]::ReadLine()|Out-Null; $f.Dispose()';
      lock = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        env: { ...process.env, LOCK_TARGET: path.join(root, 'index.mjs') },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      await new Promise((resolve, reject) => {
        lock.stdout.once('data', resolve);
        lock.once('error', reject);
      });
      assert.throws(() =>
        execFileSync(exe, ['--self-test', root], { input: '\n', encoding: 'utf8', timeout: 60000 }),
      );
      lock.stdin.end('\n');
      await new Promise((resolve) => lock.once('close', resolve));
      lock = undefined;
      assert.deepEqual(fs.readFileSync(path.join(root, 'index.mjs')), previous);
      assert.equal(fs.readFileSync(path.join(root, 'config', 'keep'), 'utf8'), 'unchanged');
    } finally {
      lock?.kill();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
