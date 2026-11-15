import { useId } from 'react';
import { BRAND_LOGO_URL } from '@/brand';
import { LINE_FIELD } from '@/lib/line-field';
import { cn } from '@/lib/utils';

export function LineField({
    className,
    animated = false,
}: {
    className?: string;
    animated?: boolean;
}) {
    const maskId = `line-mark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    return (
        <svg
            aria-hidden="true"
            focusable="false"
            data-ui-decoration=""
            data-line-motion={animated ? 'true' : undefined}
            className={cn('ui-line-field pointer-events-none', className)}
            width="192"
            height="192"
            viewBox="0 0 192 192"
            fill="none"
        >
            <defs>
                <mask
                    id={maskId}
                    maskUnits="userSpaceOnUse"
                    x="0"
                    y="0"
                    width="192"
                    height="192"
                    style={{ maskType: 'alpha' }}
                >
                    <image href={BRAND_LOGO_URL} width="192" height="192" />
                </mask>
            </defs>
            <g className="ui-line-field-lines" stroke="currentColor" mask={`url(#${maskId})`}>
                {LINE_FIELD.map((line) => (
                    <line
                        key={line.x}
                        x1={line.x}
                        x2={line.x}
                        y1="0"
                        y2="192"
                        strokeWidth={line.width}
                        vectorEffect="non-scaling-stroke"
                    />
                ))}
            </g>
        </svg>
    );
}
