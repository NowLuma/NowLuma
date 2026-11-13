import { describe, expect, it } from 'vitest';
import { desktopLink, normalizeVncUrl } from '../src/desktop-url';

describe('desktop links', () => {
    it('keeps desktop access disabled unless configured', () => {
        expect(desktopLink(0, '', 'http://localhost:5099/')).toBeNull();
    });
    it('uses the browser-facing host and handles IPv6 without credentials or old query parameters', () => {
        expect(desktopLink(6080, '', 'http://user:pass@[::1]:5099/?token=private#logs')).toBe(
            'http://[::1]:6080/vnc.html?autoconnect=true&resize=remote',
        );
    });
    it('supports same-origin TLS reverse proxies without embedding any session token', () => {
        expect(
            desktopLink(
                0,
                '/desktop/vnc.html?path=desktop/websockify',
                'https://example.test/settings',
            ),
        ).toBe('https://example.test/desktop/vnc.html?path=desktop/websockify');
        expect(desktopLink(0, '/desktop/vnc.html', 'https://user:pass@example.test/')).toBe(
            'https://example.test/desktop/vnc.html',
        );
    });
    it('rejects unsafe URLs and out-of-range ports instead of returning an executable link', () => {
        for (const url of [
            'javascript:alert(1)',
            '//elsewhere.test',
            'https://user:pass@example.test',
            '/vnc.html?access_token=secret',
        ]) {
            expect(() => normalizeVncUrl(url)).toThrow();
        }

        for (const port of [-1, 65536, 1.5]) {
            expect(() => desktopLink(port, '', 'http://localhost/')).toThrow();
        }
    });
});
