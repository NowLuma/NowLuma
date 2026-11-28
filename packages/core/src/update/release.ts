import { assetName } from '@nowluma/common/release-assets';
import { parseVersion } from '@nowluma/common/semver';
import type { UpdateSourceConfig } from '@nowluma/common/update-source';
import {
    GITHUB_ORIGIN,
    RELEASE_API_ROOT,
    RELEASE_PATH,
    RELEASE_ROOT,
    releaseDownloadPath,
    sourceUrls,
} from './sources';

export { assetName } from '@nowluma/common/release-assets';

async function readText(response: Response, limit: number): Promise<string> {
    if (!response.body) {
        throw new Error('发布信息为空');
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;

    try {
        for (;;) {
            const { value, done } = await reader.read();

            if (done) {
                break;
            }

            size += value.length;

            if (size > limit) {
                await reader.cancel();
                throw new Error('发布信息过大');
            }

            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    return Buffer.concat(chunks).toString('utf8');
}

function attribute(tag: string, name: string): string | undefined {
    return new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'i')
        .exec(tag)?.[2]
        .replaceAll('&amp;', '&')
        .replaceAll('&#39;', "'")
        .replaceAll('&quot;', '"');
}

export function releaseChannel(current: string): 'stable' | 'preview' {
    return parseVersion(current)?.prerelease.length ? 'preview' : 'stable';
}

function versionFromTagUrl(href: string) {
    const relative = href.startsWith(`${GITHUB_ORIGIN}/`) ? href.slice(GITHUB_ORIGIN.length) : href;
    const prefix = `${RELEASE_PATH}/tag/v`;

    if (!relative.startsWith(prefix)) {
        return null;
    }

    try {
        return parseVersion(decodeURIComponent(relative.slice(prefix.length)));
    } catch {
        return null;
    }
}

export function parseLatestReleasePage(html: string) {
    const meta = html
        .match(/<meta\b[^>]*>/gi)
        ?.find((tag) => attribute(tag, 'property') === 'og:url');
    const canonical = meta && attribute(meta, 'content');

    if (!canonical) {
        throw new Error('发布页面缺少版本信息');
    }

    const parsed = versionFromTagUrl(canonical);

    if (!parsed || parsed.prerelease.length) {
        throw new Error('发布页面不是 Nowluma 正式版本');
    }

    return { tag_name: `v${parsed.raw}`, html_url: `${RELEASE_ROOT}/tag/v${parsed.raw}` };
}

/** Match the digest in the same asset row; never borrow a neighbouring asset's hash. */
export function parseReleaseAssetsPage(html: string, version: string) {
    const assets: { name: string; size: null; digest: string }[] = [];
    const expected = ['win32-x64', 'linux-x64', 'linux-arm64'].map((target) =>
        assetName(version, target),
    );

    for (const row of html.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) ?? []) {
        const links = row.match(/<a\b[^>]*>/gi) ?? [];
        const name = expected.find((candidate) => {
            const downloadPath = releaseDownloadPath(version, candidate);
            const downloadUrl = `${GITHUB_ORIGIN}${downloadPath}`;
            return links.some((link) => {
                const href = attribute(link, 'href');
                return href === downloadPath || href === downloadUrl;
            });
        });

        if (!name) {
            continue;
        }

        const digests = (row.match(/<clipboard-copy\b[^>]*>/gi) ?? [])
            .map((tag) => attribute(tag, 'value'))
            .filter((value): value is string =>
                Boolean(value && /^sha256:[a-f0-9]{64}$/.test(value)),
            );

        if (digests.length !== 1 || assets.some((asset) => asset.name === name)) {
            throw new Error('发布页面缺少唯一的文件校验信息');
        }

        // GitHub renders a rounded size in HTML. Verify the exact digest even
        // when a proxy streams the asset without Content-Length.
        assets.push({ name, size: null, digest: digests[0]! });
    }

    if (!assets.length) {
        throw new Error('发布页面没有可验证的更新包');
    }

    return { tag_name: `v${version}`, assets };
}

type RankedRelease = { version: NonNullable<ReturnType<typeof parseVersion>>; data: object };

// GitHub orders releases by date, not SemVer (rc.10 > rc.9, final > rc).
function newestPublished(releases: unknown[], best?: RankedRelease): RankedRelease | undefined {
    for (const item of releases) {
        if (
            !item ||
            typeof item !== 'object' ||
            !('tag_name' in item) ||
            typeof item.tag_name !== 'string' ||
            ('draft' in item && item.draft === true) ||
            ('published_at' in item && item.published_at === null)
        ) {
            continue;
        }

        const version = parseVersion(item.tag_name.trim().replace(/^v/, ''));

        if (version && (!best || version.compare(best.version) > 0)) {
            best = { version, data: item };
        }
    }

    return best;
}

function previewFromFeed(xml: string) {
    const entries = [];

    for (const [, entry] of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)) {
        const alternate = entry
            .match(/<link\b[^>]*>/gi)
            ?.find((link) => attribute(link, 'rel') === 'alternate');
        const version = alternate && versionFromTagUrl(attribute(alternate, 'href') ?? '');

        if (version) {
            entries.push({
                tag_name: `v${version.raw}`,
                html_url: `${RELEASE_ROOT}/tag/v${version.raw}`,
            });
        }
    }

    const newest = newestPublished(entries);

    if (!newest) {
        throw new Error('发行订阅中没有有效的公开版本');
    }

    return newest.data;
}

export interface ReleaseResult {
    data: unknown;
    fromPage: boolean;
}

export async function fetchRelease(
    query: 'stable' | 'preview' | { version: string },
    source: UpdateSourceConfig,
    userAgent = 'Nowluma',
    timeoutMs = 8_000,
): Promise<ReleaseResult> {
    const version = typeof query === 'object' ? query.version : undefined;
    let primaryError: unknown;

    try {
        const signal = AbortSignal.timeout(timeoutMs);
        const headers = {
            Accept: 'application/vnd.github+json',
            'User-Agent': userAgent,
            'X-GitHub-Api-Version': '2022-11-28',
        };
        let best: RankedRelease | undefined;

        for (let page = 1; ; page++) {
            const url =
                query === 'preview'
                    ? `${RELEASE_API_ROOT}?per_page=30&page=${page}`
                    : `${RELEASE_API_ROOT}/${version ? `tags/v${version}` : 'latest'}`;
            const response = await fetch(url, { headers, signal });

            if (!response.ok) {
                await response.body?.cancel();
                throw new Error(`GitHub ${response.status}`);
            }

            const data: unknown = JSON.parse(
                await readText(response, query === 'preview' ? 2 * 1024 * 1024 : 256 * 1024),
            );

            if (query !== 'preview') {
                return { data, fromPage: false };
            }

            if (!Array.isArray(data)) {
                throw new Error('GitHub 返回了无效的发行列表');
            }

            best = newestPublished(data, best);

            if (!response.headers.get('link')?.includes('rel="next"')) {
                if (!best) {
                    throw new Error('没有可用的公开发行版本');
                }

                return { data: best.data, fromPage: false };
            }
        }
    } catch (error) {
        primaryError = error;
    }

    const originalUrl = version
        ? `${RELEASE_ROOT}/expanded_assets/v${version}`
        : query === 'preview'
          ? `${RELEASE_ROOT}.atom`
          : `${RELEASE_ROOT}/latest`;
    const controller = new AbortController();

    try {
        // Mirrors may advertise available versions and deliver archive bytes.
        // Only GitHub may supply the digest used to authorize those bytes.
        const urls = version
            ? [originalUrl]
            : [...new Set([originalUrl, ...sourceUrls(originalUrl, source)])];
        const data = await Promise.any(
            urls.map(async (url) => {
                const response = await fetch(url, {
                    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]),
                });

                if (!response.ok) {
                    await response.body?.cancel();
                    throw new Error(`HTTP ${response.status}`);
                }

                const html = await readText(response, 1024 * 1024);
                return version
                    ? parseReleaseAssetsPage(html, version)
                    : query === 'preview'
                      ? previewFromFeed(html)
                      : parseLatestReleasePage(html);
            }),
        );
        return { data, fromPage: true };
    } catch (error) {
        const failures = error instanceof AggregateError ? error.errors : [error];
        const details = [primaryError, ...failures]
            .filter(Boolean)
            .map((failure: unknown) =>
                failure instanceof Error ? failure.message : String(failure),
            );
        const hint = version
            ? '无法从 GitHub 获取官方更新校验信息'
            : '请在更新来源中检测或指定可用镜像';
        throw new Error(`${[...new Set(details)].join('；')}；${hint}`);
    } finally {
        controller.abort();
    }
}
