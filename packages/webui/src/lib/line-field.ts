export type LineWidth = 1 | 2 | 3 | 4;

export function quantizeLineWidth(luminance: number): LineWidth {
    const light = Number.isFinite(luminance) ? Math.min(1, Math.max(0, luminance)) : 1;
    return (4 - Math.min(3, Math.floor(light * 4))) as LineWidth;
}

// An analytical N, sampled on an 8px grid. Line widths never interpolate.
export const LINE_FIELD = Array.from({ length: 18 * 6 }, (_, index) => {
    const column = index % 18;
    const row = Math.floor(index / 18);
    const x = (column + 0.5) / 18;
    const y = (row + 0.5) / 6;
    const distance = Math.min(
        Math.abs(x - 0.23),
        Math.abs(x - 0.77),
        Math.abs(x - (0.23 + 0.54 * y)),
    );
    return {
        x: column * 8 + 4,
        y: row * 8 + 1,
        width: quantizeLineWidth(distance / 0.12),
    };
});
