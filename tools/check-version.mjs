#!/usr/bin/env node
// Release preflight: the tag, the workspace versions and the changelog must agree.
//
//   node tools/check-version.mjs                       # local check, no tag
//   node tools/check-version.mjs --tag v2.4.2           # what release.yml does
//   node tools/check-version.mjs --tag v2.4.2 --notes release-notes.md
//
// Dependency-free on purpose: the release workflow runs this before installing
// the workspace, so it only reads package.json files and CHANGELOG.md.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// One spelling with packages/common/src/semver.ts: canonical SemVer only, so
// `v2.4` or `2.4.2.0` never reach a tag.
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseVersion(value) {
  return typeof value === 'string' && SEMVER.test(value) ? value : null;
}

/** Versions of the root and every workspace package; `packages/*` mirrors tools/bump-version.mjs. */
export function workspaceVersions(root) {
  const versions = new Map();
  const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8')).version;
  versions.set('package.json', read(path.join(root, 'package.json')));
  for (const entry of fs.readdirSync(path.join(root, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, 'packages', entry.name, 'package.json');
    if (fs.existsSync(file)) versions.set(`packages/${entry.name}/package.json`, read(file));
  }
  return versions;
}

/** Problems that must block a release; an empty array means the tag may ship. */
export function checkVersions({ root, tag = null }) {
  const problems = [];
  const versions = workspaceVersions(root);
  const version = versions.get('package.json');

  if (!parseVersion(version)) {
    problems.push(`package.json version "${version}" is not canonical SemVer`);
    return { version, problems };
  }
  for (const [file, value] of versions) {
    if (value !== version) problems.push(`${file} is ${value}, expected ${version}`);
  }
  if (tag !== null && tag !== `v${version}`) {
    problems.push(`tag "${tag}" does not match package version "${version}"`);
  }
  return { version, problems };
}

/** The `## <version>` section of CHANGELOG.md, or null when it is missing or empty. */
export function releaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) return null;
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##[^#]/.test(line.trim())) break;
    body.push(line);
  }
  const notes = body.join('\n').trim();
  return notes || null;
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? null : (args[index + 1] ?? null);
  };
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const tagFlag = flag('--tag');
  const tag = tagFlag ?? (process.env.GITHUB_REF_NAME?.startsWith('v') ? process.env.GITHUB_REF_NAME : null);
  const notesPath = flag('--notes');
  const { version, problems } = checkVersions({ root, tag });
  const notes = problems.length === 0 ? releaseNotes(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version) : null;

  if (problems.length === 0 && !notes) {
    problems.push(`CHANGELOG.md has no non-empty "## ${version}" section`);
  }
  if (problems.length > 0) {
    console.error(`Release version check failed for ${tag ?? version}:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  if (notesPath) {
    fs.writeFileSync(notesPath, `${notes}\n`);
    console.log(`Release notes written to ${notesPath}`);
  }
  console.log(`Version check passed: ${version}${tag ? ` (${tag})` : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
