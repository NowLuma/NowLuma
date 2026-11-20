import assert from 'node:assert/strict';

/** A fresh smoke HOME has no account acceptance: discovery must never cause an attach. */
export async function checkUnselectedKernel(api, process) {
  const catalog = await api('/api/kernel/catalog');
  assert.equal(catalog.options.find((option) => option.id === 'compat')?.available, true);
  assert.equal(catalog.options.find((option) => option.id === 'rewrite')?.available, false);
  assert.ok(catalog.riskVersion && catalog.riskText, 'the choice must include its risk notice');
  assert.equal(process.injected, false, 'automatic discovery must wait for account acceptance');
  assert.equal(process.connected, false, 'an existing pipe must not bypass account acceptance');

  const result = await api(`/api/processes/${process.pid}/load`, {});
  assert.equal(result.success, false, 'manual load must also wait for account acceptance');
  assert.equal(result.process?.pid, process.pid);
  assert.equal(result.process?.injected, false);
  assert.equal(result.process?.connected, false);
  assert.match(result.process?.error ?? '', /内核选择待确认/);
}
