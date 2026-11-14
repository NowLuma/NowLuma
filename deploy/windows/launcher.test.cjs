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
      assert.match(
        result,
        /PASS: actual launcher startup, auto-port endpoint and graceful shutdown \(fixture only\)/,
      );
      assert.match(result, /PASS: fixture received stdin shutdown/);
      assert.match(result, /PASS: fixture in-flight cleanup completed/);
      assert.match(
        result,
        /PASS: startup failure detail and bounded stalled-runtime cleanup \(fixture only\)/,
      );
      assert.match(
        result,
        /PASS: actual Docker terminal choices, image retention, Linux gate and failed command \(fake Docker only\)/,
      );
      assert.equal(
        fs.readdirSync(directory).some((name) => name.startsWith('.docker-fixture-')),
        false,
      );
      const stalled = /FIXTURE stalled runtime pid=(\d+) child=(\d+)/.exec(result);
      assert.ok(stalled, 'The stalled fixture must exercise an owned child process');
      for (const pid of stalled.slice(1))
        assert.throws(() => process.kill(Number(pid), 0), { code: 'ESRCH' });
      assert.equal(fs.existsSync(path.join(directory, '.launcher-fixture.mjs')), false);
      assert.equal(fs.existsSync(path.join(directory, '.launcher-endpoint')), false);
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
    let lockClosed;
    try {
      execFileSync(exe, ['--self-test', root], { encoding: 'utf8', timeout: 60000 });
      fs.mkdirSync(path.join(root, 'config'));
      fs.writeFileSync(path.join(root, 'config', 'keep'), 'unchanged');
      const previous = Buffer.from('FIXTURE: previous program bytes');
      fs.writeFileSync(path.join(root, 'index.mjs'), previous);
      fs.unlinkSync(path.join(root, '.launcher-payload'));
      const script =
        '$f=[IO.File]::Open($env:LOCK_TARGET,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None); Write-Output "locked"; [Console]::ReadLine()|Out-Null; $f.Dispose()';
      lock = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        env: { ...process.env, LOCK_TARGET: path.join(root, 'node.exe') },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      lockClosed = new Promise((resolve) => lock.once('close', resolve));
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Fixture file lock did not start')), 5000);
        lock.stdout.once('data', () => {
          clearTimeout(timer);
          resolve();
        });
        lock.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        lock.once('close', () => {
          clearTimeout(timer);
          reject(new Error('Fixture file lock exited'));
        });
      });
      assert.throws(() =>
        execFileSync(exe, ['--self-test', root], { input: '\n', encoding: 'utf8', timeout: 60000 }),
      );
      lock.stdin.end('\n');
      await lockClosed;
      lock = undefined;
      assert.deepEqual(fs.readFileSync(path.join(root, 'index.mjs')), previous);
      assert.equal(fs.existsSync(path.join(root, '.launcher-payload')), false);
      assert.equal(
        fs.readdirSync(root).some((name) => name.startsWith('.install-')),
        false,
      );
      assert.equal(fs.readFileSync(path.join(root, 'config', 'keep'), 'utf8'), 'unchanged');
    } finally {
      lock?.kill();
      await lockClosed;
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test('QQ setup pins downloads and rejects unsafe installers before starting them', () => {
  const source = fs.readFileSync(path.join(__dirname, 'QqSetup.cs'), 'utf8');
  assert.match(source, /QQ_9\.9\.37_261103_x64_01\.exe/);
  assert.match(source, /https:\/\/qqdl\.gtimg\.cn\/qqfile\/QQNTV2\/9\.9\.37\/release\/a2ca1b61\//);
  assert.match(
    source,
    /https:\/\/github\.com\/a1515333102\/QQ-Releases\/releases\/download\/9\.9\.37%2B3\.2\.35\//,
  );
  assert.match(source, /5cd7c13e36b391f88b2ad272fa870d74f476135b64244844ec0ad7ac7b411b48/);
  assert.match(source, /error is HttpRequestException or OperationCanceledException/);
  assert.match(source, /third-party QQ-Releases mirror\?", "n"/);
  assert.match(source, /QQ installer checksum mismatch/);
  assert.match(source, /Get-AuthenticodeSignature -LiteralPath \$env:NOWLUMA_QQ_INSTALLER/);
  assert.match(source, /\$s\.Status -ne 'Valid'/);
  assert.match(source, /SignerCertificate\.Subject -notmatch/);
  assert.match(source, /Tencent /);
  assert.ok(
    source.indexOf('await VerifySignature(installer)') <
      source.indexOf('new ProcessStartInfo(installer)'),
  );
  assert.match(source, /setup\.ExitCode is 3010 or 1641/);
  assert.match(source, /setup\.ExitCode != 0/);
  assert.match(source, /CancellationTokenSource\(TimeSpan\.FromMinutes\(20\)\)/);
  assert.match(source, /input\.ReadAsync\(buffer, timeout\.Token\)/);
  assert.match(source, /400L \* 1024 \* 1024/);
  assert.doesNotMatch(
    source,
    /GetFiles|EnumerateFiles|SearchOption|ServerCertificateCustomValidationCallback|\/S\b/,
  );
});

test('Windows terminal retains Docker management without VM installation or volume deletion', () => {
  const source = fs.readFileSync(path.join(__dirname, 'WindowsContainer.cs'), 'utf8');
  const program = fs.readFileSync(path.join(__dirname, 'Program.cs'), 'utf8');
  const compose = fs.readFileSync(path.join(__dirname, 'compose.yml'), 'utf8');
  assert.match(program, /WindowsContainer\.Available\(\)/);
  assert.match(program, /Existing Docker isolated desktop/);
  assert.match(program, /File\.WriteAllText\(modeFile, mode\)/);
  assert.match(program, /Invalid saved environment choice; it was not replaced/);
  assert.match(program, /No running Linux Docker engine/);
  assert.match(program, /previousMode == "2" \? "0" : "1"/);
  assert.match(source, /File\.WriteAllText\(imageFile, image\)/);
  for (const command of ['logs', 'restart', 'stop', 'up'])
    assert.ok(source.includes(`await Command(directory, compose, image, "${command}"`));
  assert.match(source, /while \(true\)/);
  assert.match(source, /case "0": return 0/);
  assert.match(source, /WSL\/VM overhead varies/);
  assert.match(source, /CancellationTokenSource\(TimeSpan\.FromMinutes\(5\)\)/);
  assert.doesNotMatch(source, /"down"|"-v"|volume rm|wsl --install|winget|Docker Desktop\.exe/);
  assert.match(compose, /127\.0\.0\.1:5099:5099/);
  assert.match(compose, /qq-home:\/home\/nowluma/);
  assert.match(compose, /NOWLUMA_DESKTOP_PROXY: "1"/);
  assert.match(program, /child\.Kill\(entireProcessTree: true\)/);
  assert.match(program, /shutdownGrace = TimeSpan\.FromSeconds\(35\)/);
  assert.match(program, /shutdown\.Wait\(TimeSpan\.FromSeconds\(3\)\)/);
  assert.match(program, /exited\.WaitAsync\(TimeSpan\.FromSeconds\(1\)\)/);
  assert.match(program, /File\.Delete\(endpointFile\)/);
});

test(
  'newer runtime and corrupt release metadata are never replaced with bundled defaults',
  { skip: process.platform !== 'win32', timeout: 60000 },
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nowluma-exe-version-'));
    try {
      execFileSync(exe, ['--self-test', root], { encoding: 'utf8', timeout: 60000 });
      const manifest = path.join(root, 'release.json');
      const release = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      release.version = '99.0.0';
      fs.writeFileSync(manifest, JSON.stringify(release));
      fs.writeFileSync(path.join(root, 'index.mjs'), 'FIXTURE: newer runtime');
      execFileSync(exe, ['--self-test', root], { encoding: 'utf8', timeout: 60000 });
      assert.equal(fs.readFileSync(path.join(root, 'index.mjs'), 'utf8'), 'FIXTURE: newer runtime');
      assert.equal(JSON.parse(fs.readFileSync(manifest, 'utf8')).version, '99.0.0');
      fs.writeFileSync(manifest, '{corrupt fixture');
      assert.throws(() =>
        execFileSync(exe, ['--self-test', root], { encoding: 'utf8', timeout: 60000 }),
      );
      assert.equal(fs.readFileSync(manifest, 'utf8'), '{corrupt fixture');
      assert.equal(fs.readFileSync(path.join(root, 'index.mjs'), 'utf8'), 'FIXTURE: newer runtime');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'runtime directory junctions cannot overwrite files outside the isolated fixture root',
  { skip: process.platform !== 'win32', timeout: 60000 },
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nowluma-exe-links-'));
    const directory = path.join(root, 'application');
    const outside = path.join(root, 'outside-fixture');
    try {
      execFileSync(exe, ['--self-test', directory], { encoding: 'utf8', timeout: 60000 });
      fs.renameSync(path.join(directory, 'client'), outside);
      const original = fs.readFileSync(path.join(outside, 'index.html'));
      fs.symlinkSync(outside, path.join(directory, 'client'), 'junction');
      fs.unlinkSync(path.join(directory, '.launcher-payload'));
      assert.throws(
        () => execFileSync(exe, ['--self-test', directory], { encoding: 'utf8', timeout: 60000 }),
        (error) => /uses a link/.test(error.stderr),
      );
      assert.deepEqual(fs.readFileSync(path.join(outside, 'index.html')), original);
      fs.unlinkSync(path.join(directory, 'client'));
      fs.symlinkSync(directory, path.join(root, 'linked-root'), 'junction');
      assert.throws(
        () =>
          execFileSync(exe, ['--self-test', path.join(root, 'linked-root')], {
            encoding: 'utf8',
            timeout: 60000,
          }),
        (error) => /uses a link/.test(error.stderr),
      );
      assert.throws(
        () =>
          execFileSync(exe, ['--self-test', path.join(root, 'linked-root', 'new-directory')], {
            encoding: 'utf8',
            timeout: 60000,
          }),
        (error) => /uses a link/.test(error.stderr),
      );
      assert.equal(fs.existsSync(path.join(directory, 'new-directory')), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'a second actual launcher self-test respects the existing lease without opening a browser',
  { skip: process.platform !== 'win32', timeout: 60000 },
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nowluma-exe-lease-'));
    let child;
    try {
      child = spawn(exe, ['--self-test', root], { stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      const closed = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Fixture did not start')), 30000);
        child.stdout.on('data', (chunk) => {
          output += chunk;
          if (output.includes('FIXTURE stalled runtime pid=')) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once('close', () => {
          clearTimeout(timer);
          reject(new Error('Fixture exited before lease check'));
        });
      });
      const result = execFileSync(exe, ['--self-test', root], { encoding: 'utf8', timeout: 10000 });
      assert.match(result, /already running|已运行/);
      assert.doesNotMatch(result, /PASS: bundled Node/);
      assert.equal(await closed, 0);
      child = undefined;
      assert.equal(fs.existsSync(path.join(root, '.launcher-endpoint')), false);
    } finally {
      child?.kill();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
