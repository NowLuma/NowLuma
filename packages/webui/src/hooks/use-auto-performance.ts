import { useEffect, useState } from 'react';
import { FrameRateSampler, type FrameRateSample } from '@/lib/performance-mode';

export function observeFrameRate(onSample: (sample: FrameRateSample) => void): () => void {
    const sampler = new FrameRateSampler();
    let frame = 0;
    let previous = sampler.sample(performance.now(), !document.hidden);

    const tick = (timestamp: number) => {
        const current = sampler.sample(timestamp, !document.hidden);

        if (current !== previous) {
            previous = current;
            onSample(current);
        }

        if (!current.autoLow) {
            frame = requestAnimationFrame(tick);
        }
    };

    const visibility = () => {
        cancelAnimationFrame(frame);
        sampler.sample(performance.now(), false);

        if (!document.hidden && !previous.autoLow) {
            frame = requestAnimationFrame(tick);
        }
    };

    if (!document.hidden) {
        frame = requestAnimationFrame(tick);
    }

    document.addEventListener('visibilitychange', visibility);

    return () => {
        cancelAnimationFrame(frame);
        document.removeEventListener('visibilitychange', visibility);
    };
}

/** Detection is device-local and never writes a slow device's result into shared preferences. */
export function useAutoPerformance(enabled: boolean): FrameRateSample {
    const [sample, setSample] = useState<FrameRateSample>({ fps: 0, autoLow: false });
    useEffect(() => {
        if (!enabled) {
            return;
        }

        setSample({ fps: 0, autoLow: false });
        return observeFrameRate(setSample);
    }, [enabled]);
    return enabled ? sample : { fps: 0, autoLow: false };
}
