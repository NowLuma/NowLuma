import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const expectedIdentity = ['Snow', 'Luma'].join('');
const ATTRIBUTION = `> 项目设计借鉴了 **${expectedIdentity}** 的一些想法。`;
const oldName = new RegExp(expectedIdentity, 'i');
const binaryFile =
  /\.(?:png|jpe?g|gif|webp|ico|bmp|avif|node|dll|so|dylib|exe|zip|gz|tgz|tar|7z|ttf|otf|woff2?|pdf|db|sqlite3?|bin|class|jar|wasm)$/i;

// Unchanged prebuilds still own these native fallback socket-directory names.
const nativeAbiFiles = new Set([
  'packages/bridge/src/hook-runtime-dir.ts',
  'packages/bridge/tests/hook-runtime-dir.test.ts',
]);

function gitFiles() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
}

export function checkIdentity({
  readme = readFileSync('README.md', 'utf8'),
  files = gitFiles(),
  exists = existsSync,
  readFile = (file) => readFileSync(file),
} = {}) {
  const attribution = /^> 项目设计借鉴了 \*\*([A-Za-z]+)\*\* 的一些想法。$/m.exec(readme);
  assert.ok(attribution, 'expected the agreed README attribution');
  assert.equal(attribution[1], expectedIdentity, 'README attribution must use the full name');
  assert.equal(
    (readme.match(new RegExp(expectedIdentity, 'g')) ?? []).length,
    1,
    `README must mention ${expectedIdentity} exactly once, using the full name`,
  );
  assert.ok(!readme.includes('github.com/'), 'README must not reintroduce the upstream URL');

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const forbidden = [];
  for (const file of new Set(files)) {
    if (file === 'README.md' || binaryFile.test(file) || !exists(file)) continue;
    let text;
    try {
      text = decoder.decode(readFile(file));
    } catch {
      continue;
    }
    if (nativeAbiFiles.has(file)) {
      const prefix = expectedIdentity.toLowerCase();
      text = text.replaceAll(`/tmp/${prefix}-`, '').replaceAll(`${prefix}-hook`, '');
    }
    if (oldName.test(text)) forbidden.push(`${file}: old text identity`);
  }
  assert.deepEqual(forbidden, []);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  checkIdentity();
  console.log(
    'Identity checked: exactly one full-name README attribution; native byte contents and documented socket ABI remain unchanged.',
  );
}
