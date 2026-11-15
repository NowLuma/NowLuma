import { describe, expect, it } from 'vitest';
import {
    glassDisplacementAt,
    glassDisplacementMap,
    glassGeometry,
    glassRenderer,
    type GlassEnvironment,
} from '../src/lib/glass-optics';

const environment: GlassEnvironment = {
    userAgent: 'Mozilla/5.0 Chrome/142.0.0.0 Safari/537.36',
    supportsBackdropFilter: true,
    lowCost: false,
    reducedTransparency: false,
    highContrast: false,
    hostManaged: false,
};

describe('glassGeometry', () => {
    it.each([
        [0, 44, 22],
        [44, -1, 22],
        [224, 481, 22],
        [1200, 600, 22],
        [NaN, 44, 22],
        [44, Infinity, 22],
        [44, 44, NaN],
    ])('rejects an empty, invalid or full-page surface (%s × %s)', (width, height, radius) => {
        expect(glassGeometry(width, height, radius)).toBeNull();
    });

    it('allows wide, short chrome while keeping the raster bounded', () => {
        expect(glassGeometry(1600, 64, 22)).toMatchObject({ width: 1600, height: 64 });
        expect(glassGeometry(769, 44, 22)).toMatchObject({ width: 769, height: 44 });
        expect(glassGeometry(1920, 480, 22)).toBeNull();
    });

    it('clamps capsule radius, edge band and displacement to the actual control', () => {
        const capsule = glassGeometry(132, 44, 9999)!;
        expect(capsule).toMatchObject({ width: 132, height: 44, radius: 22, edge: 11 });
        expect(capsule.displacement).toBeCloseTo(5.28);
        expect(glassGeometry(768, 480, -1)).toMatchObject({ radius: 0, edge: 16, displacement: 7 });
    });
});

describe('glassDisplacementAt', () => {
    const geometry = glassGeometry(200, 48, 9999)!;

    it('keeps the centre, exterior and flat inner edge neutral', () => {
        expect(glassDisplacementAt(geometry, 100, 24)).toEqual({ x: 0, y: 0 });
        expect(glassDisplacementAt(geometry, 0, 0)).toEqual({ x: 0, y: 0 });
        expect(glassDisplacementAt(geometry, 100, geometry.edge)).toEqual({ x: 0, y: 0 });
    });

    it('bends opposite edges symmetrically with rounded-corner normals', () => {
        const left = glassDisplacementAt(geometry, 3, 24);
        const right = glassDisplacementAt(geometry, 197, 24);
        expect(left.x).toBeLessThan(-1);
        expect(right.x).toBeCloseTo(-left.x);
        expect(left.y).toBe(0);
        expect(right.y).toBe(0);
        const corner = glassDisplacementAt(geometry, 9, 9);
        expect(corner.x).toBeLessThan(0);
        expect(corner.x).toBeCloseTo(corner.y);
    });

    it('settles continuously into the flat centre and bounds every sampled vector', () => {
        const nearCentre = glassDisplacementAt(geometry, 100, geometry.edge - 0.001);
        expect(Math.abs(nearCentre.y)).toBeLessThan(0.001);

        for (let y = 0; y <= geometry.height; y += 2) {
            for (let x = 0; x <= geometry.width; x += 4) {
                const bend = glassDisplacementAt(geometry, x, y);
                expect(Number.isFinite(bend.x + bend.y)).toBe(true);
                expect(Math.hypot(bend.x, bend.y)).toBeLessThanOrEqual(
                    geometry.displacement + 1e-9,
                );
            }
        }
    });
});

describe('glassDisplacementMap', () => {
    it('encodes a neutral centre and non-neutral edge in a bounded opaque raster', () => {
        const geometry = glassGeometry(768, 480, 22)!;
        const map = glassDisplacementMap(geometry);
        expect(map.width).toBe(256);
        expect(map.height).toBe(160);
        expect(map.pixels).toHaveLength(map.width * map.height * 4);
        expect(map.scale).toBe(14);
        const centre = (80 * map.width + 128) * 4;
        expect([...map.pixels.slice(centre, centre + 4)]).toEqual([128, 128, 128, 255]);
        // The production feComponentTransfer removes this 8-bit half-step offset.
        expect((map.pixels[centre] / 255 - 0.5 / 255 - 0.5) * map.scale).toBe(0);
        expect(map.pixels[80 * map.width * 4]).toBeLessThan(128);

        for (let index = 3; index < map.pixels.length; index += 4) {
            expect(map.pixels[index]).toBe(255);
        }
    });

    it('is deterministic, including fractional CSS-pixel dimensions', () => {
        const geometry = glassGeometry(132.5, 44.5, 22.25)!;
        expect(glassDisplacementMap(geometry)).toEqual(glassDisplacementMap(geometry));
    });
});

describe('glassRenderer', () => {
    it.each(['Chrome/142.0', 'Chromium/142.0', 'Edg/142.0'])(
        'installs SVG refraction for supported %s',
        (userAgent) => {
            expect(glassRenderer({ ...environment, userAgent })).toBe('refracted');
        },
    );

    it.each([
        'Mozilla/5.0 Version/18.0 Safari/605.1.15',
        'Mozilla/5.0 Firefox/142.0',
        'Mozilla/5.0 (iPhone) CriOS/142.0 Safari/604.1',
        'Mozilla/5.0 (iPad) Chrome/142.0 Safari/604.1',
    ])('does not equate blur support with SVG backdrop support (%s)', (userAgent) => {
        expect(glassRenderer({ ...environment, userAgent })).toBe('frosted');
    });

    it('uses frost for unsupported backdrops and the low-performance budget', () => {
        expect(glassRenderer({ ...environment, supportsBackdropFilter: false })).toBe('frosted');
        expect(glassRenderer({ ...environment, lowCost: true })).toBe('frosted');
    });

    it.each(['highContrast', 'reducedTransparency', 'hostManaged'] as const)(
        'uses an opaque, non-refractive surface for %s',
        (setting) => {
            expect(glassRenderer({ ...environment, [setting]: true })).toBe('solid');
        },
    );
});
