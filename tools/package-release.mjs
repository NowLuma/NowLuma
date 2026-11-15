#!/usr/bin/env node
// Package the built `dist/` release layout into the archive a GitHub Release ships.
//
//   node tools/package-release.mjs [dist] [out]
//
// The archive must reopen with its own release.json manifest, keep the legal
// documents the WebUI consent gate serves, and carry no user data. Windows
// releases are the one-click exe from tools/build-windows-exe.mjs instead.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(process.argv[2] ?? path.join(root, 'dist'));
const output = path.resolve(process.argv[3] ?? path.join(root, '_re/releases/linux-x64'));
// `tar` is already a @nowluma/core dependency; never add an archive dependency.
const tar = createRequire(path.join(root, 'packages/core/package.json'))('tar');
const agreementFiles = ['LICENSE', 'EULA.md', 'PRIVACY.md'];

const release = JSON.parse(fs.readFileSync(path.join(dist, 'release.json'), 'utf8'));
assert.equal(release.target, 'linux-x64', 'Linux packages come from a linux-x64 build');
assert.match(release.version, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/, 'release.json version must be canonical SemVer');
for (const file of [...agreementFiles, 'package.json', 'index.mjs']) {
  assert.ok(fs.statSync(path.join(dist, file), { throwIfNoEntry: false })?.isFile(), `release is missing ${file}`);
}

function topLevelNames(names) {
  return [...new Set(names.map((name) => name.replace(/^\.\//, '').split('/')[0]))]
    .filter((name) => name && !['node', 'node.exe'].includes(name))
    .sort();
}

async function archiveNames(file) {
  const names = [];
  await tar.list({ file, onReadEntry: (entry) => names.push(entry.path) });
  return names;
}

const archive = path.join(output, `nowluma-${release.target}-${release.version}.tar.gz`);
fs.mkdirSync(output, { recursive: true });
await tar.create({ gzip: true, file: archive, cwd: dist, portable: true }, ['.']);

const packed = await archiveNames(archive);
for (const name of packed) {
  assert.ok(!/^\.?\/(?:config|data|logs)(?:\/|$)/.test(name), `archive must not contain user data: ${name}`);
}
for (const file of agreementFiles) {
  assert.ok(packed.includes(`./${file}`), `archive is missing legal document ${file}`);
}
assert.deepEqual(
  JSON.stringify(topLevelNames(packed)),
  JSON.stringify([...release.entries].sort()),
  'archive entries do not match the release.json manifest',
);

// Reopen the archive: the shipped manifest must describe the shipped files.
const reopened = fs.mkdtempSync(path.join(os.tmpdir(), 'nowluma-release-'));
try {
  await tar.extract({ file: archive, cwd: reopened });
  const manifest = JSON.parse(fs.readFileSync(path.join(reopened, 'release.json'), 'utf8'));
  assert.equal(manifest.version, release.version);
  assert.equal(manifest.target, release.target);
  for (const file of agreementFiles) {
    assert.ok(fs.statSync(path.join(reopened, file), { throwIfNoEntry: false })?.isFile(), `reopened archive is missing ${file}`);
  }
} finally {
  fs.rmSync(reopened, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

const sha256 = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
console.log(`Linux release package: ${archive}`);
console.log(`SHA256: ${sha256}`);
