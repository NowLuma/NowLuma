import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LineField } from '../src/components/ui/line-field';
import { LINE_FIELD, quantizeLineWidth } from '../src/lib/line-field';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replaceAll("'", '"');
const workspaceCss = readFileSync(
    new URL('../src/styles/workspace.css', import.meta.url),
    'utf8',
).replaceAll("'", '"');

describe('quantizeLineWidth', () => {
    it.each([
        [0, 4],
        [0.249, 4],
        [0.25, 3],
        [0.499, 3],
        [0.5, 2],
        [0.749, 2],
        [0.75, 1],
        [1, 1],
        [-1, 4],
        [2, 1],
        [NaN, 1],
        [Infinity, 1],
    ])('maps luminance %s to the discrete %spx stroke', (luminance, width) => {
        expect(quantizeLineWidth(luminance)).toBe(width);
    });
});

describe('LineField', () => {
    it('renders a finite fine lattice through the canonical mark, not another coarse analytical N', () => {
        expect(LINE_FIELD).toHaveLength(48);
        expect([...new Set(LINE_FIELD.map((line) => line.width))].sort()).toEqual([1, 2, 3, 4]);

        for (const line of LINE_FIELD) {
            expect(line.x - line.width / 2).toBeGreaterThanOrEqual(0);
            expect(line.x + line.width / 2).toBeLessThanOrEqual(192);
        }

        const markup = renderToStaticMarkup(<LineField />);
        expect(markup).toContain('aria-hidden="true"');
        expect(markup).toContain('focusable="false"');
        expect(markup).toContain('viewBox="0 0 192 192"');
        expect(markup).toContain('mask-type:alpha');
        expect(markup).toContain('<image href=');
        expect(markup.match(/<line /g)).toHaveLength(48);
        expect(markup.match(/vector-effect="non-scaling-stroke"/g)).toHaveLength(48);
        expect(markup).not.toContain('data-line-motion');
    });

    it('uses independent mask IDs when shared surfaces render more than one identity', () => {
        const html = renderToStaticMarkup(
            <>
                <LineField />
                <LineField />
            </>,
        );
        const ids = [...html.matchAll(/<mask id="([^"]+)"/g)].map((match) => match[1]);
        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);

        for (const id of ids) {
            expect(html).toContain(`mask="url(#${id})"`);
        }
    });

    it('only opts into calm continuous movement when explicitly requested', () => {
        expect(renderToStaticMarkup(<LineField animated />)).toContain('data-line-motion="true"');
        expect(css).toMatch(
            /\.ui-line-field\[data-line-motion="true"\] \.ui-line-field-lines\s*\{\s*animation: line-field-drift 24s ease-in-out infinite;/,
        );
        expect(workspaceCss).toContain(
            'animation: workspace-stream-glide 10s ease-in-out infinite;',
        );
        expect(workspaceCss).toContain('transform: translate(-3px, 2px);');
        expect(workspaceCss).toContain('transform: translate(3px, -2px);');
    });

    it('stops movement for application switches, the OS preference and the low rendering budget', () => {
        expect(css).toMatch(
            /html\[data-reduce-motion="1"\] \.ui-line-field-lines,\s*html\[data-no-motion="1"\] \.ui-line-field-lines\s*\{\s*animation: none !important;\s*transform: none !important;/,
        );
        expect(css).toMatch(
            /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.ui-line-field-lines\s*\{\s*animation: none !important;\s*transform: none !important;/,
        );
        expect(workspaceCss).toContain('html[data-low-performance="1"] .workspace-auth-stream');
        expect(workspaceCss).toContain('transition-duration: 0ms !important;');
    });
});
