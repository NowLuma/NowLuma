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

/** Keep assertions about conditions and registry commands within their step. */
function step(text, name) {
  const heading = `      - name: ${name}\n`;
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `job must define the ${name} step`);
  return text.slice(start + heading.length).split(/\n {6}- /, 1)[0];
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
  assert.match(release, /^on:\n {2}push:\n {4}tags: \['v\*'\]\npermissions:/m);
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

test('Docker Hub is optional and receives only the checksum-verified GHCR digest', () => {
  const release = read('release.yml');
  const publish = job(release, 'publish');
  assert.match(publish, /^ {4}environment: dockerhub-release$/m);
  const config = step(publish, 'Check Docker Hub configuration');
  assert.match(config, /vars\.DOCKERHUB_USERNAME/);
  assert.match(config, /DOCKERHUB_TOKEN_CONFIGURED: \$\{\{ secrets\.DOCKERHUB_TOKEN != '' \}\}/);
  assert.doesNotMatch(release.slice(0, release.indexOf('\n  publish:')), /secrets\.DOCKERHUB_TOKEN/);
  assert.match(config, /-z "\$DOCKERHUB_USERNAME" && "\$DOCKERHUB_TOKEN_CONFIGURED" == 'false'[\s\S]*?enabled=false/);
  assert.match(config, /-z "\$DOCKERHUB_USERNAME" \|\| "\$DOCKERHUB_TOKEN_CONFIGURED" == 'false'[\s\S]*?exit 1/);
  assert.match(publish, /HUB_IMAGE: docker\.io\/wsxyt\/nowluma\n/);
  const docker = job(release, 'docker');
  assert.match(docker, /digest: \$\{\{ steps\.build\.outputs\.digest \}\}/);
  assert.match(docker, /platforms: linux\/amd64/);
  assert.match(
    step(publish, 'Resolve the verified GHCR image'),
    /IMAGE_DIGEST: \$\{\{ needs\.docker\.outputs\.digest \}\}[\s\S]*?cat "\$asset".*"\$IMAGE_DIGEST"/,
  );
  const checksums = publish.indexOf('sha256sum --check --strict SHA256SUMS');
  const digest = publish.indexOf('Resolve the verified GHCR image');
  const mirrored = publish.indexOf('Mirror and verify the public Docker Hub image');
  const published = publish.indexOf('Publish the verified release');
  assert.ok(checksums !== -1 && checksums < digest && digest < mirrored && mirrored < published);
  const mirror = step(publish, 'Mirror and verify the public Docker Hub image');
  assert.match(mirror, /if: steps\.hub\.outputs\.enabled == 'true'/);
  assert.match(mirror, /GHCR_IMAGE: \$\{\{ steps\.verified-image\.outputs\.name \}\}/);
  assert.match(mirror, /IMAGE_DIGEST: \$\{\{ steps\.verified-image\.outputs\.digest \}\}/);
  assert.match(
    mirror,
    /skopeo copy --all --preserve-digests[^\n]*\\\n\s*"docker:\/\/\$GHCR_IMAGE@\$IMAGE_DIGEST" "docker:\/\/\$HUB_IMAGE:\$RELEASE_VERSION"/,
  );
});

test('Docker Hub must be anonymously pullable on linux/amd64 before latest moves', () => {
  const mirror = step(job(read('release.yml'), 'publish'), 'Mirror and verify the public Docker Hub image');
  assert.match(mirror, /skopeo inspect --no-creds --raw "docker:\/\/\$HUB_IMAGE:\$1" \| sha256sum/);
  assert.match(
    mirror,
    /--override-os linux --override-arch amd64 copy --src-no-creds \\\n\s*"docker:\/\/\$HUB_IMAGE@\$IMAGE_DIGEST" "dir:\$registry\/pull"/,
  );
  const verified = mirror.indexOf('verify_tag "$RELEASE_VERSION"');
  const pull = mirror.indexOf('skopeo --override-os linux --override-arch amd64 copy --src-no-creds');
  const platform = mirror.indexOf('.os == "linux" and .architecture == "amd64"');
  const latest = mirror.indexOf('"docker://$HUB_IMAGE:latest"');
  assert.ok(verified !== -1 && verified < pull && pull < platform && platform < latest);
  assert.doesNotMatch(mirror, /RELEASE_PRERELEASE/);
  assert.match(
    mirror,
    /skopeo copy --all --preserve-digests[^\n]*\\\n\s*"docker:\/\/\$HUB_IMAGE@\$IMAGE_DIGEST" "docker:\/\/\$HUB_IMAGE:latest"\n\s+verify_tag latest/,
  );
  assert.equal(mirror.split('"docker://$HUB_IMAGE:latest"').length, 2);
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
