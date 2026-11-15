import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkIdentity } from './check-identity.mjs';

const fullName = /借鉴了 \*\*([A-Za-z]+)\*\*/.exec(
  readFileSync(new URL('../README.md', import.meta.url), 'utf8'),
)[1];
const README = `# Nowluma\n\n> 项目设计借鉴了 **${fullName}** 的一些想法。\n`;

function options(overrides = {}) {
  return {
    readme: README,
    files: [],
    exists: () => true,
    readFile: () => Buffer.alloc(0),
    ...overrides,
  };
}

test('accepts the exact full-name README attribution', () => {
  assert.doesNotThrow(() => checkIdentity(options()));
});

test('rejects the old SL attribution and duplicate full-name mentions', () => {
  assert.throws(
    () =>
      checkIdentity(options({ readme: `# Nowluma\n\n> 基于 **${fullName}（SL）** 二次开发。\n` })),
    /agreed README attribution/,
  );
  assert.throws(
    () => checkIdentity(options({ readme: `${README}\n${fullName.toLowerCase()}\n` })),
    /exactly once/,
  );
  assert.throws(
    () => checkIdentity(options({ readme: '> 项目设计借鉴了 **SL** 的一些想法。' })),
    /agreed README attribution/,
  );
});

test('allows links to this repository', () => {
  assert.doesNotThrow(() =>
    checkIdentity(options({ readme: `${README}\nhttps://github.com/WSXYT/Nowluma\n` })),
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
