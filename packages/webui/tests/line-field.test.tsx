import { describe, expect, it } from 'vitest';
import { quantizeLineWidth, sampleLineWidths } from '../src/lib/line-field';

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

describe('source-brightness line field', () => {
    const raster = (...grays: number[]) =>
        new Uint8ClampedArray(grays.flatMap((gray) => [gray, gray, gray, 255]));

    it('samples each row and column from the image, rather than assigning widths by column position', () => {
        const pixels = raster(0, 255, 64, 128);
        expect([...sampleLineWidths(pixels, 2, 2, 2, 2)]).toEqual([4, 1, 3, 2]);
        expect([...sampleLineWidths(raster(255, 0, 128, 64), 2, 2, 2, 2)]).toEqual([
            1, 4, 2, 3,
        ]);
    });

    it('averages all source pixels covered by a cell, including uneven edge partitions', () => {
        expect([...sampleLineWidths(raster(0, 0, 255, 255, 255, 255), 3, 2, 2, 1)]).toEqual([
            2, 1,
        ]);
    });

    it('composites transparent source pixels onto paper instead of reconstructing transparent black as ink', () => {
        const pixels = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 128]);
        expect([...sampleLineWidths(pixels, 2, 1, 2, 1)]).toEqual([1, 3]);
    });

    it('rejects a truncated raster or empty cells instead of displaying a misleading source', () => {
        expect(() => sampleLineWidths(raster(0), 2, 1, 2, 1)).toThrow(RangeError);
        expect(() => sampleLineWidths(raster(0), 1, 1, 2, 1)).toThrow(RangeError);
    });
});

