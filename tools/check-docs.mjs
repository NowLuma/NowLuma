#!/usr/bin/env node
// Validate authoring inputs and the public HTML contract, not VitePress internals.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHAPTERS,
  CONTENT_ROOT,
  DOCS_BASE,
  LOCALES,
  ROOT,
  readDocuments,
} from './docs-metadata.mjs';
import { attributes, idsOf, referencesOf } from './docs-html.mjs';
import { tutorialUrl } from '../docs/.vitepress/tutorials.mjs';

const STATUSES = new Set(['implemented', 'pending-integration', 'unverified']);
const ORIGIN = 'https://docs-check.invalid';

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function isInside(root, target) {
  const relativePath = path.relative(root, target);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function external(ref) {
  return /^(https?:|mailto:|tel:)/i.test(ref);
}

function localUrl(ref, page, problems) {
  if (!ref || ref.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(ref)) {
    problems.push(`${page}: unsafe or empty local URL ${ref}`);
    return null;
  }
  try {
    return new URL(ref, `${ORIGIN}${DOCS_BASE}${page.replace(/\.md$/, '.html')}`);
  } catch {
    problems.push(`${page}: invalid URL ${ref}`);
    return null;
  }
}

function decoded(value, label, problems) {
  try {
    return decodeURIComponent(value);
  } catch {
    problems.push(`${label}: invalid URL encoding ${value}`);
    return null;
  }
}

export async function checkSources({ contentRoot = CONTENT_ROOT } = {}) {
  const problems = [];
  let documents;
  try {
    documents = await readDocuments(contentRoot);
  } catch (error) {
    return [error.message];
  }
  if (!documents.has('index.md')) problems.push('missing bilingual landing page index.md');
  for (const lang of Object.keys(LOCALES)) {
    const files = [...documents.keys()].filter((key) => key.startsWith(`${lang}/`));
    if (files.length !== CHAPTERS.length) {
      problems.push(`${lang}: expected exactly ${CHAPTERS.length} chapters, found ${files.length}`);
    }
    for (const chapter of CHAPTERS) {
      if (!documents.has(`${lang}/${chapter}`)) problems.push(`missing chapter ${lang}/${chapter}`);
    }
  }
  for (const [key, document] of documents) {
    const { frontmatter, refs } = document;
    for (const field of ['title', 'description']) {
      if (typeof frontmatter[field] !== 'string' || !frontmatter[field].trim()) {
        problems.push(`${key}: frontmatter is missing ${field}`);
      }
    }
    if (key !== 'index.md') {
      if (!CHAPTERS.includes(path.posix.basename(key))) problems.push(`unknown chapter ${key}`);
      if (frontmatter.tutorial !== path.posix.basename(key, '.md')) {
        problems.push(`${key}: tutorial frontmatter must match the chapter ID`);
      }
      if (document.h1Count !== 1)
        problems.push(`${key}: expected one h1, found ${document.h1Count}`);
      if (!refs.some((ref) => ref.image && /^\/images\/tutorials\/[\w-]+\.png$/.test(ref.url))) {
        problems.push(`${key}: missing a chapter illustration under /images/tutorials/`);
      }
    } else if (frontmatter.tutorial !== undefined) {
      problems.push('index.md: the bilingual landing page must not select a tutorial');
    }
    for (const ref of refs) {
      if (ref.image && !ref.alt.trim())
        problems.push(`${key}: image without alt text (${ref.url})`);
      if (external(ref.url)) {
        try {
          new URL(ref.url);
        } catch {
          problems.push(`${key}: invalid URL ${ref.url}`);
        }
        continue;
      }
      if (ref.image && ref.url.startsWith('/images/')) {
        const imagePath = decoded(ref.url, key, problems);
        if (!imagePath) continue;
        const publicRoot = path.resolve(contentRoot, 'public');
        const target = path.resolve(publicRoot, `.${imagePath}`);
        if (
          !isInside(publicRoot, target) ||
          !fs.existsSync(target) ||
          !fs.statSync(target).isFile()
        ) {
          problems.push(`${key}: missing image ${ref.url}`);
        }
        continue;
      }
      const url = localUrl(ref.url, key, problems);
      if (!url) continue;
      if (!url.pathname.startsWith(DOCS_BASE)) {
        problems.push(`${key}: URL ${ref.url} breaks the ${DOCS_BASE} base path`);
        continue;
      }
      const pathname = decoded(url.pathname.slice(DOCS_BASE.length), key, problems);
      if (pathname === null) continue;
      if (pathname === 'demo/' || pathname === 'demo/index.html') continue;
      const targetKey = pathname.endsWith('/')
        ? `${pathname}index.md`
        : pathname.replace(/\.html$/, '.md');
      if (!documents.has(targetKey)) {
        problems.push(`${key}: link ${ref.url} does not resolve to a documentation page`);
        continue;
      }
      if (url.hash) {
        const anchor = decoded(url.hash.slice(1), key, problems);
        if (anchor !== null && !documents.get(targetKey).anchors.has(anchor)) {
          problems.push(`${key}: link ${ref.url} points at a missing anchor`);
        }
      }
    }
  }

  const coverageFile = path.join(contentRoot, 'coverage.json');
  if (!fs.existsSync(coverageFile)) {
    problems.push('docs/content/coverage.json is missing');
  } else {
    let coverage;
    try {
      coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
    } catch (error) {
      problems.push(`docs/content/coverage.json is not valid JSON: ${error.message}`);
    }
    if (coverage) {
      if (!Array.isArray(coverage.features) || coverage.features.length === 0) {
        problems.push('coverage.json: features must be a non-empty array');
      } else {
        const seen = new Set();
        const covered = new Set();
        for (const feature of coverage.features) {
          if (!feature.id || seen.has(feature.id)) {
            problems.push(`coverage.json: missing or duplicate feature id ${feature.id}`);
          }
          seen.add(feature.id);
          if (!STATUSES.has(feature.status)) {
            problems.push(`coverage.json: ${feature.id} has unknown status ${feature.status}`);
          }
          if (!feature.group) problems.push(`coverage.json: ${feature.id} is missing a group`);
          if (!Array.isArray(feature.pages) || feature.pages.length === 0) {
            problems.push(`coverage.json: ${feature.id} is not mapped to a page`);
            continue;
          }
          for (const page of feature.pages) {
            covered.add(page);
            if (!CHAPTERS.includes(page)) {
              problems.push(`coverage.json: ${feature.id} maps to unknown page ${page}`);
            }
          }
        }
        for (const chapter of CHAPTERS) {
          if (!covered.has(chapter))
            problems.push(`coverage.json: chapter ${chapter} has no documented feature`);
        }
      }
    }
  }
  return problems;
}

export function checkHtmlReferences({ html, file, outDir, withDemo = false }) {
  const problems = [];
  const label = relative(outDir, file);
  for (const ref of referencesOf(html)) {
    const value = ref.href ?? ref.src;
    if (value === undefined) continue;
    if (external(value)) {
      try {
        new URL(value);
      } catch {
        problems.push(`${label}: invalid URL ${value}`);
      }
      continue;
    }
    if (value.startsWith('data:') && (ref.tag === 'img' || ref.tag === 'link')) continue;
    const url = localUrl(value, label, problems);
    if (!url) continue;
    if (!url.pathname.startsWith(DOCS_BASE)) {
      problems.push(`${label}: URL ${value} breaks the ${DOCS_BASE} base path`);
      continue;
    }
    const pathname = decoded(url.pathname.slice(DOCS_BASE.length), label, problems);
    if (pathname === null) continue;
    let target = path.resolve(outDir, pathname || '.');
    if (!isInside(outDir, target)) {
      problems.push(`${label}: URL ${value} escapes the site output`);
      continue;
    }
    const isDemo = pathname === 'demo' || pathname.startsWith('demo/');
    if (isDemo && !withDemo) continue;
    if (pathname.endsWith('/') || (fs.existsSync(target) && fs.statSync(target).isDirectory())) {
      target = path.join(target, 'index.html');
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      problems.push(`${label}: missing target ${value}`);
      continue;
    }
    if (url.hash) {
      const anchor = decoded(url.hash.slice(1), label, problems);
      if (anchor !== null && !idsOf(fs.readFileSync(target, 'utf8')).has(anchor)) {
        problems.push(`${label}: missing anchor ${value}`);
      }
    }
    if (ref.tag === 'img' && !Object.hasOwn(ref, 'alt')) {
      problems.push(`${label}: image without alt text`);
    }
  }
  return problems;
}

function checkTutorial(html, lang, chapter, label) {
  const problems = [];
  const iframes = [...html.matchAll(/<iframe\b[^>]*>/gi)];
  if (iframes.length !== 1)
    return [`${label}: expected one tutorial iframe, found ${iframes.length}`];
  const iframe = attributes(iframes[0][0]);
  const expected = tutorialUrl(DOCS_BASE, chapter, lang);
  if (iframe.src !== expected || Object.hasOwn(iframe, 'srcdoc')) {
    problems.push(`${label}: tutorial iframe must use exactly ${expected}`);
  }
  const sandbox = new Set((iframe.sandbox ?? '').split(/\s+/));
  if (
    !sandbox.has('allow-scripts') ||
    !sandbox.has('allow-same-origin') ||
    [...sandbox].some(
      (flag) => !['allow-scripts', 'allow-same-origin', 'allow-downloads'].includes(flag),
    )
  ) {
    problems.push(`${label}: tutorial iframe has an unsafe sandbox`);
  }
  if (!iframe.title?.trim() || iframe.referrerpolicy !== 'no-referrer') {
    problems.push(`${label}: tutorial iframe is missing its accessible title or referrer policy`);
  }
  if (iframes[0].index > html.search(/<h1[\s>]/i))
    problems.push(`${label}: tutorial must appear above the chapter text`);
  if (!html.includes('data-tutorial-restart') || !html.includes('data-tutorial-larger')) {
    problems.push(`${label}: tutorial restart and larger-view controls are required`);
  }
  return problems;
}

export function checkSite({ outDir = path.join(ROOT, '_site'), withDemo = false } = {}) {
  outDir = path.resolve(outDir);
  if (!fs.existsSync(outDir))
    return [`${relative(ROOT, outDir)} does not exist; run pnpm docs:build first`];
  const problems = [];
  for (const lang of Object.keys(LOCALES)) {
    for (const chapterFile of CHAPTERS) {
      const chapter = chapterFile.replace(/\.md$/, '');
      const label = `${lang}/${chapter}.html`;
      const file = path.join(outDir, label);
      if (!fs.existsSync(file)) {
        problems.push(`missing page ${label}`);
        continue;
      }
      const html = fs.readFileSync(file, 'utf8');
      if (!/^<!doctype html>/i.test(html)) problems.push(`${label}: missing doctype`);
      if (!html.includes(`<html lang="${LOCALES[lang].htmlLang}"`))
        problems.push(`${label}: incorrect html lang`);
      if (!/<meta\b[^>]*name="description"[^>]*content="[^"]+"/i.test(html)) {
        problems.push(`${label}: missing meta description`);
      }
      const h1Count = (html.match(/<h1[\s>]/g) ?? []).length;
      if (h1Count !== 1) problems.push(`${label}: expected one h1, found ${h1Count}`);
      problems.push(...checkTutorial(html, lang, chapter, label));
      problems.push(...checkHtmlReferences({ html, file, outDir, withDemo }));
    }
  }
  const landing = path.join(outDir, 'index.html');
  if (!fs.existsSync(landing)) {
    problems.push('missing landing page index.html');
  } else {
    const html = fs.readFileSync(landing, 'utf8');
    if (/<iframe\b/i.test(html)) problems.push('landing page must not embed a tutorial');
    for (const lang of Object.keys(LOCALES)) {
      const refs = referencesOf(html);
      if (
        !refs.some(
          (ref) =>
            ref.href === `${DOCS_BASE}${lang}/index.html` || ref.href === `${DOCS_BASE}${lang}/`,
        )
      ) {
        problems.push(`landing page: missing ${lang} documentation link`);
      }
    }
    problems.push(...checkHtmlReferences({ html, file: landing, outDir, withDemo }));
  }
  const demoFile = path.join(outDir, 'demo/index.html');
  if (withDemo) {
    if (!fs.existsSync(demoFile)) {
      problems.push('demo route _site/demo/index.html is missing; build the simulator first');
    } else if (!/<!doctype html>/i.test(fs.readFileSync(demoFile, 'utf8'))) {
      problems.push('demo route _site/demo/index.html is not an HTML document');
    }
  }
  return problems;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const withDemo = process.argv.includes('--with-demo');
  const problems = [...(await checkSources()), ...checkSite({ withDemo })];
  if (problems.length) {
    console.error(
      `docs check failed (${problems.length} problem${problems.length === 1 ? '' : 's'}):`,
    );
    for (const problem of problems) console.error(` - ${problem}`);
    process.exitCode = 1;
  } else {
    console.log(
      `docs check passed: ${CHAPTERS.length * 2} VitePress chapters, sources, links, anchors and inline tutorials${withDemo ? ' with demo' : ''}`,
    );
  }
}
