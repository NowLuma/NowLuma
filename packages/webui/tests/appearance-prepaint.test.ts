import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!bootstrap) {
    throw new Error('Missing appearance prepaint bootstrap');
}

function runPrepaint(appearance: Record<string, unknown>, systemReduce = false) {
    const attributes = new Map<string, string>([['data-no-motion', '1']]);
    const raw = JSON.stringify(appearance);
    const setItem = vi.fn();
    const root = {
        classList: { add: vi.fn(), remove: vi.fn() },
        style: { setProperty: vi.fn(), colorScheme: '' },
        setAttribute: (key: string, value: string) => attributes.set(key, value),
    };
    runInNewContext(bootstrap!, {
        localStorage: { getItem: () => raw, setItem },
        document: {
            documentElement: root,
            getElementById: () => null,
            querySelector: () => null,
        },
        window: {
            matchMedia: (query: string) => ({
                matches: query === '(prefers-reduced-motion: reduce)' && systemReduce,
            }),
        },
    });
    return { attributes, setItem, raw };
}


describe('manual appearance prepaint', () => {
    it.each(['auto', 'high', 'low'] as const)(
        'applies stored %s quality independently of the explicit motion switch without rewriting settings',
        (performanceMode) => {
            const appearance = {
                performanceMode,
                disableMotion: true,
                reduceMotion: false,
                mode: 'dark',
                palette: 'nord',
                accentPreset: 'violet',
                uiScale: 1.1,
            };
            const result = runPrepaint(appearance);
            expect(result.attributes.get('data-low-performance')).toBe(performanceMode === 'low' ? '1' : '0');
            expect(result.attributes.get('data-no-motion')).toBe('1');
            expect(result.attributes.get('data-reduce-motion')).toBe('1');
            expect(result.attributes.get('data-palette')).toBe('nord');
            expect(result.setItem).not.toHaveBeenCalled();
            expect(JSON.parse(result.raw)).toEqual(appearance);
        },
    );

    it('keeps OS accessibility reduction separate from the positive manual motion choice', () => {
        const result = runPrepaint({ performanceMode: 'low', disableMotion: false }, true);
        expect(result.attributes.get('data-low-performance')).toBe('1');
        expect(result.attributes.get('data-no-motion')).toBe('0');
        expect(result.attributes.get('data-reduce-motion')).toBe('1');
        expect(result.setItem).not.toHaveBeenCalled();
    });
});
