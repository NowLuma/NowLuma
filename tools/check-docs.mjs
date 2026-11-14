#!/usr/bin/env node
// Structural checks for the bilingual docs: source frontmatter, chapter links and
// anchors, the 128-feature coverage map, and every link/anchor of the built site.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAPTERS, LOCALES, createSlugger, parseFrontmatter, plainText } from './build-docs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATUSES = new Set(['implemented', 'pending-integration', 'unverified']);

function relative(root, file) {
    return path.relative(root, file).split(path.sep).join('/');
}

export function checkSources({
    contentRoot = path.join(ROOT, 'docs/content'),
    siteRoot = path.join(ROOT, 'docs/site'),
} = {}) {
    const problems = [];
    const sources = new Map();

    for (const lang of Object.keys(LOCALES)) {
        const directory = path.join(contentRoot, lang);
        if (!fs.existsSync(directory)) {
            problems.push(`${lang}: missing content directory ${relative(ROOT, directory)}`);
            continue;
        }

        const files = fs.readdirSync(directory).filter((file) => file.endsWith('.md')).sort();
        const expected = [...CHAPTERS].sort();
        if (JSON.stringify(files) !== JSON.stringify(expected)) {
            problems.push(`${lang}: expected exactly ${CHAPTERS.length} chapters, found ${files.length}`);
        }

        for (const file of files) {
            const source = fs.readFileSync(path.join(directory, file), 'utf8');
            const { data, body } = parseFrontmatter(source);
            if (!data.title) {
                problems.push(`${lang}/${file}: frontmatter is missing title`);
            }
            if (!data.description) {
                problems.push(`${lang}/${file}: frontmatter is missing description`);
            }
            sources.set(`${lang}/${file}`, { source, body });
        }
    }

    const ids = new Map();
    for (const [key, source] of sources) {
        const slugger = createSlugger();
        const anchors = new Set();
        for (const line of source.body.split(/\r?\n/)) {
            const heading = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
            if (heading) {
                anchors.add(slugger(plainText(heading[2])));
            }
        }
        ids.set(key, anchors);
    }

    for (const [key, source] of sources) {
        const [lang] = key.split('/');
        for (const match of source.source.matchAll(/!?\[([^\]]*)\]\(([^)\s]+)\)/g)) {
            const isImage = match[0].startsWith('!');
            const url = match[2];

            if (/^(https?:|mailto:)/i.test(url)) {
                try {
                    new URL(url);
                } catch {
                    problems.push(`${key}: invalid URL ${url}`);
                }
                continue;
            }

            if (isImage) {
                if (!match[1].trim()) {
                    problems.push(`${key}: image without alt text (${url})`);
                }
                continue;
            }

            if (url.startsWith('#')) {
                if (!ids.get(key)?.has(decodeURIComponent(url.slice(1)))) {
                    problems.push(`${key}: missing anchor ${url}`);
                }
                continue;
            }

            if (/^\.\.\/demo\//.test(url)) {
                continue;
            }

            if (url.startsWith('/')) {
                problems.push(`${key}: root-absolute link ${url} breaks the /Nowluma/ base path`);
                continue;
            }

            const [targetPath, anchor] = url.split('#');
            const targetKey = `${lang}/${path.basename(targetPath)}`;
            if (!targetPath.endsWith('.md') || !sources.has(targetKey)) {
                problems.push(`${key}: link ${url} does not resolve to a chapter in the same language`);
                continue;
            }
            if (anchor && !ids.get(targetKey)?.has(decodeURIComponent(anchor))) {
                problems.push(`${key}: link ${url} points at a missing anchor`);
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
                    if (!feature.group) {
                        problems.push(`coverage.json: ${feature.id} is missing a group`);
                    }
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
                    if (!covered.has(chapter)) {
                        problems.push(`coverage.json: chapter ${chapter} has no documented feature`);
                    }
                }
            }
        }
    }

    for (const asset of ['style.css', 'site.js']) {
        if (!fs.existsSync(path.join(siteRoot, asset))) {
            problems.push(`docs/site/${asset} is missing`);
        }
    }

    return problems;
}

function idsOf(html) {
    return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
}

function stripTags(html) {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function checkRefs(html, file, outDir, withDemo, problems) {
    const pageIds = idsOf(html);

    for (const match of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
        const ref = match[1];
        if (!ref) {
            problems.push(`${relative(outDir, file)}: empty href/src`);
            continue;
        }
        if (/^javascript:/i.test(ref)) {
            problems.push(`${relative(outDir, file)}: javascript: URL ${ref}`);
            continue;
        }
        if (/^(https?:|mailto:)/i.test(ref)) {
            try {
                new URL(ref);
            } catch {
                problems.push(`${relative(outDir, file)}: invalid URL ${ref}`);
            }
            continue;
        }
        if (ref.startsWith('//')) {
            problems.push(`${relative(outDir, file)}: protocol-relative URL ${ref}`);
            continue;
        }
        if (ref.startsWith('#')) {
            if (!pageIds.has(decodeURIComponent(ref.slice(1)))) {
                problems.push(`${relative(outDir, file)}: missing anchor ${ref}`);
            }
            continue;
        }
        if (ref.startsWith('/')) {
            problems.push(`${relative(outDir, file)}: root-absolute URL ${ref} breaks the /Nowluma/ base path`);
            continue;
        }

        const [targetPath, anchor] = ref.split('#');
        const target = path.resolve(path.dirname(file), targetPath.split('?')[0]);
        const insideOutput = target === outDir || target.startsWith(`${outDir}${path.sep}`);
        if (!insideOutput) {
            problems.push(`${relative(outDir, file)}: link ${ref} escapes the site output`);
            continue;
        }

        const demoPath = path.join(outDir, 'demo');
        const isDemo = target === demoPath || target.startsWith(`${demoPath}${path.sep}`);
        if (!fs.existsSync(target)) {
            if (!(isDemo && !withDemo)) {
                problems.push(`${relative(outDir, file)}: missing target ${ref}`);
            }
            continue;
        }

        if (anchor) {
            let targetFile = target;
            if (fs.statSync(target).isDirectory()) {
                targetFile = path.join(target, 'index.html');
            }
            if (!fs.existsSync(targetFile)) {
                problems.push(`${relative(outDir, file)}: missing target ${ref}`);
                continue;
            }
            if (!idsOf(fs.readFileSync(targetFile, 'utf8')).has(decodeURIComponent(anchor))) {
                problems.push(`${relative(outDir, file)}: missing anchor ${ref}`);
            }
        }
    }

    for (const match of html.matchAll(/<img\b[^>]*>/g)) {
        if (!/\salt="/.test(match[0])) {
            problems.push(`${relative(outDir, file)}: image without alt text`);
        }
    }
}

export function checkSite({ outDir = path.join(ROOT, '_site'), withDemo = false } = {}) {
    const problems = [];
    if (!fs.existsSync(outDir)) {
        return [`${relative(ROOT, outDir)} does not exist; run node tools/build-docs.mjs first`];
    }

    const pages = new Map();
    for (const lang of Object.keys(LOCALES)) {
        for (const chapter of CHAPTERS) {
            const name = `${chapter.replace(/\.md$/, '')}.html`;
            const file = path.join(outDir, lang, name);
            if (!fs.existsSync(file)) {
                problems.push(`missing page ${relative(outDir, file)}`);
                continue;
            }
            pages.set(`${lang}/${name}`, { lang, name, file, html: fs.readFileSync(file, 'utf8') });
        }
    }

    for (const page of pages.values()) {
        const label = `${page.lang}/${page.name}`;
        const { html } = page;

        if (!/^<!doctype html>/i.test(html)) {
            problems.push(`${label}: missing doctype`);
        }
        if (!html.includes(`<html lang="${LOCALES[page.lang].htmlLang}"`)) {
            problems.push(`${label}: html lang does not match the locale`);
        }
        if (!/<meta name="description" content="[^"]+">/.test(html)) {
            problems.push(`${label}: missing meta description`);
        }

        const h1Count = (html.match(/<h1[\s>]/g) ?? []).length;
        if (h1Count !== 1) {
            problems.push(`${label}: expected one h1, found ${h1Count}`);
        }

        const sidebar = /<nav class="sidebar"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
        const chapterLinks = [...sidebar.matchAll(/<a href="([^"]+)"/g)].map((match) => match[1]);
        if (chapterLinks.length !== CHAPTERS.length) {
            problems.push(`${label}: navigation has ${chapterLinks.length} chapters, expected ${CHAPTERS.length}`);
        }
        const active = [...sidebar.matchAll(/<a href="([^"]+)" aria-current="page"/g)].map(
            (match) => match[1],
        );
        if (active.length !== 1 || active[0] !== page.name) {
            problems.push(`${label}: aria-current is not exactly on ${page.name}`);
        }

        const otherLang = page.lang === 'zh' ? 'en' : 'zh';
        if (!html.includes(`href="../${otherLang}/${page.name}"`)) {
            problems.push(`${label}: missing ${otherLang} language counterpart link`);
        }
        if (!html.includes('data-search-input')) {
            problems.push(`${label}: missing search input`);
        }
        if (!html.includes('data-demo-link')) {
            problems.push(`${label}: missing demo route link`);
        }
        if (!html.includes('data-toc')) {
            problems.push(`${label}: missing table of contents`);
        }

        const article = /<article class="prose">([\s\S]*?)<\/article>/.exec(html)?.[1] ?? '';
        if (!article) {
            problems.push(`${label}: missing article body`);
        } else {
            if (/<script/i.test(article)) {
                problems.push(`${label}: raw script markup inside the article`);
            }
            if (stripTags(article).length < 400) {
                problems.push(`${label}: article body looks empty`);
            }
        }

        checkRefs(html, page.file, outDir, withDemo, problems);
    }

    const assets = ['style.css', 'site.js', 'search.json', 'nowluma-mark.svg'];
    for (const asset of assets) {
        if (!fs.existsSync(path.join(outDir, 'assets', asset))) {
            problems.push(`missing asset assets/${asset}`);
        }
    }

    const searchFile = path.join(outDir, 'assets', 'search.json');
    if (fs.existsSync(searchFile)) {
        try {
            const index = JSON.parse(fs.readFileSync(searchFile, 'utf8'));
            if (!Array.isArray(index.entries) || index.entries.length !== CHAPTERS.length * 2) {
                problems.push(
                    `search.json: expected ${CHAPTERS.length * 2} entries, found ${index.entries?.length ?? 0}`,
                );
            } else {
                const seen = new Set();
                for (const entry of index.entries) {
                    const key = `${entry.lang}/${entry.page}`;
                    seen.add(key);
                    if (!LOCALES[entry.lang] || !CHAPTERS.includes(`${entry.page}.md`)) {
                        problems.push(`search.json: unknown entry ${key}`);
                    }
                    if (!entry.title || !entry.description) {
                        problems.push(`search.json: ${key} is missing title or description`);
                    }
                    if (!Array.isArray(entry.headings) || typeof entry.text !== 'string' || entry.text.length < 100) {
                        problems.push(`search.json: ${key} has no searchable text`);
                    }
                }
                for (const lang of Object.keys(LOCALES)) {
                    for (const chapter of CHAPTERS) {
                        const key = `${lang}/${chapter.replace(/\.md$/, '')}`;
                        if (!seen.has(key)) {
                            problems.push(`search.json: missing entry ${key}`);
                        }
                    }
                }
            }
        } catch (error) {
            problems.push(`search.json is not valid JSON: ${error.message}`);
        }
    }

    const landing = path.join(outDir, 'index.html');
    if (!fs.existsSync(landing)) {
        problems.push('missing landing page index.html');
    } else {
        const html = fs.readFileSync(landing, 'utf8');
        for (const required of ['href="zh/index.html"', 'href="en/index.html"', 'href="demo/"']) {
            if (!html.includes(required)) {
                problems.push(`landing page: missing ${required}`);
            }
        }
        if (!html.includes('lang="zh-CN"') || !html.includes('lang="en"')) {
            problems.push('landing page: both language labels are required');
        }
        checkRefs(html, landing, outDir, withDemo, problems);
    }

    const demoFile = path.join(outDir, 'demo', 'index.html');
    if (withDemo) {
        if (!fs.existsSync(demoFile)) {
            problems.push('demo route _site/demo/index.html is missing; build the simulator demo first');
        } else if (!/<!doctype html>/i.test(fs.readFileSync(demoFile, 'utf8'))) {
            problems.push('demo route _site/demo/index.html is not an HTML document');
        }
    }

    return problems;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
    const withDemo = process.argv.includes('--with-demo');
    const problems = [...checkSources(), ...checkSite({ withDemo })];
    if (problems.length) {
        console.error(`docs check failed (${problems.length} problem${problems.length === 1 ? '' : 's'}):`);
        for (const problem of problems) {
            console.error(` - ${problem}`);
        }
        process.exitCode = 1;
    } else {
        const demo = withDemo ? ' and the demo route' : '';
        console.log(`docs check passed: ${CHAPTERS.length * 2} pages, sources, links, anchors${demo}`);
    }
}
