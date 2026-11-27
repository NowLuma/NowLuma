import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { checkUnselectedKernel } from './kernel-gate.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const image = process.argv[2] ?? 'nowluma:ci';
const name = `nowluma-smoke-${process.pid}`;
const volumes = ['config', 'data', 'logs', 'home'].map((part) => `${name}-${part}`);
const password = `Aa!${randomBytes(24).toString('base64url')}`;
const base = 'http://127.0.0.1:19099';
let token;
let desktopCookie = '';
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
    '-e',
    `NOWLUMA_WEBUI_BOOTSTRAP_PASSWORD=${password}`,
    '-e',
    'NOWLUMA_ACCEPT_EULA=1',
    '-e',
    'NOWLUMA_ACCEPT_PRIVACY=1',
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
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('nowluma_desktop_session='));
  if (cookie) desktopCookie = cookie.split(';', 1)[0];
  return response.json();
}
async function login() {
  const result = await api('/api/login', { password });
  assert.equal(result.success, true);
  assert.equal(typeof result.token, 'string');
  token = result.token;
}
async function checkAuthenticatedDesktop() {
  assert.equal((await fetch(`${base}/desktop/`)).status, 401);
  assert.equal((await fetch(`${base}/desktop/?token=${token}`)).status, 401);
  const response = await fetch(`${base}/desktop/`, { headers: { Cookie: desktopCookie } });
  assert.equal(response.status, 200);
  assert.equal(
    (await fetch(`${base}/desktop/vendor/core/rfb.js`, { headers: { Cookie: desktopCookie } }))
      .status,
    200,
  );
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/desktop/socket', {
    headers: { Cookie: desktopCookie, Origin: base },
  });
  ws.binaryType = 'arraybuffer';
  const messages = [];
  let receive;
  ws.addEventListener('message', ({ data }) => {
    const bytes = Buffer.from(data);
    if (receive) {
      const callback = receive;
      receive = undefined;
      callback(bytes);
    } else messages.push(bytes);
  });
  const next = () =>
    messages.length
      ? Promise.resolve(messages.shift())
      : new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('desktop RFB response timed out')),
            10_000,
          );
          receive = (data) => {
            clearTimeout(timer);
            resolve(data);
          };
        });
  try {
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener(
        'error',
        () => reject(new Error('authenticated desktop upgrade failed')),
        { once: true },
      );
    });
    const version = Buffer.from('RFB 003.008\n');
    assert.deepEqual(await next(), version);
    ws.send(version);
    assert.deepEqual(await next(), Buffer.from([1, 1]));
    ws.send(Buffer.from([1]));
    assert.deepEqual(await next(), Buffer.alloc(4));
    ws.send(Buffer.from([1]));
    const initialization = await next();
    assert.ok(initialization.length >= 24, 'actual VNC server initialization');
    assert.ok(initialization.readUInt16BE(0) > 0 && initialization.readUInt16BE(2) > 0);
  } finally {
    ws.close();
  }
}
async function checkDesktopAndKernelGate() {
  const system = await api('/api/system');
  assert.equal(system.hostname, 'nowluma');
  assert.equal(system.deployment.home, '/home/nowluma');
  assert.equal(system.deployment.uid, 1000);
  assert.equal(system.deployment.directories.qq, '/home/nowluma/.config/QQ');
  assert.equal(system.deployment.writable.qq, true);
  assert.equal(system.deployment.vncPort, 0);
  assert.equal(system.deployment.vncUrl, '/desktop/');
  docker('exec', '--user', '1000:1000', name, 'node', '/usr/local/lib/nowluma-healthcheck.cjs');
  const cjkFont = docker(
    'exec',
    '--user',
    '1000:1000',
    name,
    'fc-list',
    '-f',
    '%{file}\n',
    ':charset=4E2D',
  );
  const emojiFont = docker(
    'exec',
    '--user',
    '1000:1000',
    name,
    'fc-list',
    '-f',
    '%{file}\n',
    ':charset=1F600',
  );
  assert.ok(cjkFont, 'No installed font covers U+4E2D');
  assert.ok(emojiFont, 'No installed font covers U+1F600');
  await checkAuthenticatedDesktop();
  for (let attempt = 0; attempt < 60; attempt++) {
    const { list } = await api('/api/processes');
    assert.ok(Array.isArray(list));
    if (list.length > 0) {
      for (const process of list) await checkUnselectedKernel(api, process);
      return;
    }
    await delay(1000);
  }
  throw new Error('QQ started but native process discovery did not find it');
}
try {
  for (const volume of volumes) docker('volume', 'create', volume);
  start();
  await waitHealthy();
  await login();
  await checkDesktopAndKernelGate();
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
  await checkDesktopAndKernelGate();
  stop();
  docker('rm', name);
  start();
  await waitHealthy();
  await login();
  await checkDesktopAndKernelGate();
  assert.equal(docker('exec', name, 'cat', '/home/nowluma/.config/QQ/ci-marker'), 'saved');
  assert.equal(docker('exec', name, 'cat', '/home/nowluma/.local/share/ci-marker'), 'saved');
  assert.equal(docker('exec', name, 'sha256sum', '/home/nowluma/.machine-id'), machineIdHash);
  assert.equal((await api('/api/system/settings')).settings.vncPort, 6123);
  console.log(
    'PASS: image startup, native QQ discovery, account kernel gate, authenticated same-origin desktop, graceful stop, config, complete HOME and machine ID across restart/recreation.',
  );
  console.log(
    'NOT_RUN: QQ hook attachment, actual QQ account login and server-side session retention; this fresh HOME has no account or accepted kernel choice.',
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
