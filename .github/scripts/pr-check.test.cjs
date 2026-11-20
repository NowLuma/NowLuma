const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { REQUIRED_CHECKS, SECTIONS, TEMPLATE, bodyProblems, titleProblem } = require('./pr-check.cjs');

const validBody = [
  '## 关联 Issue',
  'Refs #12',
  '## 变更说明',
  '重写发行工作流，让 tag 只发布校验过的产物。',
  '## 验证',
  '- `pnpm typecheck`、`pnpm test`：通过',
  ...REQUIRED_CHECKS.map((label) => `- [x] ${label}`),
].join('\n');

test('accepts Conventional Commit titles', () => {
  for (const title of [
    'feat(webui): add demo console',
    'fix(deploy): preserve QQ home across container recreation',
    'docs: rewrite release process',
    'chore!: drop legacy promote workflow',
    'revert: feat(ci): pin action commits',
  ]) {
    assert.equal(titleProblem(title), null, title);
  }
});

test('rejects titles that are not Conventional Commits', () => {
  for (const title of [
    'Add demo console',
    'feat add demo console',
    'feat(WebUI): add demo console',
    'feature: add demo console',
    'feat(webui):',
    'feat(webui): ',
    '',
  ]) {
    assert.notEqual(titleProblem(title), null, title);
  }
});

test('accepts a filled-in template', () => {
  assert.deepEqual(bodyProblems(validBody), []);
});

test('reports every unchecked required item', () => {
  const body = validBody.replace(
    '- [x] `pnpm test` 通过，相关测试已补充或更新',
    '- [ ] `pnpm test` 通过，相关测试已补充或更新',
  );
  assert.deepEqual(bodyProblems(body), [
    'PR 检查项尚未勾选：`pnpm test` 通过，相关测试已补充或更新。',
  ]);
});

test('reports missing sections and missing items', () => {
  const problems = bodyProblems('## 变更说明\n\n做了一些事。\n');
  for (const heading of ['## 关联 Issue', '## 验证']) {
    assert.ok(
      problems.some((problem) => problem.includes(heading)),
      `${heading} must be reported`,
    );
  }
  for (const label of REQUIRED_CHECKS) {
    assert.ok(
      problems.some((problem) => problem.includes(label)),
      `${label} must be reported`,
    );
  }
});

test('ignores placeholder comments, so an unfilled template fails', () => {
  const problems = bodyProblems(fs.readFileSync(TEMPLATE, 'utf8'));
  assert.ok(problems.some((problem) => problem.includes('`## 变更说明`')));
  assert.ok(problems.some((problem) => problem.includes('`## 验证`')));
  assert.ok(problems.some((problem) => problem.includes('PR 检查项尚未勾选')));
});

test('requires a real verification record, not just checkboxes', () => {
  const body = validBody.replace('- `pnpm typecheck`、`pnpm test`：通过\n', '');
  assert.deepEqual(bodyProblems(body), ['`## 验证` 需要写下实际运行的命令与结果。']);
});

test('the committed template carries every required check', () => {
  const template = fs.readFileSync(TEMPLATE, 'utf8');
  for (const label of REQUIRED_CHECKS) {
    assert.ok(template.includes(`- [ ] ${label}`), `template is missing: ${label}`);
  }
  for (const heading of SECTIONS) {
    assert.ok(template.includes(heading), `template is missing: ${heading}`);
  }
});
