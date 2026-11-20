import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlassMaterial } from '../src/components/ui/glass-material';
import { hookHost, type HookHost } from './helpers/hook-host';

const clock = vi.hoisted(() => {
    const pending = new Map<number, FrameRequestCallback>();
    let id = 0;

    const request = (callback: FrameRequestCallback) => {
        pending.set(++id, callback);
        return id;
    };

    const cancel = (key: number) => pending.delete(key);
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    return { pending, request, cancel, now: 0 };
});

vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));

let host: HookHost;
let surface: EventTarget;
let styles: Map<string, string>;
let media: Map<string, EventTarget & { matches: boolean }>;

function advance(count = 1) {
    for (let index = 0; index < count; index++) {
        clock.now += 1000 / 60;
        const callbacks = [...clock.pending.values()];
        clock.pending.clear();
        callbacks.forEach((callback) => callback(clock.now));
    }
}

function light() {
    return {
        x: parseFloat(styles.get('--glass-light-x')!),
        y: parseFloat(styles.get('--glass-light-y')!),
        opacity: Number(styles.get('--glass-light-opacity')),
    };
}

function enter(x = 15) {
    surface.dispatchEvent(
        Object.assign(new Event('pointerenter'), {
            pointerType: 'mouse',
            clientX: x,
            clientY: 20,
        }),
    );
}

beforeEach(() => {
    clock.now = Math.max(clock.now, performance.now());
    vi.spyOn(performance, 'now').mockImplementation(() => clock.now);
    vi.stubGlobal('requestAnimationFrame', clock.request);
    vi.stubGlobal('cancelAnimationFrame', clock.cancel);
    styles = new Map();
    media = new Map();
    surface = Object.assign(new EventTarget(), {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 40 }),
    });
    const material = {
        parentElement: surface,
        offsetWidth: 100,
        offsetHeight: 40,
        style: { setProperty: (name: string, value: string) => styles.set(name, value) },
    };
    vi.stubGlobal('document', {
        documentElement: {
            dataset: { lowPerformance: '0', noMotion: '0', reduceMotion: '0' },
            hasAttribute: () => false,
        },
    });
    vi.stubGlobal('window', {
        matchMedia: (query: string) => {
            if (!media.has(query)) {
                media.set(query, Object.assign(new EventTarget(), { matches: false }));
            }

            return media.get(query);
        },
    });
    vi.stubGlobal('navigator', { userAgent: 'Firefox/142.0' });
    vi.stubGlobal('CSS', { supports: () => false });
    vi.stubGlobal('getComputedStyle', () => ({ borderTopLeftRadius: '20px' }));
    const observer = class {
        observe() {}
        disconnect() {}
    };
    vi.stubGlobal('ResizeObserver', observer);
    vi.stubGlobal('MutationObserver', observer);
    host = hookHost();
    host.render(() => {
        const node = GlassMaterial();
        const ref = node.props.ref;

        if (!ref || typeof ref !== 'object' || !('current' in ref)) {
            throw new Error('The material fixture requires an object ref');
        }

        ref.current = material;
        return node;
    });
});

afterEach(() => {
    host.unmount();

    for (let index = 0; clock.pending.size && index < 180; index++) {
        advance();
    }

    expect(clock.pending.size).toBe(0);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('glass hover continuity', () => {
    it('retargets entry, exit and rapid re-entry from the rendered light instead of snapping to defaults', () => {
        const rest = light();
        enter();
        advance(6);
        const entering = light();
        expect(entering.x).toBeLessThan(rest.x);
        expect(entering.x).toBeGreaterThan(15);
        expect(entering.opacity).toBeGreaterThan(rest.opacity);
        expect(entering.opacity).toBeLessThan(1);
        surface.dispatchEvent(new Event('pointerleave'));
        advance(2);
        const exiting = light();
        expect(Math.abs(exiting.x - entering.x)).toBeLessThan(Math.abs(rest.x - entering.x));
        expect(exiting.opacity).toBeGreaterThan(rest.opacity);
        enter(85);
        advance(2);
        const interrupted = light();
        expect(interrupted.x).not.toBe(85);
        expect(Math.abs(interrupted.x - exiting.x)).toBeLessThan(Math.abs(85 - exiting.x));
        surface.dispatchEvent(new Event('pointerleave'));
        advance(90);
        expect(light().x).toBeCloseTo(rest.x, 3);
        expect(light().y).toBeCloseTo(rest.y, 3);
        expect(light().opacity).toBeCloseTo(rest.opacity, 3);
    });

    it('stops a visible hover response when the OS disables motion and does not resume it while disabled', () => {
        const rest = light();
        enter();
        advance(6);
        expect(light().opacity).toBeGreaterThan(rest.opacity);
        const reduced = media.get('(prefers-reduced-motion: reduce)')!;
        reduced.matches = true;
        reduced.dispatchEvent(new Event('change'));
        advance(2);
        expect(light()).toEqual(rest);
        advance(30);
        expect(light()).toEqual(rest);
    });
});
