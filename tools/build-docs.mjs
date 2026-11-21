#!/usr/bin/env node
// Preserve the CI entry point while VitePress owns parsing, rendering and search.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vitepress';
import { ROOT } from './docs-metadata.mjs';

export async function buildSite({ outDir = path.join(ROOT, '_site') } = {}) {
  await build(path.join(ROOT, 'docs'), { outDir });
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  await buildSite();
  console.log('docs: VitePress built the bilingual site into _site');
}
