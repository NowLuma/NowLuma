import { useEffect, useId, useRef, useState, type HTMLAttributes } from 'react';
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
                !transparency.matches;

            if (surface && lightAllowed && pointerActive) {
                const bounds = surface.getBoundingClientRect();
                const x = Math.min(1, Math.max(0, (pointerX - bounds.left) / Math.max(1, bounds.width)));
                const y = Math.min(1, Math.max(0, (pointerY - bounds.top) / Math.max(1, bounds.height)));
                element.style.setProperty('--glass-light-x', `${Math.round(x * 100)}%`);
                element.style.setProperty('--glass-light-y', `${Math.round(y * 100)}%`);
            } else if (surface) {
                element.style.removeProperty('--glass-light-x');
                element.style.removeProperty('--glass-light-y');
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
            resize.disconnect();
            preferences.disconnect();
            transparency.removeEventListener('change', schedule);
            contrast.removeEventListener('change', schedule);
            motion.removeEventListener('change', schedule);
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
