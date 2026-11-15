import { useEffect, useId, useRef, useState } from 'react';
import {
    glassDisplacementMap,
    glassGeometry,
    glassRenderer,
    type GlassGeometry,
} from '@/lib/glass-optics';

interface GlassImage {
    geometry: GlassGeometry;
    href: string;
    scale: number;
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
        let frame = 0;
        let previous = '';

        const update = () => {
            frame = 0;
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
                const map = glassDisplacementMap(geometry);
                const canvas = document.createElement('canvas');
                canvas.width = map.width;
                canvas.height = map.height;
                const context = canvas.getContext('2d');

                if (!context) {
                    setMaterial({ renderer: 'frosted', image: null });
                    return;
                }

                const pixels = context.createImageData(map.width, map.height);
                pixels.data.set(map.pixels);
                context.putImageData(pixels, 0, 0);
                setMaterial({
                    renderer: 'refracted',
                    image: { geometry, href: canvas.toDataURL(), scale: map.scale },
                });
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
            ],
        });
        transparency.addEventListener('change', schedule);
        contrast.addEventListener('change', schedule);
        update();

        return () => {
            cancelAnimationFrame(frame);
            resize.disconnect();
            preferences.disconnect();
            transparency.removeEventListener('change', schedule);
            contrast.removeEventListener('change', schedule);
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
