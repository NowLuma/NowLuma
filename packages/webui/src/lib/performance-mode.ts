/**
 * Pure frame-rate sampler behind the automatic performance mode.
 *
 * The caller feeds `requestAnimationFrame` timestamps (ms, monotonic) into
 * `sample`; this module owns no DOM, timers or storage. A window of
 * `FRAME_WINDOW_MS` closes after that much visible frame time; `autoLow` latches
 * only when `SUSTAINED_LOW_WINDOWS` consecutive windows stay below
 * `LOW_FPS_THRESHOLD`, so a single dropped frame, a hidden tab or a
 * suspend/idle gap never degrades the UI. The latch lasts until `reset()`
 * (manual override or a new session) so the mode cannot flap.
 *
 * ```ts
 * const sampler = new FrameRateSampler();
 * const loop = (ts: number) => {
 *     const sample = sampler.sample(ts, !document.hidden);
 *     if (sample.autoLow) { … reduce motion … }
 *     requestAnimationFrame(loop);
 * };
 * requestAnimationFrame(loop);
 * ```
 */

/** Latest sampler state; the same object is returned until a window closes. */
export interface FrameRateSample {
    /** Frames per second averaged over the last completed window; 0 before one. */
    fps: number;
    /** Latched for this session once sustained low FPS was observed. */
    autoLow: boolean;
}

/** Frame time accumulated into one FPS reading. */
export const FRAME_WINDOW_MS = 1000;
/**
 * Below this the UI reads as coarse rather than smooth. 30 FPS displays and
 * software-rendered sessions degrade; 60/120 Hz sessions do not.
 */
export const LOW_FPS_THRESHOLD = 40;
/** Consecutive low windows before degradation: ~2 s of real slowness, not a spike. */
export const SUSTAINED_LOW_WINDOWS = 2;
/**
 * Longer frame gaps are a hidden tab, laptop suspend or blocked main thread —
 * not rendering cost — and restart the window instead of counting as slow frames.
 */
export const IDLE_GAP_MS = 250;

export class FrameRateSampler {
    private windowStart: number | null = null;
    private previous: number | null = null;
    private frames = 0;
    private lowWindows = 0;
    private autoLow = false;
    private latest: FrameRateSample = { fps: 0, autoLow: false };

    /**
     * Feed one frame timestamp. `visible` false (hidden tab) pauses sampling and
     * drops the current window; the latch survives, only `reset()` clears it.
     * The returned object is reused between windows, so a rAF loop can pass it
     * straight to `setState` and skip re-renders.
     */
    sample(timestamp: number, visible = true): FrameRateSample {
        if (!visible || !Number.isFinite(timestamp)) {
            this.pause();

            return this.latest;
        }

        if (this.previous === null || this.windowStart === null) {
            this.start(timestamp);

            return this.latest;
        }

        const gap = timestamp - this.previous;

        if (gap <= 0) {
            return this.latest; // duplicate or backwards timestamp: not a frame
        }

        this.previous = timestamp;

        if (gap > IDLE_GAP_MS) {
            this.start(timestamp);

            return this.latest;
        }

        this.frames += 1;

        const elapsed = timestamp - this.windowStart;

        if (elapsed < FRAME_WINDOW_MS) {
            return this.latest;
        }

        const fps = (this.frames * 1000) / elapsed;
        this.lowWindows = fps < LOW_FPS_THRESHOLD ? this.lowWindows + 1 : 0;

        if (this.lowWindows >= SUSTAINED_LOW_WINDOWS) {
            this.autoLow = true;
        }

        this.windowStart = timestamp;
        this.frames = 0;
        this.latest = { fps, autoLow: this.autoLow };

        return this.latest;
    }

    /** Forget the window and the latch (manual override or a new session). */
    reset(): void {
        this.pause();
        this.lowWindows = 0;
        this.autoLow = false;
        this.latest = { fps: 0, autoLow: false };
    }

    /** Drop the current window and its streak; warmup resumes at the next frame. */
    private pause(): void {
        this.windowStart = null;
        this.previous = null;
        this.frames = 0;
        this.lowWindows = 0;
    }

    private start(timestamp: number): void {
        this.windowStart = timestamp;
        this.previous = timestamp;
        this.frames = 0;
        this.lowWindows = 0;
    }
}
