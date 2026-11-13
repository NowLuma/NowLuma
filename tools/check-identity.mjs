import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

// The introduction is the sole source of the original project identity.
const readme = readFileSync('README.md', 'utf8');
const attribution = /^> 基于 \*\*([A-Za-z]+)（SL）\*\* 二次开发。$/m.exec(readme);
assert.ok(attribution, 'expected the agreed README attribution');
const previousIdentity = attribution[1];
const oldName = new RegExp(previousIdentity, 'i');
assert.equal((readme.match(new RegExp(previousIdentity, 'gi')) ?? []).length, 1);
assert.ok(!readme.includes('github.com/'));

// Unchanged prebuilds still own these native fallback socket-directory names.
const nativeAbiFiles = new Set([
  'packages/bridge/src/hook-runtime-dir.ts',
  'packages/bridge/tests/hook-runtime-dir.test.ts',
]);
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const decoder = new TextDecoder('utf-8', { fatal: true });
const forbidden = [];
for (const file of new Set(files)) {
  if (!existsSync(file)) continue;
  if (oldName.test(file)) forbidden.push(`${file}: old file name`);
  let text;
  try {
    text = decoder.decode(readFileSync(file));
  } catch {
    continue;
  }
  if (file === 'README.md') continue;
  if (nativeAbiFiles.has(file)) {
    const prefix = previousIdentity.toLowerCase();
    text = text.replaceAll(`/tmp/${prefix}-`, '').replaceAll(`${prefix}-hook`, '');
  }
  if (oldName.test(text)) forbidden.push(`${file}: old text identity`);
}
assert.deepEqual(forbidden, []);
console.log(
  'Identity checked: README attribution only; native byte contents and documented socket ABI remain unchanged.',
);
