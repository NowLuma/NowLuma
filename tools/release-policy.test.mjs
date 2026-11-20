import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowDir = path.join(root, '.github/workflows');
const read = (name) => fs.readFileSync(path.join(workflowDir, name), 'utf8').replace(/\r\n/g, '\n');
const names = fs.readdirSync(workflowDir).filter((name) => name.endsWith('.yml'));

/** The body of a job block, so assertions cannot accidentally match a sibling job. */
function job(text, name) {
  const match = new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z][a-z-]*:\\n|$)`).exec(text);
  assert.ok(match, `workflow must define the ${name} job`);
  return match[1];
}

test('no workflow runs fork code with a write token', () => {
  for (const name of names) {
    const text = read(name);
    assert.equal(
      /pull_request_target/.test(text),
      false,
      `${name} must not use pull_request_target`,
    );
    if (/^ {2}pull_request:/m.test(text)) {
      assert.match(
        text,
        /permissions:\n {2}contents: read/,
        `${name} must keep pull_request runs read-only`,
      );
    }
  }
});

test('every action is pinned to a commit', () => {
  for (const name of names) {
    for (const match of read(name).matchAll(/uses: (\S+)/g)) {
      const reference = match[1];
      if (reference.startsWith('./')) continue;
      assert.match(reference, /@[0-9a-f]{40}$/, `${name} must pin ${reference} to a commit`);
    }
  }
});

test('the pull request check runs trusted base code with the title and body as data', () => {
  const pr = read('pr.yml');
  assert.match(pr, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(pr, /persist-credentials: false/);
  assert.match(pr, /PR_TITLE: \$\{\{ github\.event\.pull_request\.title \}\}/);
  assert.match(pr, /PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}/);
  assert.equal(/pnpm install/.test(pr), false, 'the PR check must not execute fork code');
});

test('the release workflow only runs for version tags', () => {
  const release = read('release.yml');
  assert.match(release, /on:\n {2}push:\n {4}tags: \['v\*'\]/);
  assert.equal(/branches:/.test(release), false);
});

test('a release stays private until every artifact and checksum verifies', () => {
  const release = read('release.yml');
  assert.match(release, /--verify-tag/);
  assert.match(release, /needs: \[draft, linux, windows, docker\]/);
  assert.match(release, /sha256sum --check --strict SHA256SUMS/);
  assert.match(release, /--draft=false/);
  assert.match(release, /uses: \.\/\.github\/workflows\/ci\.yml/);
});

test('the reusable validation workflow is read-only and runs the container smoke', () => {
  const ci = read('ci.yml');
  assert.match(ci, /workflow_call:/);
  assert.match(ci, /permissions:\n {2}contents: read/);
  assert.match(ci, /tags-ignore: \['\*\*'\]/);
  assert.match(ci, /node deploy\/docker\/smoke\.mjs/);
});

test('the publish job resolves the repository without a checkout', () => {
  const publish = job(read('release.yml'), 'publish');
  assert.equal(/uses: actions\/checkout/.test(publish), false, 'publish runs outside a checkout');
  assert.match(publish, /^ {4}env:\n {6}GH_REPO: \$\{\{ github\.repository \}\}$/m);
});

test('a stable image is promoted to :latest only after the checksums verify', () => {
  const release = read('release.yml');
  const docker = job(release, 'docker');
  assert.equal(
    /printf '%s:latest/.test(docker),
    false,
    'the docker job must not move the mutable tag',
  );

  const publish = job(release, 'publish');
  assert.match(publish, /packages: write/);
  assert.match(publish, /if: needs\.draft\.outputs\.prerelease == 'false'/);
  const verified = publish.indexOf('sha256sum --check --strict SHA256SUMS');
  const promoted = publish.indexOf('imagetools create --tag "$image:latest"');
  assert.ok(
    verified !== -1 && promoted !== -1,
    'publish must verify checksums and promote the digest',
  );
  assert.ok(verified < promoted, 'the mutable tag is promoted only after verification');
});

test('platform archives retain the runtime updater names and the GPL linking notice', () => {
  const release = read('release.yml');
  assert.match(release, /Nowluma-v\$version-linux-x64-lite\.tar\.gz/);
  assert.match(release, /Nowluma-v\$version-win-x64-lite\.zip/);
  assert.match(release, /cp "_re\/releases\/windows-exe\/Nowluma-v\$version-win-x64-lite\.zip"/);
  const documents = fs.readFileSync(
    path.join(root, 'packages/common/src/release-assets.ts'),
    'utf8',
  );
  assert.match(documents, /'LICENSING\.md'/);
});

test('the local release driver targets main and the release workflow', () => {
  const driver = fs.readFileSync(path.join(root, 'tools/release.mjs'), 'utf8');
  assert.match(driver, /origin\/main/);
  assert.match(driver, /workflow=release\.yml/);
  assert.equal(/promote-dev-to-main/.test(driver), false);
  assert.equal(/refs\/heads\/dev\b/.test(driver), false);
});
