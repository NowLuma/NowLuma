export type LineWidth = 1 | 2 | 3 | 4;

export function quantizeLineWidth(luminance: number): LineWidth {
    const light = Number.isFinite(luminance) ? Math.min(1, Math.max(0, luminance)) : 1;
    return (4 - Math.min(3, Math.floor(light * 4))) as LineWidth;
}

// A finite, centre-weighted lattice; the canonical SVG supplies the silhouette.
export const LINE_FIELD = Array.from({ length: 48 }, (_, column) => ({
    x: column * 4 + 2,
    width: quantizeLineWidth(Math.abs((column + 0.5) / 48 - 0.5) * 2),
}));
