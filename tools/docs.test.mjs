import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    CHAPTERS,
    LOCALES,
    buildSite,
    createSlugger,
    escapeHtml,
    parseFrontmatter,
    plainText,
    renderInline,
    renderMarkdown,
    slugify,
} from './build-docs.mjs';
import { checkSite, checkSources } from './check-docs.mjs';

test('slugify keeps CJK text and matches the anchors used by the content', () => {
    assert.equal(slugify(plainText('7. 忘记密码或丢失 2FA')), '7-忘记密码或丢失-2fa');
    assert.equal(slugify(plainText('通知选择（opt-in）')), '通知选择opt-in');
    assert.equal(slugify(plainText('QQ 的持久化与手动验证')), 'qq-的持久化与手动验证');
    assert.equal(slugify(plainText('内置状态命令 `#nl`')), '内置状态命令-nl');
    assert.equal(slugify(plainText('Every field in the node dialog')), 'every-field-in-the-node-dialog');
});

test('slugger de-duplicates repeated headings', () => {
    const slugger = createSlugger();
    assert.equal(slugger('Docker'), 'docker');
    assert.equal(slugger('Docker'), 'docker-1');
    assert.equal(slugger('Docker'), 'docker-2');
});

test('frontmatter parsing keeps title and description out of the body', () => {
    const { data, body } = parseFrontmatter('---\ntitle: 标题\ndescription: 描述\n---\n\n# 标题\n');
    assert.equal(data.title, '标题');
    assert.equal(data.description, '描述');
    assert.equal(body.trim(), '# 标题');
});

test('inline rendering escapes markup and rewrites chapter links', () => {
    assert.equal(escapeHtml('<b>&"'), '&lt;b&gt;&amp;&quot;');
    assert.equal(renderInline('`a < b`'), '<code>a &lt; b</code>');
    assert.equal(renderInline('**粗体**'), '<strong>粗体</strong>');
    assert.equal(renderInline('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
    assert.equal(
        renderInline('[节点配置](onebot-config.md#通知选择opt-in)'),
        '<a href="onebot-config.html#通知选择opt-in">节点配置</a>',
    );
    assert.equal(renderInline('[坏链接](javascript:alert(1))'), '[坏链接](javascript:alert(1))');
    assert.equal(renderInline('[外部](https://example.invalid/)'), '<a href="https://example.invalid/">外部</a>');
});

test('markdown rendering covers headings, tables, lists, quotes and code', () => {
    const { html, headings } = renderMarkdown(
        [
            '# 标题',
            '',
            '## 二级',
            '',
            '| 字段 | 说明 |',
            '| --- | --- |',
            '| `端口` | **5099** |',
            '',
            '1. 第一步',
            '   - 子项',
            '2. 第二步',
            '',
            '> 引用 **加粗**',
            '',
            '```bash',
            'bash <(curl https://example.invalid/x.sh)',
            '```',
        ].join('\n'),
        { strings: LOCALES.zh.strings },
    );

    assert.deepEqual(
        headings.map((heading) => heading.id),
        ['标题', '二级'],
    );
    assert.match(html, /<table><thead><tr><th scope="col">字段<\/th>/);
    assert.match(html, /<td><code>端口<\/code><\/td><td><strong>5099<\/strong><\/td>/);
    assert.match(html, /<ol><li>第一步<ul><li>子项<\/li><\/ul><\/li><li>第二步<\/li><\/ol>/);
    assert.match(html, /<blockquote><p>引用 <strong>加粗<\/strong><\/p><\/blockquote>/);
    assert.match(html, /<code class="language-bash">bash &lt;\(curl https:\/\/example.invalid\/x.sh\)<\/code>/);
    assert.match(html, /id="二级"/);
});

test('source content passes frontmatter, link, anchor and coverage checks', () => {
    assert.deepEqual(checkSources(), []);
});

test('build produces 18 chapters per language, a landing page and a search index', (t) => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nowluma-docs-'));
    t.after(() => fs.rmSync(outDir, { recursive: true, force: true }));

    const result = buildSite({ outDir });
    assert.equal(result.pages, CHAPTERS.length * 2);
    assert.equal(result.searchEntries, CHAPTERS.length * 2);

    for (const lang of Object.keys(LOCALES)) {
        for (const chapter of CHAPTERS) {
            const file = path.join(outDir, lang, chapter.replace(/\.md$/, '.html'));
            assert.ok(fs.existsSync(file), `${lang}/${chapter} should be built`);
        }
    }

    assert.ok(fs.existsSync(path.join(outDir, 'index.html')));
    for (const asset of ['style.css', 'site.js', 'search.json']) {
        assert.ok(fs.existsSync(path.join(outDir, 'assets', asset)), `assets/${asset} should be copied`);
    }

    const page = fs.readFileSync(path.join(outDir, 'zh', 'install-docker.html'), 'utf8');
    assert.match(page, /<html lang="zh-CN"/);
    assert.match(page, /aria-current="page"/);
    assert.match(page, /href="\.\.\/en\/install-docker\.html"/);
    assert.match(page, /data-search-input/);
    assert.match(page, /data-demo-link/);
    assert.doesNotMatch(page, /<访问密码>/);

    assert.deepEqual(checkSite({ outDir }), []);
});

test('the demo route is optional by default and required with withDemo', (t) => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nowluma-docs-demo-'));
    t.after(() => fs.rmSync(outDir, { recursive: true, force: true }));
    buildSite({ outDir });

    assert.deepEqual(checkSite({ outDir }), []);

    const demoDir = path.join(outDir, 'demo');
    fs.mkdirSync(demoDir);
    fs.writeFileSync(path.join(demoDir, 'index.html'), '<!doctype html><html lang="zh-CN"><title>demo</title></html>');
    assert.deepEqual(checkSite({ outDir, withDemo: true }), []);

    fs.rmSync(demoDir, { recursive: true, force: true });
    const problems = checkSite({ outDir, withDemo: true });
    assert.ok(problems.some((problem) => problem.includes('demo route')));
});
