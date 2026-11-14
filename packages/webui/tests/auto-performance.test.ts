import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeFrameRate } from '../src/hooks/use-auto-performance';
import type { FrameRateSample } from '../src/lib/performance-mode';

afterEach(() => vi.unstubAllGlobals());

function environment() {
    const callbacks = new Map<number, FrameRequestCallback>();
    const listeners = new Set<() => void>();
    let id = 0;
    const document = {
        hidden: false,
        addEventListener: (_: string, callback: () => void) => listeners.add(callback),
        removeEventListener: (_: string, callback: () => void) => listeners.delete(callback),
    };
    vi.stubGlobal('document', document);
    vi.stubGlobal('performance', { now: () => 0 });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        callbacks.set(++id, callback);
        return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (frame: number) => callbacks.delete(frame));

    const tick = (time: number) => {
        const frame = callbacks.entries().next().value;

        if (frame) {
            callbacks.delete(frame[0]);
            frame[1](time);
        }
    };

    return { document, callbacks, listeners, tick };
}

describe('automatic performance observer', () => {
    it('updates only completed windows, stops after degradation and removes its frame/listener', () => {
        const env = environment();
        const samples: FrameRateSample[] = [];
        const stop = observeFrameRate((sample) => samples.push(sample));

        for (let i = 1; i < 80; i++) {
            env.tick(i * (1000 / 30));
        }

        expect(samples.at(-1)?.autoLow).toBe(true);
        expect(samples.length).toBe(2);
        expect(env.callbacks.size).toBe(0);
        stop();
        expect(env.listeners.size).toBe(0);
    });

    it('does not schedule hidden tabs and resumes with a fresh window, then cancels on unmount', () => {
        const env = environment();
        env.document.hidden = true;
        const samples: FrameRateSample[] = [];
        const stop = observeFrameRate((sample) => samples.push(sample));
        expect(env.callbacks.size).toBe(0);
        env.document.hidden = false;

        for (const callback of env.listeners) {
            callback();
        }

        for (let i = 0; i < 150; i++) {
            env.tick(30_000 + i * (1000 / 60));
        }

        expect(samples.at(-1)?.fps).toBeGreaterThan(50);
        expect(samples.every((sample) => !sample.autoLow)).toBe(true);
        stop();
        expect(env.callbacks.size).toBe(0);
        expect(env.listeners.size).toBe(0);
    });
});
