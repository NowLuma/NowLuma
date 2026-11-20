import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkUnselectedKernel } from './kernel-gate.mjs';

const process = { pid: 4242, injected: false, connected: false };
const catalog = {
  options: [
    { id: 'compat', available: true },
    { id: 'rewrite', available: false },
  ],
  riskVersion: 'fixture-risk-1',
  riskText: 'Fixture notice',
};
const blocked = {
  success: false,
  process: { ...process, error: '内核选择待确认：尚未识别账号' },
};

function fixture(result = blocked) {
  const calls = [];
  return {
    calls,
    api: async (route, body) => {
      calls.push({ route, body });
      return route === '/api/kernel/catalog' ? catalog : result;
    },
  };
}

test('the smoke checks both discovery and a real manual load attempt without creating consent', async () => {
  const { api, calls } = fixture();
  await checkUnselectedKernel(api, process);
  assert.deepEqual(calls, [
    { route: '/api/kernel/catalog', body: undefined },
    { route: '/api/processes/4242/load', body: {} },
  ]);
});

test('the smoke rejects automatic attach before acceptance', async () => {
  const { api, calls } = fixture();
  await assert.rejects(
    checkUnselectedKernel(api, { ...process, injected: true }),
    /automatic discovery/,
  );
  assert.equal(calls.length, 1, 'manual load must not hide a discovery violation');
});

test('the smoke rejects manual attach and unrelated failures as evidence of a working gate', async () => {
  await assert.rejects(
    checkUnselectedKernel(
      fixture({ success: true, process: { ...process, injected: true } }).api,
      process,
    ),
    /manual load/,
  );
  await assert.rejects(
    checkUnselectedKernel(
      fixture({ ...blocked, process: { ...process, error: 'native crash' } }).api,
      process,
    ),
    /内核选择待确认/,
  );
});
