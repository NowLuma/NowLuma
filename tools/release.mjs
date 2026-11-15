#!/usr/bin/env node
// Cut and watch a release from `main`.
//
//   pnpm release 2.5.0             # guard, validate, tag, push, verify the release
//   pnpm release 2.5.0 --no-wait   # stop after the tag push
//   pnpm release 2.5.0 --dry-run   # print the plan; no git or network writes
//
// The version, every packages/*/package.json and the CHANGELOG.md section must
// already be committed on `main`. tools/check-version.mjs is the same guard
// `.github/workflows/release.yml` runs, so a tag that would fail there fails
// here before anything is pushed. The tag triggers that workflow, which
// rebuilds the ci.yml gates, stages every artifact in a draft release, verifies
// its own SHA256SUMS and only then publishes. An existing tag is never moved;
// re-run the same command to resume watching a pushed tag.

import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVersion } from './check-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const version = argv.find((argument) => !argument.startsWith('--'));
const dryRun = argv.includes('--dry-run');
const noWait = argv.includes('--no-wait');

if (!version) {
  console.error('Usage: pnpm release <version> [--no-wait] [--dry-run]');
  console.error('Example: pnpm release 2.5.0');
  process.exit(1);
}
if (!parseVersion(version)) {
  console.error(`Invalid SemVer: "${version}"`);
  console.error('Usage: pnpm release <version> [--no-wait] [--dry-run]');
  process.exit(1);
}
const tag = `v${version}`;

function ok(message) {
  console.log(`\x1b[32m✓\x1b[0m ${message}`);
}
function info(message) {
  console.log(`\x1b[36mi\x1b[0m ${message}`);
}
function warn(message) {
  console.log(`\x1b[33m!\x1b[0m ${message}`);
}
function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Read-only git; safe in a dry run. */
function read(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

/** Mutating git; only reached outside a dry run. */
function git(...args) {
  execFileSync('git', args, { cwd: root, stdio: 'inherit' });
}

/** A tool whose failure keeps its exit status, without a Node stack trace. */
function tool(script, ...args) {
  console.log(`\n$ node tools/${script} ${args.join(' ')}`.trimEnd());
  const result = spawnSync(process.execPath, [path.join(root, 'tools', script), ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function tagSha(ref) {
  try {
    return read('rev-parse', '-q', '--verify', `${ref}^{commit}`);
  } catch {
    return null;
  }
}

function remoteTagSha() {
  const output = read('ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`);
  const lines = output.split('\n').filter(Boolean);
  const peeled = lines.find((line) => line.endsWith('^{}'));
  return (peeled ?? lines[0])?.split(/\s+/)[0] ?? null;
}

function preflight() {
  const branch = read('rev-parse', '--abbrev-ref', 'HEAD');
  const dirty = read('status', '--porcelain');
  const head = read('rev-parse', 'HEAD');

  const wrongBranch = `release tags are cut from main; current branch is "${branch}"`;
  const dirtyTree = `working tree is not clean:\n${dirty}`;
  if (branch !== 'main') {
    if (dryRun) warn(wrongBranch);
    else fail(wrongBranch);
  }
  if (dirty) {
    if (dryRun) warn(dirtyTree);
    else fail(dirtyTree);
  }

  if (!dryRun) {
    git('fetch', 'origin', 'main');
    const originMain = read('rev-parse', 'origin/main');
    if (head !== originMain) {
      fail(`HEAD ${head.slice(0, 12)} is not origin/main ${originMain.slice(0, 12)}; merge and pull first`);
    }
    if (!noWait) {
      try {
        execFileSync('gh', ['--version'], { stdio: 'ignore' });
      } catch {
        fail('gh is required to watch the release workflow; install it or pass --no-wait');
      }
    }
  }
  return head;
}

function printPlan() {
  info(`plan for ${tag}:`);
  console.log(`  1. node tools/check-version.mjs --tag ${tag}`);
  console.log('  2. node tools/ci-check.mjs');
  console.log(`  3. git tag ${tag} <main> && git push origin refs/tags/${tag}`);
  if (noWait) {
    console.log('  4. stop after the push (--no-wait)');
  } else {
    console.log('  4. wait for the release workflow, then require a published (not draft) release with SHA256SUMS');
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function releaseRun(sha) {
  const runs = JSON.parse(
    execFileSync(
      'gh',
      ['run', 'list', '--workflow=release.yml', '--limit', '30', '--json', 'headSha,status,conclusion,url'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  );
  return runs.find((run) => run.headSha === sha) ?? null;
}

async function waitForRelease(sha) {
  info(`waiting for the release workflow to publish ${tag}; Ctrl-C stops watching, the tag stays`);
  const deadline = Date.now() + 120 * 60 * 1000;
  let last = null;

  while (Date.now() < deadline) {
    let run;
    try {
      run = releaseRun(sha);
    } catch (error) {
      fail(`gh run list failed: ${error.stderr?.toString().trim() || error.message}`);
    }
    if (run) {
      last = run;
      if (run.status === 'completed') {
        if (run.conclusion !== 'success') fail(`release workflow ${run.conclusion}: ${run.url}`);
        const release = JSON.parse(
          execFileSync('gh', ['release', 'view', tag, '--json', 'isDraft,url,assets'], {
            cwd: root,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          }),
        );
        if (release.isDraft) fail(`release ${tag} is still a draft after a successful workflow: ${release.url}`);
        if (!release.assets.some((asset) => asset.name === 'SHA256SUMS')) {
          fail(`published release ${tag} has no SHA256SUMS asset: ${release.url}`);
        }
        ok(`published ${tag}: ${release.url}`);
        return;
      }
    }
    await sleep(30_000);
  }
  fail(
    `timed out after 120 minutes waiting for the release workflow` +
      `${last ? ` (last status: ${last.status})` : ''}; see gh run list --workflow=release.yml`,
  );
}

const head = preflight();
printPlan();

const local = tagSha(tag);
if (local && local !== head) {
  const message = `local tag ${tag} points at ${local.slice(0, 12)}, not HEAD ${head.slice(0, 12)}; tags are never moved`;
  if (dryRun) warn(message);
  else fail(message);
}

if (dryRun) {
  console.log('[dry-run] would run node tools/ci-check.mjs');
  console.log(`[dry-run] would ${local ? 'reuse' : 'create'} tag ${tag} at ${head.slice(0, 12)} and push it to origin`);
  console.log(
    noWait
      ? '[dry-run] would stop after the push (--no-wait)'
      : '[dry-run] would wait for the release workflow and verify the published release',
  );
}

// The version guard only reads package.json files and CHANGELOG.md, so a dry
// run reports the real answer without touching anything.
tool('check-version.mjs', '--tag', tag);

if (dryRun) process.exit(0);

tool('ci-check.mjs');
ok('local checks passed');

const remote = remoteTagSha();
if (remote && remote !== head) {
  fail(`origin already has ${tag} at ${remote.slice(0, 12)}, not HEAD ${head.slice(0, 12)}; tags are never moved`);
}
if (!local) {
  git('tag', tag, head);
  ok(`tagged ${tag} at ${head.slice(0, 12)}`);
} else {
  info(`local tag ${tag} already at ${head.slice(0, 12)}`);
}
if (remote !== head) {
  git('push', 'origin', `refs/tags/${tag}`);
  ok(`pushed ${tag} — the release workflow will pick it up`);
} else {
  info(`origin already has ${tag} at ${head.slice(0, 12)}`);
}

if (noWait) {
  info('not waiting; follow the release with: gh run list --workflow=release.yml');
  process.exit(0);
}

await waitForRelease(head);
