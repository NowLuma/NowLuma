import { useEffect, useId, useRef, useState, type HTMLAttributes } from 'react';
import { springValue } from 'motion';
import {
    glassDisplacementMap,
    glassGeometry,
    glassRenderer,
    type GlassGeometry,
} from '@/lib/glass-optics';
import { cn } from '@/lib/utils';

interface GlassImage {
    geometry: GlassGeometry;
    href: string;
    scale: number;
}

// Reopened menus reuse the same raster; resizing cannot grow this cache unbounded.
const GLASS_IMAGE_CACHE = new Map<string, GlassImage>();
const LIGHT_SPRING = { stiffness: 360, damping: 30, mass: 0.6 } as const;

function glassImage(geometry: GlassGeometry, key: string): GlassImage | null {
    const cached = GLASS_IMAGE_CACHE.get(key);

    if (cached) {
        return cached;
    }

    const map = glassDisplacementMap(geometry);
    const canvas = document.createElement('canvas');
    canvas.width = map.width;
    canvas.height = map.height;
    const context = canvas.getContext('2d');

    if (!context) {
        return null;
    }

    const pixels = context.createImageData(map.width, map.height);
    pixels.data.set(map.pixels);
    context.putImageData(pixels, 0, 0);
    const image = { geometry, href: canvas.toDataURL(), scale: map.scale };

    if (GLASS_IMAGE_CACHE.size >= 16) {
        GLASS_IMAGE_CACHE.delete(GLASS_IMAGE_CACHE.keys().next().value!);
    }

    GLASS_IMAGE_CACHE.set(key, image);
    return image;
}

/** Backdrop-only optics: labels, focus rings and business content are never filtered. */
export function GlassMaterial() {
    const ref = useRef<HTMLSpanElement>(null);
    const id = `glass-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const [material, setMaterial] = useState<{
        renderer: 'refracted' | 'frosted' | 'solid';
        image: GlassImage | null;
    }>({ renderer: 'frosted', image: null });
    const { image } = material;

    useEffect(() => {
        const element = ref.current;

        if (!element) {
            return;
        }

        const root = document.documentElement;
        const transparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
        const contrast = window.matchMedia('(forced-colors: active)');
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const surface = element.parentElement;
        const lightX = springValue<string>('42%', LIGHT_SPRING);
        const lightY = springValue<string>('0%', LIGHT_SPRING);
        const lightOpacity = springValue<number>(0, LIGHT_SPRING);
        element.style.setProperty('--glass-light-x', lightX.get());
        element.style.setProperty('--glass-light-y', lightY.get());
        element.style.setProperty('--glass-light-opacity', `${lightOpacity.get()}`);
        const removeLightX = lightX.on('change', (value) =>
            element.style.setProperty('--glass-light-x', value),
        );
        const removeLightY = lightY.on('change', (value) =>
            element.style.setProperty('--glass-light-y', value),
        );
        const removeLightOpacity = lightOpacity.on('change', (value) =>
            element.style.setProperty('--glass-light-opacity', `${value}`),
        );
        let targetLightX = 42;
        let targetLightY = 0;
        let targetOpacity = 0;

        const setLight = (x: number, y: number, opacity: number, immediate = false) => {
            if (immediate) {
                lightX.jump(`${x}%`);
                lightY.jump(`${y}%`);
                lightOpacity.jump(opacity);
            } else {
                if (targetLightX !== x) {
                    lightX.set(`${x}%`);
                }

                if (targetLightY !== y) {
                    lightY.set(`${y}%`);
                }

                if (targetOpacity !== opacity) {
                    lightOpacity.set(opacity);
                }
            }

            targetLightX = x;
            targetLightY = y;
            targetOpacity = opacity;
        };

        let pointerX = 0;
        let pointerY = 0;
        let pointerActive = false;
        let frame = 0;
        let previous = '';

        const update = () => {
            frame = 0;
            const lightAllowed =
                !motion.matches &&
                root.dataset.reduceMotion !== '1' &&
                root.dataset.noMotion !== '1' &&
                !root.hasAttribute('data-webui-target') &&
                !contrast.matches &&
                root.dataset.contrast !== 'high' &&
                !transparency.matches;

            if (surface && lightAllowed && pointerActive) {
                const bounds = surface.getBoundingClientRect();
                const x = Math.min(
                    1,
                    Math.max(0, (pointerX - bounds.left) / Math.max(1, bounds.width)),
                );
                const y = Math.min(
                    1,
                    Math.max(0, (pointerY - bounds.top) / Math.max(1, bounds.height)),
                );
                setLight(x * 100, y * 100, 1);
            } else if (surface && lightAllowed) {
                setLight(42, 0, 0);
            } else {
                setLight(42, 0, 0, true);
            }

            const renderer = glassRenderer({
                userAgent: navigator.userAgent,
                supportsBackdropFilter:
                    typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'url("#glass")'),
                lowCost: root.dataset.lowPerformance === '1',
                reducedTransparency: transparency.matches,
                highContrast: contrast.matches || root.dataset.contrast === 'high',
                hostManaged: root.hasAttribute('data-webui-target'),
            });
            const geometry =
                renderer === 'refracted'
                    ? glassGeometry(
                          element.offsetWidth,
                          element.offsetHeight,
                          parseFloat(getComputedStyle(element).borderTopLeftRadius),
                      )
                    : null;
            const key = geometry ? JSON.stringify(geometry) : renderer;

            if (key === previous) {
                return;
            }

            previous = key;

            if (!geometry) {
                setMaterial({
                    renderer: renderer === 'refracted' ? 'frosted' : renderer,
                    image: null,
                });
                return;
            }

            try {
                const image = glassImage(geometry, key);
                setMaterial({ renderer: image ? 'refracted' : 'frosted', image });
            } catch (error) {
                console.warn('[Nowluma glass] Refraction unavailable; using frost.', error);
                setMaterial({ renderer: 'frosted', image: null });
            }
        };

        const schedule = () => {
            if (!frame) {
                frame = requestAnimationFrame(update);
            }
        };

        const trackLight = (event: PointerEvent) => {
            if (
                event.pointerType === 'touch' ||
                motion.matches ||
                root.dataset.reduceMotion === '1' ||
                root.dataset.noMotion === '1' ||
                root.hasAttribute('data-webui-target')
            ) {
                return;
            }

            pointerX = event.clientX;
            pointerY = event.clientY;
            pointerActive = true;
            schedule();
        };

        const resetLight = () => {
            pointerActive = false;
            schedule();
        };

        surface?.addEventListener('pointerenter', trackLight, { passive: true });
        surface?.addEventListener('pointermove', trackLight, { passive: true });
        surface?.addEventListener('pointerleave', resetLight);

        const resize = new ResizeObserver(schedule);
        resize.observe(element);
        const preferences = new MutationObserver(schedule);
        preferences.observe(root, {
            attributes: true,
            attributeFilter: [
                'data-low-performance',
                'data-contrast',
                'data-webui-target',
                'style',
                'data-reduce-motion',
                'data-no-motion',
            ],
        });
        transparency.addEventListener('change', schedule);
        contrast.addEventListener('change', schedule);
        motion.addEventListener('change', schedule);
        update();

        return () => {
            cancelAnimationFrame(frame);
            removeLightX();
            removeLightY();
            removeLightOpacity();
            lightX.destroy();
            lightY.destroy();
            lightOpacity.destroy();
            resize.disconnect();
            preferences.disconnect();
            transparency.removeEventListener('change', schedule);
            contrast.removeEventListener('change', schedule);
            motion.removeEventListener('change', schedule);
            surface?.removeEventListener('pointerenter', trackLight);
            surface?.removeEventListener('pointermove', trackLight);
            surface?.removeEventListener('pointerleave', resetLight);
        };
    }, []);

    return (
        <span
            ref={ref}
            aria-hidden="true"
            className="ui-glass-material"
            data-glass-renderer={material.renderer}
            style={
                image
                    ? { backdropFilter: `url("#${id}")`, WebkitBackdropFilter: `url("#${id}")` }
                    : undefined
            }
        >
            {image && (
                <svg width="0" height="0" focusable="false" className="absolute">
                    <defs>
                        <filter
                            id={id}
                            x="0"
                            y="0"
                            width={image.geometry.width}
                            height={image.geometry.height}
                            filterUnits="userSpaceOnUse"
                            colorInterpolationFilters="sRGB"
                        >
                            <feImage
                                href={image.href}
                                x="0"
                                y="0"
                                width={image.geometry.width}
                                height={image.geometry.height}
                                preserveAspectRatio="none"
                                result="edge-map"
                            />
                            {/* 128 is the 8-bit neutral; remove its half-step encoding offset. */}
                            <feComponentTransfer in="edge-map" result="neutral-edge-map">
                                <feFuncR type="linear" slope="1" intercept={-0.5 / 255} />
                                <feFuncG type="linear" slope="1" intercept={-0.5 / 255} />
                            </feComponentTransfer>
                            <feDisplacementMap
                                in="SourceGraphic"
                                in2="neutral-edge-map"
                                scale={image.scale}
                                xChannelSelector="R"
                                yChannelSelector="G"
                            />
                        </filter>
                    </defs>
                </svg>
            )}
        </span>
    );
}

/** Reusable chrome surface for search, menus, segmented controls and suitable buttons. */
export function GlassSurface({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn('ui-glass', className)} {...props}>
            <GlassMaterial />
            {children}
        </div>
    );
}
