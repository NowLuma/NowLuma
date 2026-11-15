import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkIdentity } from './check-identity.mjs';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const footer = readme
  .split(/\r?\n/)
  .filter((line) => line.trim() !== '')
  .at(-1);
const fullName = /^本项目参考了 \*\*([A-Za-z]{3,})\*\* 的实现思路。$/.exec(footer)[1];
const README = `# Nowluma\n\n一段说明。\n\n${footer}\n`;

function options(overrides = {}) {
  return {
    readme: README,
    files: [],
    exists: () => true,
    readFile: () => Buffer.alloc(0),
    ...overrides,
  };
}

test('accepts the exact footer as the last non-empty line', () => {
  assert.doesNotThrow(() => checkIdentity(options()));
  assert.doesNotThrow(() => checkIdentity(options({ readme: `${README}\n\n` })));
});

test('rejects a missing, non-final or non-footer attribution', () => {
  assert.throws(
    () => checkIdentity(options({ readme: '# Nowluma\n\n一段说明。\n' })),
    /agreed README footer attribution/,
  );
  assert.throws(
    () => checkIdentity(options({ readme: `${README}\n后记\n` })),
    /agreed README footer attribution/,
  );
  assert.throws(
    () =>
      checkIdentity(
        options({
          readme: `# Nowluma\n\n> 项目设计借鉴了 **${fullName}** 的一些想法。\n`,
        }),
      ),
    /agreed README footer attribution/,
  );
});

test('rejects duplicate full-name mentions anywhere in the README', () => {
  assert.throws(
    () => checkIdentity(options({ readme: `# ${fullName}\n\n${README}` })),
    /exactly once/,
  );
});

test('allows links to this repository', () => {
  assert.doesNotThrow(() =>
    checkIdentity(
      options({
        readme: `# Nowluma\n\nhttps://github.com/WSXYT/Nowluma\n\n${footer}\n`,
      }),
    ),
  );
  assert.doesNotThrow(() =>
    checkIdentity(
      options({
        files: ['docs/own.md'],
        readFile: () => Buffer.from('https://github.com/WSXYT/Nowluma'),
      }),
    ),
  );
});

test('rejects old filenames without reading native bytes', () => {
  assert.throws(
    () =>
      checkIdentity(
        options({
          files: [`packages/runtime/native/${fullName.toLowerCase()}.node`],
          readFile: () => {
            throw new Error('native bytes must not be read');
          },
        }),
      ),
    /old file name/,
  );
});

test('rejects the old identity in tracked text files', () => {
  assert.throws(
    () => checkIdentity(options({ files: ['docs/old.md'], readFile: () => Buffer.from(fullName) })),
    /old text identity/,
  );
});

test('allows the documented native socket ABI exception only', () => {
  assert.doesNotThrow(() =>
    checkIdentity(
      options({
        files: ['packages/bridge/src/hook-runtime-dir.ts'],
        readFile: () => Buffer.from(`return "/tmp/${fullName.toLowerCase()}-1000";`),
      }),
    ),
  );
  assert.doesNotThrow(() =>
    checkIdentity(
      options({
        files: ['packages/bridge/tests/hook-runtime-dir.test.ts'],
        readFile: () => Buffer.from(`'${fullName.toLowerCase()}-hook'`),
      }),
    ),
  );
  assert.throws(
    () =>
      checkIdentity(
        options({
          files: ['packages/bridge/src/other.ts'],
          readFile: () => Buffer.from(`${fullName.toLowerCase()}-hook`),
        }),
      ),
    /old text identity/,
  );
});

test('skips binary files without inspecting their contents', () => {
  assert.doesNotThrow(() =>
    checkIdentity(
      options({
        files: ['assets/brand/old.png'],
        readFile: () => {
          throw new Error('binary file must not be read');
        },
      }),
    ),
  );
});
