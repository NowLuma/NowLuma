/** Browser-safe URL validation; desktop URLs must never carry login credentials. */
export function normalizeVncUrl(value: unknown): string {
    if (typeof value !== 'string') {
        throw new TypeError('vncUrl must be a string');
    }

    const text = value.trim();

    if (!text) {
        return '';
    }

    if (text.length > 2048 || /[\\\s]/u.test(text) || text.startsWith('//')) {
        throw new TypeError('vncUrl must be an http(s) URL or a same-origin path');
    }

    const url = new URL(text, text.startsWith('/') ? 'http://localhost' : undefined);

    if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        [...url.searchParams.keys()].some((key) => /^(?:password|token|access_token)$/i.test(key))
    ) {
        throw new TypeError('vncUrl must use http(s) and must not contain credentials');
    }

    return text;
}

export function desktopLink(port: number, configuredUrl: string, pageUrl: string): string | null {
    const explicit = normalizeVncUrl(configuredUrl);

    if (explicit) {
        const url = new URL(explicit, pageUrl);
        url.username = '';
        url.password = '';
        return url.href;
    }

    if (port === 0) {
        return null;
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new TypeError('invalid desktop port');
    }

    const url = new URL(pageUrl);
    url.protocol = 'http:';
    url.port = String(port);
    url.pathname = '/vnc.html';
    url.search = '?autoconnect=true&resize=remote';
    url.hash = '';
    url.username = '';
    url.password = '';
    return url.href;
}
