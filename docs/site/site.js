// Progressive enhancements for the generated docs: mobile navigation, copy
// buttons, TOC default and local search. Everything degrades without JS.
/* global document, window */
(() => {
    'use strict';

    const body = document.body;

    // Mobile chapter navigation.
    const menuButton = document.querySelector('[data-menu-toggle]');
    const sidebar = document.getElementById('sidebar');
    const menuOpen = () => body.hasAttribute('data-menu-open');
    const setMenu = (open, focusButton = false) => {
        body.toggleAttribute('data-menu-open', open);
        menuButton?.setAttribute('aria-expanded', String(open));
        if (open) {
            sidebar?.querySelector('a')?.focus();
        } else if (focusButton) {
            menuButton?.focus();
        }
    };

    menuButton?.addEventListener('click', () => setMenu(!menuOpen()));
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && menuOpen()) {
            setMenu(false, true);
        }
    });

    // Copy buttons for fenced code blocks.
    const copyLabel = body.dataset.copyLabel || 'Copy code';
    const copiedLabel = body.dataset.copiedLabel || 'Copied';
    const failedLabel = body.dataset.copyFailedLabel || 'Copy failed';

    for (const block of document.querySelectorAll('.code-block')) {
        const pre = block.querySelector('pre');
        if (!pre) {
            continue;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'copy-button';
        button.textContent = copyLabel;
        button.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(pre.innerText);
                button.textContent = copiedLabel;
            } catch {
                button.textContent = failedLabel;
            }
            window.setTimeout(() => {
                button.textContent = copyLabel;
            }, 2000);
        });
        block.append(button);
    }

    // The table of contents starts collapsed on narrow screens.
    const toc = document.querySelector('[data-toc]');
    if (toc && window.matchMedia('(min-width: 82rem)').matches) {
        toc.open = true;
    }

    // Local search over the generated index.
    const search = document.querySelector('[data-search]');
    if (!search) {
        return;
    }

    const input = search.querySelector('[data-search-input]');
    const results = search.querySelector('[data-search-results]');
    const status = search.querySelector('[data-search-status]');
    const locale = document.documentElement.dataset.locale || 'zh';
    const emptyText = search.dataset.emptyText || 'No matching chapters';
    const failedText = search.dataset.failedText || 'Search index failed to load.';
    const resultsText = search.dataset.resultsText || '{n} results';
    let entries = null;
    let loading = null;
    let lastQuery = '';

    const item = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text) {
            node.textContent = text;
        }
        return node;
    };

    const load = () => {
        if (entries || loading) {
            return loading;
        }

        loading = fetch(search.dataset.index, { cache: 'force-cache' })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`search index: ${response.status}`);
                }
                return response.json();
            })
            .then((data) => {
                entries = Array.isArray(data.entries) ? data.entries : [];
                return entries;
            })
            .catch(() => {
                status.textContent = failedText;
                results.hidden = false;
                results.replaceChildren(item('li', 'search-empty', failedText));
                return null;
            });

        return loading;
    };

    const render = (query) => {
        const needle = query.toLowerCase();
        const matches = [];

        for (const entry of entries) {
            if (entry.lang !== locale) {
                continue;
            }

            let score = 0;
            if (entry.title.toLowerCase().includes(needle)) {
                score += 6;
            }
            if (entry.description.toLowerCase().includes(needle)) {
                score += 3;
            }
            if (entry.headings.some((heading) => heading.toLowerCase().includes(needle))) {
                score += 2;
            }
            if (entry.text.toLowerCase().includes(needle)) {
                score += 1;
            }

            if (score > 0) {
                matches.push({ entry, score });
            }
        }

        matches.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));
        results.replaceChildren();

        if (!matches.length) {
            results.hidden = false;
            results.append(item('li', 'search-empty', emptyText));
            status.textContent = '';
            return;
        }

        for (const { entry } of matches.slice(0, 8)) {
            const heading = entry.headings.find((candidate) => candidate.toLowerCase().includes(needle));
            const link = item('a');
            link.href = `../${entry.lang}/${entry.page}.html`;
            link.append(item('span', 'search-result-title', entry.title));
            link.append(item('span', 'search-result-meta', heading || entry.description));
            const row = item('li');
            row.append(link);
            results.append(row);
        }

        results.hidden = false;
        status.textContent = resultsText.replace('{n}', String(matches.length));
    };

    const update = () => {
        lastQuery = input.value.trim();

        if (!lastQuery) {
            results.hidden = true;
            results.replaceChildren();
            status.textContent = '';
            return;
        }

        if (!entries) {
            load().then((loaded) => {
                if (loaded && input.value.trim() === lastQuery) {
                    render(lastQuery);
                }
            });
            return;
        }

        render(lastQuery);
    };

    input.addEventListener('input', update);
    input.addEventListener('focus', load);
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            input.value = '';
            update();
            input.blur();
        }
        if (event.key === 'ArrowDown' && !results.hidden) {
            event.preventDefault();
            results.querySelector('a')?.focus();
        }
    });

    results.addEventListener('keydown', (event) => {
        const links = [...results.querySelectorAll('a')];
        const current = links.indexOf(document.activeElement);
        if (current < 0) {
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            links[Math.min(current + 1, links.length - 1)]?.focus();
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (current === 0) {
                input.focus();
            } else {
                links[current - 1]?.focus();
            }
        }
        if (event.key === 'Escape') {
            input.focus();
            input.value = '';
            update();
        }
    });

    document.addEventListener('click', (event) => {
        if (!search.contains(event.target)) {
            results.hidden = true;
        }
    });
})();
