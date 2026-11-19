export type LineWidth = 1 | 2 | 3 | 4;

export function quantizeLineWidth(luminance: number): LineWidth {
    const light = Number.isFinite(luminance) ? Math.min(1, Math.max(0, luminance)) : 1;
    return (4 - Math.min(3, Math.floor(light * 4))) as LineWidth;
}

/** Average source brightness per cell; transparent pixels are paper, not ink. */
export function sampleLineWidths(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    columns: number,
    rows: number,
): Uint8Array {
    if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        !Number.isInteger(columns) ||
        !Number.isInteger(rows) ||
        columns < 1 ||
        rows < 1 ||
        width < columns ||
        height < rows ||
        pixels.length !== width * height * 4
    ) {
        throw new RangeError('Invalid line-field raster or grid');
    }

    const result = new Uint8Array(columns * rows);
    const stride = width * 4;

    for (let row = 0; row < rows; row++) {
        const top = Math.floor((row * height) / rows);
        const bottom = Math.floor(((row + 1) * height) / rows);

        for (let column = 0; column < columns; column++) {
            const left = Math.floor((column * width) / columns);
            const right = Math.floor(((column + 1) * width) / columns);
            let brightness = 0;

            for (let y = top; y < bottom; y++) {
                for (let offset = y * stride + left * 4; offset < y * stride + right * 4; offset += 4) {
                    const alpha = pixels[offset + 3] / 255;
                    const light =
                        (pixels[offset] * 2126 +
                            pixels[offset + 1] * 7152 +
                            pixels[offset + 2] * 722) /
                        2_550_000;
                    brightness += 1 - alpha + light * alpha;
                }
            }

            result[row * columns + column] = quantizeLineWidth(
                brightness / ((right - left) * (bottom - top)),
            );
        }
    }

    return result;
}
