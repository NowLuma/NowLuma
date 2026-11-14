import { LINE_FIELD } from '@/lib/line-field';
import { cn } from '@/lib/utils';

export function LineField({
    className,
    animated = false,
}: {
    className?: string;
    animated?: boolean;
}) {
    return (
        <svg
            aria-hidden="true"
            focusable="false"
            data-ui-decoration=""
            data-line-motion={animated ? 'true' : undefined}
            className={cn('ui-line-field pointer-events-none', className)}
            width="144"
            height="48"
            viewBox="0 0 144 48"
            fill="none"
        >
            <g className="ui-line-field-lines" stroke="currentColor">
                {LINE_FIELD.map((line, index) => (
                    <line
                        key={index}
                        x1={line.x}
                        x2={line.x}
                        y1={line.y}
                        y2={line.y + 6}
                        strokeWidth={line.width}
                        vectorEffect="non-scaling-stroke"
                    />
                ))}
            </g>
        </svg>
    );
}
