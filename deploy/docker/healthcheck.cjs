'use strict';

const fs = require('node:fs');
const net = require('node:net');

function checkPort(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(3000);
    socket.once('connect', () => { socket.destroy(); resolve(); });
    socket.once('timeout', () => { socket.destroy(); reject(new Error(`port ${port} timed out`)); });
    socket.once('error', reject);
  });
}

async function check() {
  const pid = fs.readFileSync('/tmp/nowluma-runtime/qq.pid', 'utf8').trim();
  if (!/^\d+$/.test(pid) || Number(pid) <= 0) throw new Error('invalid QQ PID');
  process.kill(Number(pid), 0);
  await checkPort(5900);
  const response = await fetch('http://127.0.0.1:5099/robots.txt', {
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`WebUI HTTP ${response.status}`);
}

if (require.main === module) {
  check().catch((error) => {
    console.error(`[Nowluma] health check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
module.exports = { checkPort, check };
