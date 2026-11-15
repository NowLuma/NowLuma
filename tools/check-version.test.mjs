import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkVersions, parseVersion, releaseNotes, workspaceVersions } from './check-version.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fixture({ version = '2.5.0-rc.1', packages = {}, changelog = `# 更新记录\n\n## ${version}\n\n### 更新\n\n- 新增发行流程。\n` } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nowluma-version-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version }));
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), changelog);
  fs.mkdirSync(path.join(root, 'packages'));
  for (const [name, value] of Object.entries({ core: version, ...packages })) {
    fs.mkdirSync(path.join(root, 'packages', name));
    fs.writeFileSync(path.join(root, 'packages', name, 'package.json'), JSON.stringify({ version: value }));
  }
  return root;
}

test('parses canonical SemVer only', () => {
  for (const value of ['2.4.2', '2.5.0-rc.1', '0.0.0', '2.5.0-rc.1+build.7']) {
    assert.equal(parseVersion(value), value);
  }
  for (const value of ['v2.4.2', '2.4', '2.4.2.0', '02.4.2', '', null, undefined, 242]) {
    assert.equal(parseVersion(value), null);
  }
});

test('reads the root and every workspace package version', () => {
  const versions = workspaceVersions(fixture({ packages: { webui: '2.5.0-rc.1' } }));
  assert.deepEqual([...versions.keys()].sort(), ['package.json', 'packages/core/package.json', 'packages/webui/package.json']);
  assert.deepEqual([...new Set(versions.values())], ['2.5.0-rc.1']);
});

test('accepts a matching tag and consistent workspace', () => {
  assert.deepEqual(checkVersions({ root: fixture(), tag: 'v2.5.0-rc.1' }), {
    version: '2.5.0-rc.1',
    problems: [],
  });
});

test('rejects a tag that does not match the package version', () => {
  const { problems } = checkVersions({ root: fixture(), tag: 'v2.5.0' });
  assert.deepEqual(problems, ['tag "v2.5.0" does not match package version "2.5.0-rc.1"']);
});

test('rejects a partial bump', () => {
  const { problems } = checkVersions({ root: fixture({ packages: { onebot: '2.4.2' } }) });
  assert.deepEqual(problems, ['packages/onebot/package.json is 2.4.2, expected 2.5.0-rc.1']);
});

test('rejects a non-canonical root version', () => {
  const { problems } = checkVersions({ root: fixture({ version: '2.5' }) });
  assert.deepEqual(problems, ['package.json version "2.5" is not canonical SemVer']);
});

test('extracts exactly the requested changelog section', () => {
  const changelog = [
    '# 更新记录',
    '',
    '## 2.5.0',
    '',
    '- 稳定版说明。',
    '',
    '## 2.5.0-rc.1',
    '',
    '### 升级',
    '',
    '- 预览版说明。',
    '',
    '## 2.4.2',
    '',
    '- 旧版本。',
  ].join('\n');
  assert.equal(releaseNotes(changelog, '2.5.0-rc.1'), '### 升级\n\n- 预览版说明。');
  assert.equal(releaseNotes(changelog, '2.5.0'), '- 稳定版说明。');
  assert.equal(releaseNotes(changelog, '3.0.0'), null);
  assert.equal(releaseNotes('## 2.5.0-rc.1\n\n## 2.4.2\n\n- 旧版本。', '2.5.0-rc.1'), null);
});

test('the CLI fails a mismatched tag without writing release notes', () => {
  const notes = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nowluma-notes-')), 'notes.md');
  assert.throws(
    () =>
      execFileSync(process.execPath, [path.join(repoRoot, 'tools/check-version.mjs'), '--tag', 'v0.0.1', '--notes', notes], {
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    (error) => error.status === 1 && /tag "v0\.0\.1" does not match package version/.test(error.stderr),
  );
  assert.equal(fs.existsSync(notes), false);
});
