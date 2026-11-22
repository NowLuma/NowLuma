import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMarkdownRenderer } from 'vitepress';
import { CHAPTER_IDS, DOCS_BASE, LOCALES } from '../docs/.vitepress/tutorials.mjs';
import { idsOf, referencesOf } from './docs-html.mjs';

export { CHAPTER_IDS, DOCS_BASE, LOCALES };
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONTENT_ROOT = path.join(ROOT, 'docs/content');
export const HOSTED_DEPLOY_FILES = ['install.sh', 'manage.sh', 'docker-compose.yml'];
export const CHAPTERS = CHAPTER_IDS.map((chapter) => `${chapter}.md`);
const legacyHeadingIds = JSON.parse(
  fs.readFileSync(new URL('../docs/.vitepress/legacy-heading-ids.json', import.meta.url), 'utf8'),
);

// Both the framework build and source validation use VitePress's own parser,
// frontmatter plugin and heading anchors. Do not implement a second slugger.
export const markdownOptions = {
  headers: { level: [1, 2, 3, 4, 5, 6] },
  config(md) {
    const headingOpen = md.renderer.rules.heading_open;
    md.renderer.rules.heading_open = (tokens, index, options, env, renderer) => {
      // Only the published IDs that differ from VitePress are retained.
      // Native framework IDs remain canonical for every current heading.
      const legacy = legacyHeadingIds[env.relativePath]?.[tokens[index + 1].content];
      const alias =
        legacy && legacy !== tokens[index].attrGet('id')
          ? `<span id="${md.utils.escapeHtml(legacy)}" class="legacy-heading-anchor" aria-hidden="true"></span>\n`
          : '';
      return (
        alias +
        (headingOpen
          ? headingOpen(tokens, index, options, env, renderer)
          : renderer.renderToken(tokens, index, options))
      );
    };
  },
};

export async function readDocuments(contentRoot = CONTENT_ROOT) {
  const md = await createMarkdownRenderer(contentRoot, markdownOptions, DOCS_BASE);
  const documents = new Map();
  const files = ['index.md'];
  for (const lang of Object.keys(LOCALES)) {
    const directory = path.join(contentRoot, lang);
    if (fs.existsSync(directory)) {
      files.push(
        ...fs
          .readdirSync(directory)
          .filter((name) => name.endsWith('.md'))
          .map((name) => `${lang}/${name}`),
      );
    }
  }
  for (const key of files) {
    const file = path.join(contentRoot, key);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const env = { path: file, relativePath: key, cleanUrls: false };
    let html;
    try {
      html = md.render(source, env);
    } catch (error) {
      throw new Error(`${key}: ${error.message}`, { cause: error });
    }
    const refs = referencesOf(html)
      .filter((ref) => ref.tag === 'a' || ref.tag === 'img')
      .map((ref) => ({ url: ref.href ?? ref.src, image: ref.tag === 'img', alt: ref.alt ?? '' }));
    documents.set(key, {
      file,
      source,
      frontmatter: env.frontmatter ?? {},
      anchors: idsOf(html),
      h1Count: (html.match(/<h1[\s>]/g) ?? []).length,
      refs,
    });
  }
  return documents;
}
