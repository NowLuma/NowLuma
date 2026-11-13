'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { once } = require('node:events');
const { checkPort } = require('./healthcheck.cjs');

test('health check confirms an actual listener and rejects a stopped listener', async () => {
  const server = net.createServer((socket) => socket.destroy());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await checkPort(port);
  await new Promise((resolve) => server.close(resolve));
  await assert.rejects(checkPort(port));
});
