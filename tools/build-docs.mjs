#!/usr/bin/env node
// Zero-dependency bilingual docs builder. Every link it emits is relative so the
// output works both from file:// and from the GitHub Pages project path (/Nowluma/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const CHAPTERS = [
    'index.md',
    'introduction.md',
    'install-docker.md',
    'install-native.md',
    'first-run.md',
    'overview.md',
    'qq-connection.md',
    'onebot-config.md',
    'logs.md',
    'debug.md',
    'settings-console.md',
    'settings-runtime.md',
    'access-network.md',
    'data-backup.md',
    'troubleshooting.md',
    'demo.md',
    'planned.md',
    'developing.md',
];

export const LOCALES = {
    zh: {
        code: 'zh',
        htmlLang: 'zh-CN',
        siteTitle: 'Nowluma 文档',
        switchLang: 'en',
        switchLabel: 'English',
        switchAria: '切换到英文文档',
        switchHref: (page) => `../en/${page}.html`,
        strings: {
            skip: '跳到正文',
            menu: '打开章节导航',
            homeAria: 'Nowluma 文档首页',
            brandSub: '文档',
            searchLabel: '搜索文档',
            searchPlaceholder: '搜索文档…',
            searchEmpty: '没有匹配的章节',
            searchFailed: '搜索索引加载失败，请刷新页面重试。',
            searchResults: '找到 {n} 个结果',
            chapters: '章节',
            siteLinks: '站点链接',
            demo: '模拟练习',
            toc: '本页目录',
            pager: '章节翻页',
            previous: '上一章',
            next: '下一章',
            footer: 'Nowluma · 静态文档站点 · 内容来自 docs/content',
            anchor: '链接到本节',
            copy: '复制代码',
            copied: '已复制',
            copyFailed: '复制失败',
        },
    },
    en: {
        code: 'en',
        htmlLang: 'en',
        siteTitle: 'Nowluma documentation',
        switchLang: 'zh',
        switchLabel: '中文',
        switchAria: 'Switch to Chinese documentation',
        switchHref: (page) => `../zh/${page}.html`,
        strings: {
            skip: 'Skip to content',
            menu: 'Open chapter navigation',
            homeAria: 'Nowluma documentation home',
            brandSub: 'docs',
            searchLabel: 'Search documentation',
            searchPlaceholder: 'Search documentation…',
            searchEmpty: 'No matching chapters',
            searchFailed: 'Search index failed to load. Reload the page and try again.',
            searchResults: '{n} results',
            chapters: 'Chapters',
            siteLinks: 'Site links',
            demo: 'Practice demo',
            toc: 'On this page',
            pager: 'Chapter navigation',
            previous: 'Previous',
            next: 'Next',
            footer: 'Nowluma · static documentation site · content from docs/content',
            anchor: 'Link to this section',
            copy: 'Copy code',
            copied: 'Copied',
            copyFailed: 'Copy failed',
        },
    },
};

export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// GitHub-compatible heading slug: keep letters, numbers, marks, underscores,
// hyphens and spaces; drop other punctuation; spaces become hyphens.
export function slugify(text) {
    return String(text)
        .toLowerCase()
        .trim()
        .replace(/<[^>]+>/g, '')
        .replace(/[^\p{L}\p{N}\p{M}\p{Pc}\- ]/gu, '')
        .replace(/ /g, '-');
}

export function createSlugger() {
    const seen = new Map();
    return (text) => {
        const base = slugify(text);
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        return count === 0 ? base : `${base}-${count}`;
    };
}

export function parseFrontmatter(source) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
    if (!match) {
        return { data: {}, body: source };
    }

    const data = {};
    for (const line of match[1].split(/\r?\n/)) {
        const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
        if (pair) {
            data[pair[1]] = pair[2].trim().replace(/^['"]|['"]$/g, '');
        }
    }

    return { data, body: source.slice(match[0].length) };
}

export function plainText(markdown) {
    return String(markdown)
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/`+([^`]*)`+/g, '$1')
        .replace(/\*\*/g, '')
        .trim();
}

function safeUrl(url) {
    if (/^(https?:|mailto:)/i.test(url)) {
        return url;
    }

    if (url.startsWith('#')) {
        return url;
    }

    if (url.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(url)) {
        return null;
    }

    return url.replace(/\.md(?=#|$)/, '.html');
}

const SLOT = '\uE000';

export function renderInline(text, { allowLinks = true } = {}) {
    const slots = [];
    const hold = (html) => {
        slots.push(html);
        return `${SLOT}${slots.length - 1}${SLOT}`;
    };

    let output = String(text).replace(/`([^`]+)`/g, (_, code) => hold(`<code>${escapeHtml(code)}</code>`));

    if (allowLinks) {
        output = output.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt, src) => {
            const safe = safeUrl(src);
            return safe ? hold(`<img src="${escapeHtml(safe)}" alt="${escapeHtml(alt)}" loading="lazy">`) : match;
        });
        output = output.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
            const safe = safeUrl(url);
            return safe ? hold(`<a href="${escapeHtml(safe)}">${renderInline(label, { allowLinks: false })}</a>`) : match;
        });
    }

    output = escapeHtml(output);
    output = output.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    output = output.replace(new RegExp(`${SLOT}(\\d+)${SLOT}`, 'g'), (_, index) => slots[Number(index)]);
    return output;
}

function parseRow(line) {
    let text = line.trim();
    if (text.startsWith('|')) {
        text = text.slice(1);
    }
    if (text.endsWith('|')) {
        text = text.slice(0, -1);
    }
    return text.split('|').map((cell) => cell.trim());
}

function isTableDivider(line) {
    if (!line.includes('|')) {
        return false;
    }
    const cells = parseRow(line);
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableStart(lines, index) {
    return /^\s*\|/.test(lines[index]) && index + 1 < lines.length && isTableDivider(lines[index + 1]);
}

function isListStart(line) {
    return /^\s*(?:[-*+]|\d+\.)\s+/.test(line);
}

function isBlockStart(lines, index) {
    const line = lines[index];
    return (
        /^```/.test(line) ||
        /^(#{1,6})\s+/.test(line) ||
        isTableStart(lines, index) ||
        /^>\s?/.test(line) ||
        isListStart(line) ||
        /^-{3,}\s*$/.test(line)
    );
}

function renderTable(lines, start, context) {
    const header = parseRow(lines[start]);
    const alignments = parseRow(lines[start + 1]).map((cell) => {
        if (/^:-+:$/.test(cell)) {
            return 'center';
        }
        if (/^:-+$/.test(cell)) {
            return 'left';
        }
        if (/^-+:$/.test(cell)) {
            return 'right';
        }
        return '';
    });

    let index = start + 2;
    const rows = [];
    while (index < lines.length && lines[index].trim() && /^\s*\|/.test(lines[index])) {
        rows.push(parseRow(lines[index]));
        index += 1;
    }

    const cell = (tag, text, column) => {
        const alignment = alignments[column] ? ` class="align-${alignments[column]}"` : '';
        const scope = tag === 'th' ? ' scope="col"' : '';
        return `<${tag}${scope}${alignment}>${renderInline(text)}</${tag}>`;
    };

    const head = header.map((text, column) => cell('th', text, column)).join('');
    const body = rows
        .map((row) => `<tr>${row.map((text, column) => cell('td', text, column)).join('')}</tr>`)
        .join('');

    return {
        html: `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
        next: index,
    };
}

function renderList(lines, start, context) {
    const first = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[start]);
    const indent = first[1].length;
    const ordered = /^\d+\.$/.test(first[2]);
    const items = [];
    let index = start;

    while (index < lines.length) {
        const match = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[index]);
        if (!match) {
            break;
        }

        const itemIndent = match[1].length;
        if (itemIndent < indent) {
            break;
        }

        if (itemIndent > indent) {
            if (!items.length) {
                break;
            }
            const nested = renderList(lines, index, context);
            items[items.length - 1].children.push(nested.html);
            index = nested.next;
            continue;
        }

        if (/^\d+\.$/.test(match[2]) !== ordered) {
            break;
        }

        const item = { text: [match[3]], children: [] };
        items.push(item);
        index += 1;

        while (
            index < lines.length &&
            lines[index].trim() &&
            !isListStart(lines[index]) &&
            /^\s{2,}/.test(lines[index])
        ) {
            item.text.push(lines[index].trim());
            index += 1;
        }
    }

    const tag = ordered ? 'ol' : 'ul';
    const firstNumber = Number.parseInt(first[2], 10);
    const startAttribute = ordered && firstNumber !== 1 ? ` start="${firstNumber}"` : '';
    const html = `<${tag}${startAttribute}>${items
        .map((item) => `<li>${renderInline(item.text.join('\n'))}${item.children.join('')}</li>`)
        .join('')}</${tag}>`;

    return { html, next: index };
}

function renderBlocks(lines, context) {
    const blocks = [];
    let index = 0;

    while (index < lines.length) {
        const line = lines[index];
        if (!line.trim()) {
            index += 1;
            continue;
        }

        const fence = /^```([^`]*)$/.exec(line);
        if (fence) {
            const language = fence[1].trim().split(/\s+/)[0];
            const code = [];
            index += 1;
            while (index < lines.length && !/^```\s*$/.test(lines[index])) {
                code.push(lines[index]);
                index += 1;
            }
            index += 1;
            const className = language ? ` class="language-${escapeHtml(language)}"` : '';
            blocks.push(
                `<div class="code-block"><pre tabindex="0"><code${className}>${escapeHtml(code.join('\n'))}</code></pre></div>`,
            );
            continue;
        }

        const heading = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
        if (heading) {
            const level = heading[1].length;
            const raw = heading[2];
            const text = plainText(raw);
            const id = context.slugger(text);
            context.headings.push({ level, id, text });
            const anchor = `<a class="heading-anchor" href="#${escapeHtml(id)}" aria-label="${escapeHtml(context.strings.anchor)}: ${escapeHtml(text)}">#</a>`;
            blocks.push(`<h${level} id="${escapeHtml(id)}">${renderInline(raw)}${anchor}</h${level}>`);
            index += 1;
            continue;
        }

        if (isTableStart(lines, index)) {
            const table = renderTable(lines, index, context);
            blocks.push(table.html);
            index = table.next;
            continue;
        }

        if (/^>\s?/.test(line)) {
            const quote = [];
            while (index < lines.length && /^>\s?/.test(lines[index])) {
                quote.push(lines[index].replace(/^>\s?/, ''));
                index += 1;
            }
            blocks.push(`<blockquote>${renderBlocks(quote, context)}</blockquote>`);
            continue;
        }

        if (isListStart(line)) {
            const list = renderList(lines, index, context);
            blocks.push(list.html);
            index = list.next;
            continue;
        }

        if (/^-{3,}\s*$/.test(line)) {
            blocks.push('<hr>');
            index += 1;
            continue;
        }

        const paragraph = [];
        while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
            paragraph.push(lines[index]);
            index += 1;
        }
        if (!paragraph.length) {
            index += 1;
            continue;
        }
        blocks.push(`<p>${renderInline(paragraph.join('\n'))}</p>`);
    }

    return blocks.join('\n');
}

export function renderMarkdown(body, { strings = LOCALES.zh.strings } = {}) {
    const headings = [];
    const html = renderBlocks(body.split(/\r?\n/), {
        headings,
        slugger: createSlugger(),
        strings,
    });
    return { html, headings };
}

function navLabel(title) {
    const stripped = title.replace(/\s*[（(][^（()）]*[)）]\s*$/, '').trim();
    return stripped || title;
}

function renderToc(headings, strings) {
    const entries = headings.filter((heading) => heading.level === 2 || heading.level === 3);
    if (!entries.length) {
        return '';
    }

    const top = [];
    for (const heading of entries) {
        if (heading.level === 2 || !top.length) {
            top.push({ heading, children: [] });
        } else {
            top[top.length - 1].children.push(heading);
        }
    }

    const list = top
        .map(({ heading, children }) => {
            const childList = children.length
                ? `<ol>${children
                      .map((child) => `<li><a href="#${child.id}">${escapeHtml(child.text)}</a></li>`)
                      .join('')}</ol>`
                : '';
            return `<li><a href="#${heading.id}">${escapeHtml(heading.text)}</a>${childList}</li>`;
        })
        .join('');

    return `<details class="toc" data-toc>
            <summary>${escapeHtml(strings.toc)}</summary>
            <ol>${list}</ol>
        </details>`;
}

function renderPage(locale, entry, chapters) {
    const strings = locale.strings;
    const page = entry.page;
    const title = page === 'index' ? locale.siteTitle : `${entry.title} · ${locale.siteTitle}`;
    const currentIndex = chapters.findIndex((chapter) => chapter.page === page);
    const previous = currentIndex > 0 ? chapters[currentIndex - 1] : null;
    const next = currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

    const nav = chapters
        .map((chapter) => {
            const active = chapter.page === page;
            return `<li><a href="${chapter.page}.html"${active ? ' aria-current="page"' : ''}>${escapeHtml(chapter.navLabel)}</a></li>`;
        })
        .join('\n                ');

    const pager = [
        previous
            ? `<a class="pager-link" rel="prev" href="${previous.page}.html"><span class="pager-label">${escapeHtml(strings.previous)}</span><span class="pager-title">${escapeHtml(previous.navLabel)}</span></a>`
            : '',
        next
            ? `<a class="pager-link pager-next" rel="next" href="${next.page}.html"><span class="pager-label">${escapeHtml(strings.next)}</span><span class="pager-title">${escapeHtml(next.navLabel)}</span></a>`
            : '',
    ]
        .filter(Boolean)
        .join('\n            ');

    return `<!doctype html>
<html lang="${locale.htmlLang}" data-locale="${locale.code}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(entry.description)}">
    <link rel="alternate" hreflang="${locale.switchLang}" href="${locale.switchHref(page)}">
    <link rel="icon" type="image/svg+xml" href="../assets/nowluma-mark.svg">
    <link rel="stylesheet" href="../assets/style.css">
    <script>document.documentElement.classList.add('js')</script>
    <script src="../assets/site.js" defer></script>
</head>
<body data-copy-label="${escapeHtml(strings.copy)}" data-copied-label="${escapeHtml(strings.copied)}" data-copy-failed-label="${escapeHtml(strings.copyFailed)}">
<a class="skip-link" href="#main">${escapeHtml(strings.skip)}</a>
<header class="topbar">
    <div class="topbar-inner">
        <button class="menu-toggle" type="button" data-menu-toggle aria-expanded="false" aria-controls="sidebar" aria-label="${escapeHtml(strings.menu)}">
            <span aria-hidden="true">☰</span>
        </button>
        <a class="brand" href="index.html" aria-label="${escapeHtml(strings.homeAria)}">
            <img class="brand-mark" src="../assets/nowluma-mark.svg" alt="" width="27" height="27">
            <span class="brand-name">Nowluma</span>
            <span class="brand-sub">${escapeHtml(strings.brandSub)}</span>
        </a>
        <div class="search" role="search" data-search data-index="../assets/search.json" data-empty-text="${escapeHtml(strings.searchEmpty)}" data-failed-text="${escapeHtml(strings.searchFailed)}" data-results-text="${escapeHtml(strings.searchResults)}">
            <label class="visually-hidden" for="nl-search">${escapeHtml(strings.searchLabel)}</label>
            <input class="search-input" id="nl-search" type="search" placeholder="${escapeHtml(strings.searchPlaceholder)}" autocomplete="off" spellcheck="false" data-search-input aria-controls="nl-search-results">
            <ul class="search-results" id="nl-search-results" data-search-results hidden></ul>
            <p class="search-status visually-hidden" data-search-status role="status" aria-live="polite"></p>
        </div>
        <nav class="topbar-links" aria-label="${escapeHtml(strings.siteLinks)}">
            <a class="demo-link" href="../demo/" data-demo-link>${escapeHtml(strings.demo)}</a>
            <a class="lang-link" href="${locale.switchHref(page)}" hreflang="${locale.switchLang}" lang="${locale.switchLang}" aria-label="${escapeHtml(locale.switchAria)}">${escapeHtml(locale.switchLabel)}</a>
        </nav>
    </div>
</header>
<div class="shell">
    <nav class="sidebar" id="sidebar" aria-label="${escapeHtml(strings.chapters)}">
        <p class="sidebar-title">${escapeHtml(strings.chapters)}</p>
        <ol class="chapter-list">
                ${nav}
        </ol>
    </nav>
    <main class="main" id="main">
        <article class="prose">
${entry.html}
        </article>
        <nav class="pager" aria-label="${escapeHtml(strings.pager)}">
            ${pager}
        </nav>
        <footer class="page-footer">
            <p>${escapeHtml(strings.footer)}</p>
        </footer>
    </main>
    <aside class="toc-column" aria-label="${escapeHtml(strings.toc)}">
        ${renderToc(entry.headings, strings)}
    </aside>
</div>
</body>
</html>
`;
}

function renderLanding() {
    return `<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>Nowluma 文档 / Documentation</title>
    <meta name="description" content="Nowluma bilingual documentation: install, first start, console pages, settings, data and troubleshooting.">
    <link rel="icon" type="image/svg+xml" href="assets/nowluma-mark.svg">
    <link rel="stylesheet" href="assets/style.css">
</head>
<body class="landing">
<a class="skip-link" href="#main">跳到正文 / Skip to content</a>
<main class="landing-main" id="main">
    <header class="landing-hero">
        <img class="landing-mark" src="assets/nowluma-mark.svg" alt="" width="48" height="48">
        <p class="eyebrow">Nowluma</p>
        <h1><span lang="zh-CN">Nowluma 文档</span><span class="landing-slash" aria-hidden="true">/</span><span lang="en">Documentation</span></h1>
        <p class="lede" lang="zh-CN">面向初次使用者的完整中文文档：安装、首次启动、控制台每个页面、设置项、数据持久化与排障。</p>
        <p class="lede" lang="en">The complete English guide for first-time users: install, first start, every console page, settings, data persistence and troubleshooting.</p>
    </header>
    <div class="landing-cards">
        <a class="card" href="zh/index.html" lang="zh-CN">
            <h2>中文文档</h2>
            <p>18 章：安装、首次启动、总览、QQ 连接、节点配置、日志、调试、设置、数据与排障。</p>
            <span>开始阅读 →</span>
        </a>
        <a class="card" href="en/index.html" lang="en">
            <h2>English documentation</h2>
            <p>18 chapters: install, first start, overview, QQ connection, endpoints, logs, debug, settings, data and troubleshooting.</p>
            <span>Start reading →</span>
        </a>
        <a class="card" href="demo/" data-demo-link lang="zh-CN">
            <h2>模拟练习 / Practice demo</h2>
            <p>用控制台组件和模拟数据练习操作，不连接真实 QQ。模拟结果不能证明真实环境的行为。</p>
            <p lang="en">Practise with console components and simulated data. No real QQ connection; simulated results prove nothing about a real account.</p>
            <span>打开静态演示 →</span>
        </a>
    </div>
    <p class="landing-note" lang="zh-CN">这是从仓库内容生成的静态站点；只有部署到你自己的主机后，才会通过网页访问。页面不加载第三方脚本。</p>
    <p class="landing-note" lang="en">This static site is generated from repository content. It becomes reachable on the web only after you deploy it. The pages load no third-party scripts.</p>
</main>
</body>
</html>
`;
}

function searchText(body) {
    return plainText(
        body
            .split(/\r?\n/)
            .filter((line) => !/^```/.test(line))
            .map((line) => line.replace(/\|/g, ' '))
            .join('\n')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^>\s?/gm, ''),
    )
        .replace(/\s+/g, ' ')
        .slice(0, 3000);
}

function readChapters(lang, contentRoot) {
    const directory = path.join(contentRoot, lang);
    const files = fs.readdirSync(directory).filter((file) => file.endsWith('.md')).sort();
    const expected = [...CHAPTERS].sort();
    if (JSON.stringify(files) !== JSON.stringify(expected)) {
        throw new Error(
            `docs/content/${lang} must contain exactly the ${CHAPTERS.length} chapters.\nExpected: ${expected.join(', ')}\nFound: ${files.join(', ')}`,
        );
    }

    const locale = LOCALES[lang];
    return CHAPTERS.map((file) => {
        const source = fs.readFileSync(path.join(directory, file), 'utf8');
        const { data, body } = parseFrontmatter(source);
        if (!data.title || !data.description) {
            throw new Error(`docs/content/${lang}/${file}: frontmatter needs both title and description`);
        }

        const page = file.replace(/\.md$/, '');
        const rendered = renderMarkdown(body, { strings: locale.strings });
        return {
            page,
            file,
            title: data.title,
            description: data.description,
            navLabel: navLabel(data.title),
            html: rendered.html,
            headings: rendered.headings,
            searchText: searchText(body),
        };
    });
}

export function buildSite({ outDir = path.join(ROOT, '_site'), contentRoot = path.join(ROOT, 'docs/content'), siteRoot = path.join(ROOT, 'docs/site') } = {}) {
    for (const asset of ['style.css', 'site.js']) {
        if (!fs.existsSync(path.join(siteRoot, asset))) {
            throw new Error(`docs/site/${asset} is missing`);
        }
    }

    const chaptersByLocale = {};
    for (const lang of Object.keys(LOCALES)) {
        chaptersByLocale[lang] = readChapters(lang, contentRoot);
    }

    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });

    fs.copyFileSync(path.join(siteRoot, 'style.css'), path.join(outDir, 'assets', 'style.css'));
    fs.copyFileSync(path.join(siteRoot, 'site.js'), path.join(outDir, 'assets', 'site.js'));
    fs.copyFileSync(
        path.join(ROOT, 'packages/webui/src/assets/nowluma-mark.svg'),
        path.join(outDir, 'assets', 'nowluma-mark.svg'),
    );

    const searchEntries = [];
    let pages = 0;

    for (const [lang, chapters] of Object.entries(chaptersByLocale)) {
        const locale = LOCALES[lang];
        fs.mkdirSync(path.join(outDir, lang), { recursive: true });
        for (const entry of chapters) {
            fs.writeFileSync(path.join(outDir, lang, `${entry.page}.html`), renderPage(locale, entry, chapters));
            pages += 1;
            searchEntries.push({
                lang,
                page: entry.page,
                title: entry.title,
                description: entry.description,
                headings: entry.headings
                    .filter((heading) => heading.level === 2 || heading.level === 3)
                    .map((heading) => heading.text),
                text: entry.searchText,
            });
        }
    }

    fs.writeFileSync(
        path.join(outDir, 'assets', 'search.json'),
        `${JSON.stringify({ version: 1, entries: searchEntries }, null, 2)}\n`,
    );
    fs.writeFileSync(path.join(outDir, 'index.html'), renderLanding());

    return { outDir, pages, searchEntries: searchEntries.length };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
    const result = buildSite();
    console.log(
        `docs: built ${result.pages} pages and ${result.searchEntries} search entries into ${path.relative(ROOT, result.outDir) || result.outDir}`,
    );
}
