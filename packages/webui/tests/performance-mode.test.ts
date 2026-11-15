import { describe, expect, it } from 'vitest';
import {
    FrameRateSampler,
    performanceModeLow,
    type FrameRateSample,
} from '../src/lib/performance-mode';

/** Frame timestamps for consecutive `[fps, durationMs]` spans, starting at `start`. */
function timeline(spans: Array<[fps: number, durationMs: number]>, start = 0): number[] {
    const stamps: number[] = [];
    let at = start;

    for (const [fps, durationMs] of spans) {
        const end = at + durationMs;
        const step = 1000 / fps;

        for (at += step; at <= end; at += step) {
            stamps.push(at);
        }

        at = end;
    }

    return stamps;
}

function feed(sampler: FrameRateSampler, stamps: number[], visible = true): FrameRateSample[] {
    return stamps.map((timestamp) => sampler.sample(timestamp, visible));
}

describe('automatic performance detection', () => {
    it('reports about 60 FPS and never degrades on a steady 60 FPS session', () => {
        const sampler = new FrameRateSampler();
        const samples = feed(sampler, timeline([[60, 3000]]));

        expect(samples[0]).toEqual({ fps: 0, autoLow: false });
        expect(samples.at(-1)!.fps).toBeGreaterThan(50);
        expect(samples.at(-1)!.autoLow).toBe(false);
    });

    it('latches only after two sustained 30 FPS windows', () => {
        const sampler = new FrameRateSampler();
        const samples = feed(sampler, timeline([[30, 4000]]));
        const firstWindow = samples.find((sample) => sample.fps > 0)!;

        expect(firstWindow.fps).toBeCloseTo(30, 0);
        expect(firstWindow.autoLow).toBe(false);
        expect(samples.at(-1)!.fps).toBeCloseTo(30, 0);
        expect(samples.at(-1)!.autoLow).toBe(true);
    });

    it('latches on a sustained 3 FPS foreground session', () => {
        const sampler = new FrameRateSampler();
        const samples = feed(sampler, timeline([[3, 5000]]));

        expect(samples.at(-1)!.fps).toBeCloseTo(3, 0);
        expect(samples.at(-1)!.autoLow).toBe(true);
    });

    it('latches on a sustained 1 FPS foreground session', () => {
        const sampler = new FrameRateSampler();
        const samples = feed(sampler, timeline([[1, 6000]]));

        expect(samples.at(-1)!.fps).toBeCloseTo(1, 0);
        expect(samples.at(-1)!.autoLow).toBe(true);
    });

    it('latches on sustained foreground cadence below 1 FPS', () => {
        const sampler = new FrameRateSampler();
        const samples = feed(sampler, timeline([[0.5, 10_000]]));

        expect(samples.at(-1)!.fps).toBeLessThan(1);
        expect(samples.at(-1)!.autoLow).toBe(true);
    });

    it('does not latch after one 30 s suspend followed by normal 60 FPS', () => {
        const sampler = new FrameRateSampler();
        const samples = feed(sampler, [
            ...timeline([[60, 1000]]),
            ...timeline([[60, 2500]], 30_000),
        ]);

        expect(samples.at(-1)!.fps).toBeGreaterThan(50);
        expect(samples.at(-1)!.autoLow).toBe(false);
    });

    it('keeps measuring a sluggish session across isolated stalls', () => {
        const sampler = new FrameRateSampler();
        // 30 FPS with a 400 ms stall every 12 frames: every stall stays isolated.
        const stamps = timeline([[30, 4000]]).map(
            (timestamp, index) => timestamp + Math.floor(index / 12) * 400,
        );
        const samples = feed(sampler, stamps);

        expect(samples.at(-1)!.fps).toBeCloseTo(30, 0);
        expect(samples.at(-1)!.autoLow).toBe(true);
    });

    it('ignores a single stalled frame inside an otherwise smooth session', () => {
        const sampler = new FrameRateSampler();
        const stamps = timeline([[60, 3000]]).map((timestamp) =>
            timestamp > 1500 ? timestamp + 200 : timestamp,
        );

        expect(feed(sampler, stamps).at(-1)!.autoLow).toBe(false);
    });

    it('does not latch for one low window that recovers', () => {
        const sampler = new FrameRateSampler();

        expect(
            feed(
                sampler,
                timeline([
                    [30, 3000],
                    [60, 2000],
                ]),
            ).at(-1)!.autoLow,
        ).toBe(false);
    });

    it('restarts on hidden frames and idle gaps instead of degrading', () => {
        const sampler = new FrameRateSampler();
        const hidden = feed(sampler, timeline([[30, 3000]]), false);

        expect(hidden.at(-1)!.fps).toBe(0);
        expect(hidden.at(-1)!.autoLow).toBe(false);

        const resumed = feed(sampler, timeline([[60, 3000]], 30_000));

        expect(resumed.at(-1)!.fps).toBeGreaterThan(50);
        expect(resumed.at(-1)!.autoLow).toBe(false);
    });

    it('treats a long suspend gap as a pause rather than slow frames', () => {
        const sampler = new FrameRateSampler();
        const samples = feed(sampler, [
            ...timeline([[60, 1500]]),
            ...timeline([[60, 2500]], 30_000),
        ]);

        expect(samples.at(-1)!.fps).toBeGreaterThan(50);
        expect(samples.at(-1)!.autoLow).toBe(false);
    });

    it('ignores a slow startup burst before measuring the warm session', () => {
        const sampler = new FrameRateSampler();
        const samples = feed(sampler, [...timeline([[10, 1200]]), ...timeline([[60, 3000]], 1200)]);

        expect(samples.at(-1)!.fps).toBeGreaterThan(50);
        expect(samples.at(-1)!.autoLow).toBe(false);
    });

    it('keeps the latch until an explicit reset, which re-arms detection', () => {
        const sampler = new FrameRateSampler();

        expect(feed(sampler, timeline([[30, 4000]])).at(-1)!.autoLow).toBe(true);
        expect(sampler.sample(3999, false).autoLow).toBe(true);
        sampler.reset();
        expect(sampler.sample(4000)).toEqual({ fps: 0, autoLow: false });
        expect(feed(sampler, timeline([[60, 2000]], 4100)).at(-1)!.autoLow).toBe(false);
        expect(feed(sampler, timeline([[30, 3000]], 7000)).at(-1)!.autoLow).toBe(true);
    });
});

describe('performance mode selection', () => {
    it('separates automatic low performance from an explicit motion choice', () => {
        expect(performanceModeLow('auto', false)).toBe(false);
        expect(performanceModeLow('auto', true)).toBe(true);
        expect(performanceModeLow('high', false)).toBe(false);
        expect(performanceModeLow('low', false)).toBe(true);
    });
});
