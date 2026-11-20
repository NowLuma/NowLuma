import type { UiAppearance } from '@nowluma/common/webui-appearance';

export type PerformanceMode = NonNullable<UiAppearance['performanceMode']>;

/** Legacy automatic and invalid stored modes become full glass, never motion-off. */
export function normalizePerformanceMode(value: unknown): PerformanceMode {
    return value === 'low' ? 'low' : 'high';
}

/** Material quality is manual and independent of the motion/accessibility switches. */
export function performanceModeLow(mode: PerformanceMode): boolean {
    return mode === 'low';
}
