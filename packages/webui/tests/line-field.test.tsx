import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LineField } from '../src/components/ui/line-field';
import { LINE_FIELD, quantizeLineWidth } from '../src/lib/line-field';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replaceAll("'", '"');

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
    it('samples the N into a bounded vertical grid with only four stroke widths', () => {
        expect(LINE_FIELD).toHaveLength(108);
        expect([...new Set(LINE_FIELD.map((line) => line.width))].sort()).toEqual([1, 2, 3, 4]);

        for (const line of LINE_FIELD) {
            expect(line.x - line.width / 2).toBeGreaterThanOrEqual(2);
            expect(line.x + line.width / 2).toBeLessThanOrEqual(142);
            expect(line.y).toBeGreaterThanOrEqual(1);
            expect(line.y + 6).toBeLessThan(48);
        }

        const markup = renderToStaticMarkup(<LineField />);
        expect(markup).toContain('aria-hidden="true"');
        expect(markup).toContain('focusable="false"');
        expect(markup.match(/<line /g)).toHaveLength(108);
        expect(markup.match(/vector-effect="non-scaling-stroke"/g)).toHaveLength(108);
        expect(markup).not.toContain('<image');
        expect(markup).not.toContain('data-line-motion');
    });

    it('opts into a continuous small drift only when requested', () => {
        expect(renderToStaticMarkup(<LineField animated />)).toContain('data-line-motion="true"');
        expect(css).toMatch(
            /\.ui-line-field\[data-line-motion="true"\] \.ui-line-field-lines\s*\{\s*animation: line-field-drift 24s ease-in-out infinite;/,
        );
        expect(css).toMatch(
            /@keyframes line-field-drift\s*\{\s*0%,\s*100%\s*\{\s*transform: translateX\(-2px\);/,
        );
        expect(css).toMatch(/50%\s*\{\s*transform: translateX\(2px\);/);
    });

    it('never drifts under either application motion switch or the OS preference', () => {
        expect(css).toMatch(
            /html\[data-reduce-motion="1"\] \.ui-line-field-lines,\s*html\[data-no-motion="1"\] \.ui-line-field-lines\s*\{\s*animation: none !important;\s*transform: none !important;/,
        );
        expect(css).toMatch(
            /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.ui-line-field-lines\s*\{\s*animation: none !important;\s*transform: none !important;/,
        );
    });
});
