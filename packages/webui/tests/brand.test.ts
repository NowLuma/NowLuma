import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRAND_LOGO_URL } from '../src/brand';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const mark = read('../src/assets/nowluma-mark.svg');
const indexHtml = read('../index.html');
const demoHtml = read('../demo.html');
const logoConsumers = [
    'src/components/layout/sidebar.tsx',
    'src/components/pages/login-page.tsx',
    'src/components/pages/settings-page.tsx',
].map((file) => read(`../${file}`));

describe('brand assets', () => {
    it('resolves the one canonical mark through Vite in every consumer', () => {
        const resolved = BRAND_LOGO_URL.startsWith('data:image/svg+xml,')
            ? decodeURIComponent(BRAND_LOGO_URL.slice('data:image/svg+xml,'.length))
            : readFileSync(new URL(BRAND_LOGO_URL, import.meta.url), 'utf8');
        expect(resolved).toContain('M14 50V14L46 50V18');

        for (const source of logoConsumers) {
            expect(source).toContain('BRAND_LOGO_URL');
            expect(source).not.toContain('/logo.png');
        }
    });

    it('keeps the mark self-contained and legible at small sizes', () => {
        expect(mark).toContain('viewBox="0 0 64 64"');
        expect(mark).toContain('stroke-width="7"');
        const body = mark.replace('xmlns="http://www.w3.org/2000/svg"', '');

        for (const forbidden of [
            '<script',
            '<foreignObject',
            '<image',
            '<style',
            'http://',
            'https://',
            '@import',
            '<text',
        ]) {
            expect(body).not.toContain(forbidden);
        }
    });

    it('keeps a 180px Apple touch fallback', () => {
        const png = readFileSync(new URL('../public/apple-touch-icon.png', import.meta.url));
        expect(png.readUInt32BE(16)).toBe(180);
        expect(png.readUInt32BE(20)).toBe(180);
    });

    it('uses the same mark for both entry favicons and a neutral initial theme colour', () => {
        for (const html of [indexHtml, demoHtml]) {
            expect(html).toContain('rel="icon"');
            expect(html).toContain('type="image/svg+xml"');
            expect(html).toContain('href="./src/assets/nowluma-mark.svg?inline"');
            expect(html).toContain('<meta name="theme-color" content="#ffffff" />');
            expect(html).not.toContain('/logo.png');
            expect(html).not.toContain('favicon.png');
        }

        expect(indexHtml).toContain("resolved === 'dark' ? '#0a0a0a' : '#ffffff'");
    });
});
