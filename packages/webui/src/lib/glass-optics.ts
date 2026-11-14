export interface GlassGeometry {
    width: number;
    height: number;
    radius: number;
    edge: number;
    displacement: number;
}

/** Optics are reserved for small chrome, never a full-page filter. */
export function glassGeometry(width: number, height: number, radius: number): GlassGeometry | null {
    if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        !Number.isFinite(radius) ||
        width <= 0 ||
        height <= 0 ||
        width > 768 ||
        height > 480
    ) {
        return null;
    }

    const shortSide = Math.min(width, height);
    return {
        width,
        height,
        radius: Math.min(Math.max(0, radius), shortSide / 2),
        edge: Math.min(16, shortSide / 4),
        displacement: Math.min(7, shortSide * 0.12),
    };
}

/** Rounded-rectangle normals and Snell's law; the reading centre stays flat. */
export function glassDisplacementAt(
    { width, height, radius, edge, displacement }: GlassGeometry,
    x: number,
    y: number,
) {
    const dx = x - width / 2;
    const dy = y - height / 2;
    const qx = Math.abs(dx) - (width / 2 - radius);
    const qy = Math.abs(dy) - (height / 2 - radius);
    const cx = Math.max(0, qx);
    const cy = Math.max(0, qy);
    const cornerLength = Math.hypot(cx, cy);
    const distance = cornerLength + Math.min(Math.max(qx, qy), 0) - radius;

    if (distance >= 0 || distance <= -edge) {
        return { x: 0, y: 0 };
    }

    const nx = cornerLength > 0 ? cx / cornerLength : qx > qy ? 1 : 0;
    const ny = cornerLength > 0 ? cy / cornerLength : qx > qy ? 0 : 1;
    const t = -distance / edge;
    const profile = Math.sqrt(t * (2 - t));
    const incident = Math.atan((1 - t) / Math.max(0.001, profile));
    const refracted = Math.asin(Math.sin(incident) / 1.5);
    const bend = Math.min(displacement, Math.tan(incident - refracted) * profile * edge);
    return { x: Math.sign(dx) * nx * bend, y: Math.sign(dy) * ny * bend };
}

export function glassDisplacementMap(geometry: GlassGeometry) {
    // One CSS-pixel sample at most, with a bounded raster even for wide menus.
    const ratio = Math.min(1, 256 / Math.max(geometry.width, geometry.height));
    const width = Math.max(1, Math.ceil(geometry.width * ratio));
    const height = Math.max(1, Math.ceil(geometry.height * ratio));
    const scale = geometry.displacement * 2;
    const pixels = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const bend = glassDisplacementAt(
                geometry,
                ((x + 0.5) / width) * geometry.width,
                ((y + 0.5) / height) * geometry.height,
            );
            const index = (y * width + x) * 4;
            pixels[index] = Math.round(127.5 + (bend.x / scale) * 255);
            pixels[index + 1] = Math.round(127.5 + (bend.y / scale) * 255);
            pixels[index + 2] = 128;
            pixels[index + 3] = 255;
        }
    }

    return { width, height, scale, pixels };
}

export interface GlassEnvironment {
    userAgent: string;
    supportsBackdropFilter: boolean;
    reducedMotion: boolean;
    reducedTransparency: boolean;
    highContrast: boolean;
    hostManaged: boolean;
}

export function glassRenderer(environment: GlassEnvironment): 'refracted' | 'frosted' | 'solid' {
    if (environment.hostManaged || environment.highContrast || environment.reducedTransparency) {
        return 'solid';
    }

    // shortcut: CSS parsing cannot prove SVG backdrop rasterization, keep Safari/Firefox
    // on frost until a real page-backdrop renderer is available for those engines.
    const chromium =
        /(?:Chrome|Chromium|Edg)\/\d+/.test(environment.userAgent) &&
        !/iPhone|iPad|iPod/.test(environment.userAgent);
    return chromium && environment.supportsBackdropFilter && !environment.reducedMotion
        ? 'refracted'
        : 'frosted';
}
