import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checks } from './ci-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8').replace(/\r\n/g, '\n');

/** The lines of one top-level job, so a gate added to another job is not claimed. */
function jobBlock(name) {
  const lines = workflow.split('\n');
  const start = lines.findIndex((line) => line === `  ${name}:`);
  assert.ok(start >= 0, `ci.yml has no ${name} job`);
  const block = [];
  for (const line of lines.slice(start + 1)) {
    if (/^ {2}\S/.test(line)) break;
    block.push(line);
  }
  return block;
}

function normalize(command) {
  return command.replace(/\s+/g, ' ').trim();
}

test('ci-check runs every gate of the verify job', () => {
  const commands = new Set(checks.map(([, command]) => normalize(command)));
  for (const line of jobBlock('verify')) {
    const match = /^\s*(?:- )?run: (.+)$/.exec(line);
    if (!match) continue;
    const command = normalize(match[1]);
    assert.notEqual(command, '|', 'multi-line run steps need explicit handling in this test');
    assert.ok(commands.has(command), `ci.yml runs a gate ci-check does not: ${command}`);
  }
});

test('ci-check does not claim gates that the verify job no longer runs', () => {
  const commands = new Set(
    jobBlock('verify')
      .map((line) => /^\s*(?:- )?run: (.+)$/.exec(line)?.[1])
      .filter(Boolean)
      .map(normalize),
  );
  for (const [title, command] of checks) {
    assert.ok(commands.has(normalize(command)), `ci-check lists a gate ci.yml does not: ${title}`);
  }
});

test('every gate has one spelling', () => {
  const seen = new Set();
  for (const [title, command] of checks) {
    assert.equal(seen.has(normalize(command)), false, `duplicate gate: ${title}`);
    seen.add(normalize(command));
  }
});
