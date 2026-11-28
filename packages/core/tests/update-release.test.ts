import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UpdateSourceConfig } from '@nowluma/common/update-source';
import {
    fetchRelease,
    parseLatestReleasePage,
    parseReleaseAssetsPage,
} from '../src/update/release';

const direct: UpdateSourceConfig = { mode: 'direct', mirror: '', mirrors: [] };
const latest =
    '<meta property="og:url" content="https://github.com/NowLuma/NowLuma/releases/tag/v2.0.1">';
const digest = `sha256:${'a'.repeat(64)}`;
const name = 'Nowluma-v2.0.1-win-x64-lite.zip';
const assetPath = `/NowLuma/NowLuma/releases/download/v2.0.1/${name}`;
const row = `<li><a href="${assetPath}">${name}</a><clipboard-copy value="${digest}"></clipboard-copy></li>`;

afterEach(() => vi.unstubAllGlobals());

describe('existing GitHub release pages', () => {
    it('reads the canonical stable release without a new metadata asset', () => {
        expect(parseLatestReleasePage(latest)).toEqual({
            tag_name: 'v2.0.1',
            html_url: 'https://github.com/NowLuma/NowLuma/releases/tag/v2.0.1',
        });
        expect(parseLatestReleasePage(latest.replace('https://github.com', '')).tag_name).toBe(
            'v2.0.1',
        );
    });

    it.each([
        '<html>please sign in</html>',
        latest.replace('github.com', 'unrelated.example'),
        latest.replace('/NowLuma/NowLuma/', '/other/NowLuma/'),
        latest.replace('/NowLuma/NowLuma/', '/NowLuma/other/'),
        latest.replace('/NowLuma/NowLuma/', '/WSXYT/Nowluma/'),
        latest.replace('/NowLuma/NowLuma/', '/nowluma/nowluma/'),
        latest.replace('/tag/v2.0.1', ''),
        latest.replace('v2.0.1', 'v2.0.1/extra'),
        latest.replace('v2.0.1', 'v02.0.1'),
        latest.replace('v2.0.1', 'v2.0.1-rc.1'),
    ])('rejects non-release or invalid version pages', (html) => {
        expect(() => parseLatestReleasePage(html)).toThrow();
    });

    it.each(['', 'https://github.com'])(
        'matches an asset and digest in the same row with URL origin %j',
        (origin) => {
            const html = row.replace(assetPath, `${origin}${assetPath}`);
            expect(parseReleaseAssetsPage(html, '2.0.1')).toEqual({
                tag_name: 'v2.0.1',
                assets: [{ name, size: null, digest }],
            });
        },
    );

    it.each([
        '/other/NowLuma',
        '/NowLuma/other',
        '/WSXYT/Nowluma',
        '/nowluma/nowluma',
        'https://other.example/NowLuma/NowLuma',
    ])('rejects an otherwise matching asset from %s', (repository) => {
        const html = row.replace('/NowLuma/NowLuma', repository);
        expect(() => parseReleaseAssetsPage(html, '2.0.1')).toThrow('没有可验证的更新包');
    });

    it.each([
        row.replace('v2.0.1/', 'v2.0.0/'),
        row.replaceAll('Nowluma-v', 'NowLuma-v'),
        row.replace(digest, 'unavailable'),
        row + row,
        row.replace(`<clipboard-copy value="${digest}"></clipboard-copy>`, '') +
            `<li><clipboard-copy value="${digest}"></clipboard-copy></li>`,
    ])('rejects a wrong tag/name or missing, ambiguous or neighbouring checksums', (html) => {
        expect(() => parseReleaseAssetsPage(html, '2.0.1')).toThrow();
    });

    it('falls back from API 403 to the existing release page', async () => {
        const fetchMock = vi.fn<typeof fetch>(async (url) =>
            String(url).includes('api.github.com')
                ? new Response('rate limited', { status: 403 })
                : new Response(latest),
        );
        vi.stubGlobal('fetch', fetchMock);
        expect(await fetchRelease('stable', direct)).toMatchObject({
            fromPage: true,
            data: { tag_name: 'v2.0.1' },
        });
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            'https://api.github.com/repos/NowLuma/NowLuma/releases/latest',
            'https://github.com/NowLuma/NowLuma/releases/latest',
        ]);
    });

    it('does not authorize a download with a mirror-supplied checksum', async () => {
        const fetchMock = vi.fn<typeof fetch>(async (input) =>
            String(input).startsWith('https://files.example/')
                ? new Response(row)
                : new Response('unavailable', { status: 503 }),
        );
        vi.stubGlobal('fetch', fetchMock);
        await expect(
            fetchRelease(
                { version: '2.0.1' },
                { mode: 'mirror', mirror: 'https://files.example', mirrors: [] },
            ),
        ).rejects.toThrow('无法从 GitHub 获取官方更新校验信息');
        expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).host)).toEqual([
            'api.github.com',
            'github.com',
        ]);
    });

    it('keeps direct release lookup when the pinned download mirror cannot serve pages', async () => {
        const fetchMock = vi.fn<typeof fetch>(async (url) =>
            String(url) === 'https://github.com/NowLuma/NowLuma/releases/latest'
                ? new Response(latest)
                : new Response('blocked', { status: 403 }),
        );
        vi.stubGlobal('fetch', fetchMock);
        expect(
            await fetchRelease('stable', {
                ...direct,
                mode: 'mirror',
                mirror: 'https://files.example',
            }),
        ).toMatchObject({ data: { tag_name: 'v2.0.1' } });
    });

    it('can discover the next RC from the public feed when the API is rate-limited', async () => {
        const feed = [
            'https://other.example/NowLuma/NowLuma/releases/tag/v9.0.0',
            'https://github.com/NowLuma/NowLuma/releases/tag/v2.5.0-rc.9',
            'https://github.com/NowLuma/NowLuma/releases/tag/v2.5.0-rc.10',
        ]
            .map((href) => `<entry><link rel="alternate" href="${href}"/></entry>`)
            .join('');
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url) =>
                String(url).endsWith('/releases.atom')
                    ? new Response(`<feed>${feed}</feed>`)
                    : new Response(null, { status: 403 }),
            ),
        );
        expect(await fetchRelease('preview', direct)).toMatchObject({
            fromPage: true,
            data: { tag_name: 'v2.5.0-rc.10' },
        });
    });

    it('rejects oversized release responses', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('x'.repeat(1024 * 1024 + 1))),
        );
        await expect(fetchRelease('stable', direct)).rejects.toThrow('发布信息过大');
    });
});
