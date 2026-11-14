import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const image = process.argv[2] ?? 'nowluma:ci';
const name = `nowluma-smoke-${process.pid}`;
const volumes = ['config', 'data', 'logs', 'home'].map((part) => `${name}-${part}`);
const password = `Aa!${randomBytes(24).toString('base64url')}`;
const base = 'http://127.0.0.1:19099';
let token;
function docker(...args) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    timeout: 180_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function start() {
  docker(
    'run',
    '-d',
    '--name',
    name,
    '--hostname',
    'nowluma',
    '--cap-add=SYS_PTRACE',
    '--shm-size=1g',
    '-p',
    '127.0.0.1:19099:5099',
    '-p',
    '127.0.0.1:19080:6080',
    '-e',
    `NOWLUMA_WEBUI_BOOTSTRAP_PASSWORD=${password}`,
    '-e',
    'NOWLUMA_ACCEPT_EULA=1',
    '-e',
    'NOWLUMA_ACCEPT_PRIVACY=1',
    '-e',
    'NOWLUMA_VNC_PORT=19080',
    '--mount',
    `type=volume,source=${volumes[0]},target=/app/config`,
    '--mount',
    `type=volume,source=${volumes[1]},target=/app/data`,
    '--mount',
    `type=volume,source=${volumes[2]},target=/app/logs`,
    '--mount',
    `type=volume,source=${volumes[3]},target=/home/nowluma`,
    image,
  );
}
function stop() {
  docker('stop', '-t', '35', name);
  assert.equal(
    Number(docker('inspect', '--format', '{{.State.ExitCode}}', name)),
    0,
    'container shutdown must finish gracefully',
  );
}
async function waitHealthy() {
  for (let attempt = 0; attempt < 180; attempt++) {
    const state = JSON.parse(docker('inspect', name))[0].State;
    if (state.Health?.Status === 'healthy') return;
    if (state.Status !== 'running') throw new Error(`container ${state.Status}`);
    await delay(1000);
  }
  throw new Error('container did not become healthy');
}
async function api(route, body) {
  const response = await fetch(`${base}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Nowluma-Token': token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.ok, true, `HTTP ${response.status} on ${route}`);
  return response.json();
}
async function login() {
  const result = await api('/api/login', { password });
  assert.equal(result.success, true);
  assert.equal(typeof result.token, 'string');
  token = result.token;
}
async function checkDesktopAndHook() {
  const system = await api('/api/system');
  assert.equal(system.hostname, 'nowluma');
  assert.equal(system.deployment.home, '/home/nowluma');
  assert.equal(system.deployment.uid, 1000);
  assert.equal(system.deployment.directories.qq, '/home/nowluma/.config/QQ');
  assert.equal(system.deployment.writable.qq, true);
  assert.equal(system.deployment.vncPort, 19080);
  docker('exec', '--user', '1000:1000', name, 'node', '/usr/local/lib/nowluma-healthcheck.cjs');
  const desktop = await fetch('http://127.0.0.1:19080/vnc.html', {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(desktop.ok, true);
  for (let attempt = 0; attempt < 60; attempt++) {
    const { list } = await api('/api/processes');
    assert.ok(Array.isArray(list));
    if (list.some((process) => process.injected && process.connected)) return;
    if (list.some((process) => process.status === 'error')) {
      throw new Error(`QQ hook failed: ${list.map((process) => process.error).join('; ')}`);
    }
    await delay(1000);
  }
  throw new Error('QQ started but the native hook did not connect');
}
try {
  for (const volume of volumes) docker('volume', 'create', volume);
  start();
  await waitHealthy();
  await login();
  await checkDesktopAndHook();
  await api('/api/system/settings', { vncPort: 6123 });
  docker(
    'exec',
    name,
    'sh',
    '-c',
    'mkdir -p /home/nowluma/.local/share; printf saved > /home/nowluma/.config/QQ/ci-marker; printf saved > /home/nowluma/.local/share/ci-marker',
  );
  const machineIdHash = docker('exec', name, 'sha256sum', '/home/nowluma/.machine-id');
  stop();
  docker('start', name);
  await waitHealthy();
  await login();
  await checkDesktopAndHook();
  stop();
  docker('rm', name);
  start();
  await waitHealthy();
  await login();
  await checkDesktopAndHook();
  assert.equal(docker('exec', name, 'cat', '/home/nowluma/.config/QQ/ci-marker'), 'saved');
  assert.equal(docker('exec', name, 'cat', '/home/nowluma/.local/share/ci-marker'), 'saved');
  assert.equal(docker('exec', name, 'sha256sum', '/home/nowluma/.machine-id'), machineIdHash);
  assert.equal((await api('/api/system/settings')).settings.vncPort, 6123);
  console.log(
    'PASS: image startup, QQ native hook, desktop, config, complete HOME and machine ID across restart/recreation.',
  );
  console.log(
    'NOT_RUN: actual QQ account login and server-side session retention; no account was scanned into this test.',
  );
} catch (error) {
  console.error(error.message);
  try {
    console.error(docker('logs', '--tail', '150', name).replaceAll(password, '[redacted]'));
  } catch {
    /* preserve primary failure */
  }
  process.exitCode = 1;
} finally {
  try {
    docker('rm', '-f', name);
  } catch {
    /* it may already be absent */
  }
  for (const volume of volumes) {
    try {
      docker('volume', 'rm', volume);
    } catch {
      /* do not touch any non-test volume */
    }
  }
}
