import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlassMaterial } from '../src/components/ui/glass-material';
import { elements, hookHost } from './helpers/hook-host';

vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));

let frames: Map<number, FrameRequestCallback>;
let frameId: number;
let resize: { callback: () => void; disconnect: ReturnType<typeof vi.fn> }[];
let preferences: {
    callback: () => void;
    disconnect: ReturnType<typeof vi.fn>;
    observe: ReturnType<typeof vi.fn>;
}[];
let media: Map<string, EventTarget & { matches: boolean }>;
let dataset: Record<string, string>;
let hostManaged: boolean;
let canvas: ReturnType<typeof vi.fn>;
let hosts: ReturnType<typeof hookHost>[];

beforeEach(() => {
    frames = new Map();
    frameId = 0;
    resize = [];
    preferences = [];
    media = new Map();
    dataset = { lowPerformance: '0', contrast: 'normal' };
    hostManaged = false;
    hosts = [];
    canvas = vi.fn(() => ({
        getContext: () => ({
            createImageData: (width: number, height: number) => ({
                data: new Uint8ClampedArray(width * height * 4),
            }),
            putImageData: vi.fn(),
        }),
        toDataURL: () => `data:image/png;base64,fixture-${canvas.mock.calls.length}`,
    }));
    vi.stubGlobal('document', {
        documentElement: {
            dataset,
            hasAttribute: (name: string) => name === 'data-webui-target' && hostManaged,
        },
        createElement: canvas,
    });
    vi.stubGlobal('window', {
        matchMedia: (query: string) => {
            if (!media.has(query)) {
                media.set(query, Object.assign(new EventTarget(), { matches: false }));
            }

            return media.get(query);
        },
    });
    vi.stubGlobal('navigator', { userAgent: 'Chrome/142.0' });
    vi.stubGlobal('CSS', { supports: () => true });
    vi.stubGlobal('getComputedStyle', () => ({ borderTopLeftRadius: '22px' }));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        frames.set(++frameId, callback);
        return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.stubGlobal(
        'ResizeObserver',
        class {
            disconnect = vi.fn();
            observe = vi.fn();
            constructor(public callback: () => void) {
                resize.push(this);
            }
        },
    );
    vi.stubGlobal(
        'MutationObserver',
        class {
            disconnect = vi.fn();
            observe = vi.fn();
            constructor(public callback: () => void) {
                preferences.push(this);
            }
        },
    );
});
afterEach(() => {
    hosts.forEach((host) => host.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function mount(width: number, height = 44) {
    const surface = { offsetWidth: width, offsetHeight: height };
    const host = hookHost();
    hosts.push(host);
    const render = () =>
        host.render(() => {
            const node = GlassMaterial();
            (node.props.ref as { current: HTMLSpanElement | null }).current =
                surface as HTMLSpanElement;
            return node;
        });
    render();
    return { host, surface, render };
}

function flush() {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
    expect(frames.size).toBe(0);
}

function renderer(node: ReactNode) {
    return elements(node).find((element) => element.props['data-glass-renderer'])?.props[
        'data-glass-renderer'
    ];
}

function images(node: ReactNode) {
    return elements(node).filter((element) => element.type === 'feImage');
}

function preferenceChange() {
    preferences.at(-1)!.callback();
    flush();
}

describe('GlassMaterial cached optics lifecycle', () => {
    it('installs the real SVG filter, coalesces resize work, and reuses the raster across low/high changes', () => {
        const glass = mount(301);
        const full = glass.render();
        expect(renderer(full)).toBe('refracted');
        expect(full.props.style?.backdropFilter).toMatch(/^url\("#glass-/);
        expect(images(full)).toHaveLength(1);
        expect(canvas).toHaveBeenCalledOnce();
        expect(frames.size).toBe(0);
        glass.surface.offsetWidth = 302;
        resize[0].callback();
        resize[0].callback();
        preferences[0].callback();
        expect(frames.size).toBe(1);
        flush();
        expect(canvas).toHaveBeenCalledTimes(2);
        const updated = glass.render();
        const href = images(updated)[0].props.href;
        dataset.lowPerformance = '1';
        preferenceChange();
        const low = glass.render();
        expect(renderer(low)).toBe('frosted');
        expect(images(low)).toHaveLength(0);
        expect(low.props.style).toBeUndefined();
        dataset.lowPerformance = '0';
        preferenceChange();
        const restored = glass.render();
        expect(renderer(restored)).toBe('refracted');
        expect(images(restored)[0].props.href).toBe(href);
        expect(canvas).toHaveBeenCalledTimes(2);
        dataset.reduceMotion = '1';
        dataset.noMotion = '1';
        preferenceChange();
        expect(renderer(glass.render())).toBe('refracted');
        expect(canvas).toHaveBeenCalledTimes(2);
    });

    it('reuses reopened surfaces and keeps no more than 16 raster sizes', () => {
        const first = mount(509);
        const href = images(first.render())[0].props.href;
        first.host.unmount();
        const reopened = mount(509);
        expect(images(reopened.render())[0].props.href).toBe(href);
        expect(canvas).toHaveBeenCalledOnce();

        for (let index = 0; index < 17; index += 1) {
            reopened.surface.offsetWidth = 700 + index;
            resize.at(-1)!.callback();
            flush();
        }

        expect(canvas).toHaveBeenCalledTimes(18);
        reopened.surface.offsetWidth = 700;
        resize.at(-1)!.callback();
        flush();
        expect(canvas).toHaveBeenCalledTimes(19);
        reopened.surface.offsetWidth = 716;
        resize.at(-1)!.callback();
        flush();
        expect(canvas).toHaveBeenCalledTimes(19);
    });

    it('removes refraction for OS transparency, high contrast and host-owned presentation without allocating another raster', () => {
        const glass = mount(581);
        expect(renderer(glass.render())).toBe('refracted');
        const transparency = media.get('(prefers-reduced-transparency: reduce)')!;
        transparency.matches = true;
        transparency.dispatchEvent(new Event('change'));
        flush();
        expect(renderer(glass.render())).toBe('solid');
        expect(images(glass.render())).toHaveLength(0);
        transparency.matches = false;
        dataset.contrast = 'high';
        preferenceChange();
        expect(renderer(glass.render())).toBe('solid');
        dataset.contrast = 'normal';
        hostManaged = true;
        preferenceChange();
        expect(renderer(glass.render())).toBe('solid');
        expect(canvas).toHaveBeenCalledOnce();
        hostManaged = false;
        vi.stubGlobal('navigator', { userAgent: 'Firefox/142.0' });
        preferenceChange();
        expect(renderer(glass.render())).toBe('frosted');
        expect(canvas).toHaveBeenCalledOnce();
    });

    it('disconnects both observers, media subscriptions and queued work on unmount', () => {
        const glass = mount(611);
        const remove = [...media.values()].map((query) => vi.spyOn(query, 'removeEventListener'));
        resize[0].callback();
        expect(frames.size).toBe(1);
        glass.host.unmount();
        expect(frames.size).toBe(0);
        expect(resize[0].disconnect).toHaveBeenCalledOnce();
        expect(preferences[0].disconnect).toHaveBeenCalledOnce();

        for (const unsubscribe of remove) {
            expect(unsubscribe).toHaveBeenCalledOnce();
        }
    });

    it('falls back honestly and retains failure details when raster creation fails', () => {
        const error = new Error('canvas unavailable');
        canvas.mockImplementation(() => {
            throw error;
        });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const glass = mount(641);
        expect(renderer(glass.render())).toBe('frosted');
        expect(images(glass.render())).toHaveLength(0);
        expect(warn).toHaveBeenCalledWith(
            '[Nowluma glass] Refraction unavailable; using frost.',
            error,
        );
    });
});
