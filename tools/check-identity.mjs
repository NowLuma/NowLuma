import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const binaryFile =
  /\.(?:png|jpe?g|gif|webp|ico|bmp|avif|node|dll|so|dylib|exe|zip|gz|tgz|tar|7z|ttf|otf|woff2?|pdf|db|sqlite3?|bin|class|jar|wasm)$/i;

// The agreed footer is the only allowed full-name occurrence. The checker
// derives the name from that line so the old brand is never hardcoded here.
const footerAttribution = /^本项目参考了 \*\*([A-Za-z]{3,})\*\* 的实现思路。$/;

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

function lastNonEmptyLine(text) {
  const lines = text.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trim() !== '') return lines[index].trim();
  }
  return '';
}

export function checkIdentity({
  readme = readFileSync('README.md', 'utf8'),
  files = gitFiles(),
  exists = existsSync,
  readFile = (file) => readFileSync(file),
} = {}) {
  const footer = footerAttribution.exec(lastNonEmptyLine(readme));
  assert.ok(footer, 'expected the agreed README footer attribution using the full name');
  const previousIdentity = footer[1];
  const oldName = new RegExp(previousIdentity, 'i');
  assert.equal(
    (readme.match(new RegExp(previousIdentity, 'gi')) ?? []).length,
    1,
    'README must mention the full name exactly once',
  );

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const forbidden = [];
  for (const file of new Set(files)) {
    if (!exists(file)) continue;
    if (oldName.test(file)) forbidden.push(`${file}: old file name`);
    if (file === 'README.md' || binaryFile.test(file)) continue;
    let text;
    try {
      text = decoder.decode(readFile(file));
    } catch {
      continue;
    }
    if (nativeAbiFiles.has(file)) {
      const prefix = previousIdentity.toLowerCase();
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
    'Identity checked: the footer is the sole full-name attribution; native byte contents and documented socket ABI remain unchanged.',
  );
}
