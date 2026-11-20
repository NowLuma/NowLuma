import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import { BRAND_LOGO_URL } from '@/brand';
import { sampleLineWidths } from '@/lib/line-field';
import { cn } from '@/lib/utils';

const COLUMNS = 40;
const ROWS = 56;
const PITCH = 8;
const WIDTH = COLUMNS * PITCH;
const HEIGHT = ROWS * PITCH;
let sourcePaths: Promise<readonly string[]> | null = null;

/** One bounded raster of the canonical source, shared by all mounted fields. */
function loadSourcePaths(): Promise<readonly string[]> {
    if (sourcePaths) {
        return sourcePaths;
    }

    const { promise, resolve, reject } = Promise.withResolvers<readonly string[]>();
    sourcePaths = promise;
    const source = new Image();
    source.onerror = () => reject(new Error('Unable to load the identity source'));

    source.onload = () => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = WIDTH / 2;
            canvas.height = HEIGHT / 2;
            const context = canvas.getContext('2d');

            if (!context) {
                throw new Error('Identity sampling canvas unavailable');
            }

            context.fillStyle = '#fff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            const scale = Math.min(
                (canvas.width - 16) / source.naturalWidth,
                (canvas.height - 16) / source.naturalHeight,
            );
            const width = source.naturalWidth * scale;
            const height = source.naturalHeight * scale;
            context.drawImage(
                source,
                (canvas.width - width) / 2,
                (canvas.height - height) / 2,
                width,
                height,
            );
            const widths = sampleLineWidths(
                context.getImageData(0, 0, canvas.width, canvas.height).data,
                canvas.width,
                canvas.height,
                COLUMNS,
                ROWS,
            );
            const paths: string[][] = [[], [], [], []];

            for (let row = 0; row < ROWS; row++) {
                for (let column = 0; column < COLUMNS; column++) {
                    const x = (column + 0.5) * PITCH;
                    const top = row * PITCH + 1.5;
                    const bottom = (row + 1) * PITCH - 1.5;
                    paths[widths[row * COLUMNS + column] - 1].push(`M${x} ${top}V${bottom}`);
                }
            }

            resolve(paths.map((segments) => segments.join('')));
        } catch (error) {
            reject(error);
        }
    };

    source.src = BRAND_LOGO_URL;
    return promise;
}

function allowsFieldMotion(): boolean {
    const root = document.documentElement;
    return (
        root.dataset.lowPerformance !== '1' &&
        root.dataset.reduceMotion !== '1' &&
        root.dataset.noMotion !== '1' &&
        !root.hasAttribute('data-webui-target') &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
}

export function LineField({
    className,
    animated = false,
}: {
    className?: string;
    animated?: boolean;
}) {
    const [paths, setPaths] = useState<readonly string[] | null>(null);
    const offset = useMotionValue(0);
    const movement = useRef<{ stop: () => void } | null>(null);

    useEffect(() => {
        let mounted = true;
        void loadSourcePaths().then(
            (paths) => {
                if (mounted) {
                    setPaths(paths);
                }
            },
            (error) => {
                if (mounted) {
                    console.warn('[Nowluma identity] Source sampling unavailable.', error);
                }
            },
        );

        return () => {
            mounted = false;
            movement.current?.stop();
            movement.current = null;
        };
    }, []);

    const settle = () => {
        movement.current?.stop();

        if (!animated || !allowsFieldMotion()) {
            offset.set(0);
            return;
        }

        movement.current = animate(offset, 0, { type: 'spring', duration: 0.42, bounce: 0.15 });
    };

    const impulse = () => {
        movement.current?.stop();

        if (!animated || !allowsFieldMotion()) {
            offset.set(0);
            return;
        }

        const next = animate(offset, 8, { type: 'spring', duration: 0.24, bounce: 0.08 });
        movement.current = next;
        void next.then(() => {
            if (movement.current === next) {
                settle();
            }
        });
    };

    return (
        <svg
            aria-hidden="true"
            focusable="false"
            data-ui-decoration=""
            data-line-motion={animated ? 'true' : undefined}
            className={cn('ui-line-field', !animated && 'pointer-events-none', className)}
            width={WIDTH}
            height={HEIGHT}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            fill="none"
            onPointerEnter={animated ? impulse : undefined}
            onPointerLeave={animated ? settle : undefined}
        >
            <g className="ui-line-field-lines" stroke="currentColor">
                <motion.g className="ui-line-field-impulse" style={{ x: offset }}>
                    {paths?.map((path, index) => (
                        <path
                            key={index}
                            d={path}
                            strokeWidth={index + 1}
                            strokeOpacity={index === 0 ? 0.1 : index === 1 ? 0.65 : 1}
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}
                </motion.g>
            </g>
        </svg>
    );
}
