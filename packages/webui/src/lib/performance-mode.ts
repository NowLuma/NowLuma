/**
 * Pure frame-rate sampler behind the automatic performance mode.
 *
 * The caller feeds `requestAnimationFrame` timestamps (ms, monotonic) into
 * `sample`; this module owns no DOM, timers or storage. A window of
 * `FRAME_WINDOW_MS` closes after that much measured frame time; `autoLow` latches
 * only when `SUSTAINED_LOW_WINDOWS` consecutive windows stay below
 * `LOW_FPS_THRESHOLD`, so a single dropped frame or one isolated suspend/idle gap
 * never degrades the UI. Consecutive long gaps are a genuinely very-low foreground
 * cadence and are measured, so a sluggish but visible UI still degrades. The latch
 * lasts until `reset()` (manual override or a new session) so the mode cannot flap.
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
    /** Frames per second over the last window of measured frame time; 0 before one. */
    fps: number;
    /** Latched for this session once sustained low FPS was observed. */
    autoLow: boolean;
}

/** Measured frame time accumulated into one FPS reading (not wall-clock time). */
export const FRAME_WINDOW_MS = 1000;
/**
 * Below this the UI reads as coarse rather than smooth. 30 FPS displays and
 * software-rendered sessions degrade; 60/120 Hz sessions do not.
 */
export const LOW_FPS_THRESHOLD = 40;
/** Consecutive low windows before degradation: ~2 s of real slowness, not a spike. */
export const SUSTAINED_LOW_WINDOWS = 2;
/**
 * Gaps above this are not render cost on their own: one means a hidden tab, laptop
 * suspend or blocked main thread and is left out of the measured frame time.
 * Consecutive gaps above it are a foreground session under 4 FPS, which is measured
 * and can degrade.
 */
export const IDLE_GAP_MS = 250;

export class FrameRateSampler {
    private previous: number | null = null;
    /** Last long gap, measured only if another long gap follows it. */
    private pendingGap: number | null = null;
    private windowMs = 0;
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

        if (this.previous === null) {
            this.previous = timestamp; // warmup: no gap to measure yet

            return this.latest;
        }

        const gap = timestamp - this.previous;

        if (gap <= 0) {
            return this.latest; // duplicate or backwards timestamp: not a frame
        }

        this.previous = timestamp;

        if (gap > IDLE_GAP_MS) {
            const pending = this.pendingGap;

            this.pendingGap = gap;

            if (pending === null) {
                // First long gap: hidden tab, suspend or blocked main thread. Excluded
                // from the measured frame time, so it cannot degrade the UI.
                return this.latest;
            }

            this.measure(pending); // another long gap followed: real slow cadence
        } else {
            this.pendingGap = null; // an isolated long gap stays unmeasured
            this.measure(gap);
        }

        return this.closeWindow();
    }

    /** Forget the window and the latch (manual override or a new session). */
    reset(): void {
        this.pause();
        this.autoLow = false;
        this.latest = { fps: 0, autoLow: false };
    }

    /** Drop the current window and its streak; warmup resumes at the next frame. */
    private pause(): void {
        this.previous = null;
        this.pendingGap = null;
        this.windowMs = 0;
        this.frames = 0;
        this.lowWindows = 0;
    }

    private measure(gap: number): void {
        this.windowMs += gap;
        this.frames += 1;
    }

    private closeWindow(): FrameRateSample {
        if (this.windowMs < FRAME_WINDOW_MS) {
            return this.latest;
        }

        const fps = (this.frames * 1000) / this.windowMs;
        this.lowWindows = fps < LOW_FPS_THRESHOLD ? this.lowWindows + 1 : 0;

        if (this.lowWindows >= SUSTAINED_LOW_WINDOWS) {
            this.autoLow = true;
        }

        this.windowMs = 0;
        this.frames = 0;
        this.latest = { fps, autoLow: this.autoLow };

        return this.latest;
    }
}
