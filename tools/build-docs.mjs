#!/usr/bin/env node
// Preserve the CI entry point while VitePress owns parsing, rendering and search.
import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vitepress';
import { HOSTED_DEPLOY_FILES, ROOT } from './docs-metadata.mjs';

export async function buildSite({ outDir = path.join(ROOT, '_site') } = {}) {
  await build(path.join(ROOT, 'docs'), { outDir });
  await Promise.all(
    HOSTED_DEPLOY_FILES.map((name) =>
      copyFile(path.join(ROOT, 'deploy', name), path.join(outDir, name)),
    ),
  );
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  await buildSite();
  console.log('docs: VitePress built the bilingual site into _site');
}
