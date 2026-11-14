import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseRoot = path.resolve(process.argv[2] ?? path.join(root, 'dist'));
const output = path.resolve(process.argv[3] ?? path.join(root, '_re/releases/windows-exe'));
const project = path.join(root, 'deploy/windows');
assert.equal(process.platform, 'win32', 'Windows packaging must use a Windows build');
assert.equal(process.arch, 'x64', 'Windows x64 prebuilds are required');
assert.equal(process.versions.node, '24.22.1', 'Use the declared Node pin');
execFileSync(process.execPath, [path.join(root, 'tools/check-release-layout.mjs'), releaseRoot], {
  stdio: 'inherit',
});
const release = JSON.parse(fs.readFileSync(path.join(releaseRoot, 'release.json'), 'utf8'));
assert.equal(release.target, 'win32-x64');
const requireCore = createRequire(path.join(root, 'packages/core/package.json'));
const { zipSync, unzipSync } = requireCore('fflate');
const files = {};
function collect(directory, relative = '') {
  for (const entry of fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const name = relative + entry.name;
    const source = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(source, `${name}/`);
    else if (entry.isFile()) files[name] = fs.readFileSync(source);
    else throw new Error(`Unsupported release file: ${source}`);
  }
}
collect(releaseRoot);
files['node.exe'] = fs.readFileSync(process.execPath);
const nodeRoot = path.dirname(process.execPath);
files['licenses/Node-LICENSE.txt'] = fs.readFileSync(path.join(nodeRoot, 'LICENSE'));
const env = { ...process.env, DOTNET_CLI_UI_LANGUAGE: 'en-us' };
const info = execFileSync('dotnet', ['--info'], { encoding: 'utf8', env });
const sdk = /^\s*Base Path:\s*(.+)$/m.exec(info)?.[1]?.trim();
assert.ok(sdk, 'The .NET SDK must be available to build the self-contained launcher');
const dotnetRoot = path.resolve(sdk, '..', '..');
files['licenses/.NET-LICENSE.txt'] = fs.readFileSync(path.join(dotnetRoot, 'LICENSE.txt'));
files['licenses/.NET-ThirdPartyNotices.txt'] = fs.readFileSync(
  path.join(dotnetRoot, 'ThirdPartyNotices.txt'),
);
release.entries = [...new Set([...release.entries, 'licenses'])].sort();
files['release.json'] = Buffer.from(JSON.stringify(release, null, 2));
for (const name of Object.keys(files)) {
  assert.ok(
    !/^(?:config|data|logs)(?:\/|$)/.test(name),
    `Payload must not contain user data: ${name}`,
  );
}
const payload = Buffer.from(zipSync(files, { level: 6 }));
const reopened = unzipSync(payload);
assert.deepEqual(Buffer.from(reopened['node.exe']), files['node.exe']);
assert.equal(JSON.parse(Buffer.from(reopened['release.json']).toString()).target, 'win32-x64');
const hash = createHash('sha256').update(payload).digest('hex');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(project, 'payload.zip'), payload);
fs.writeFileSync(
  path.join(project, 'PayloadInfo.g.cs'),
  `internal static class PayloadInfo { public const string Version = ${JSON.stringify(release.version)}; public const string Sha256 = ${JSON.stringify(hash)}; }\n`,
);
execFileSync(
  'dotnet',
  [
    'publish',
    path.join(project, 'Nowluma.csproj'),
    '--configuration',
    'Release',
    '--output',
    output,
    `/p:Version=${release.version}`,
  ],
  { stdio: 'inherit', env },
);
const exe = path.join(output, 'Nowluma.exe');
assert.ok(fs.statSync(exe).isFile());
const executableHash = createHash('sha256').update(fs.readFileSync(exe)).digest('hex');
fs.writeFileSync(path.join(output, 'SHA256SUMS'), `${executableHash}  Nowluma.exe\n`);
fs.writeFileSync(
  path.join(output, 'build.json'),
  JSON.stringify(
    {
      version: release.version,
      target: 'win32-x64',
      node: process.versions.node,
      payloadSha256: hash,
      exeSha256: executableHash,
      signed: false,
    },
    null,
    2,
  ),
);
console.log(`Windows one-click executable: ${exe}`);
console.log(`SHA256: ${executableHash}`);
