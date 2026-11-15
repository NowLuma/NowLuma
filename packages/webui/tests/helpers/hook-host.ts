import * as React from 'react';
import { vi } from 'vitest';

// A single-component hook host for callback tests; layout and DOM events stay in browser checks.
export function hookHost() {
    const slots: unknown[] = [];
    let cursor = 0;
    let pending: (() => void)[] = [];
    const changed = (a: React.DependencyList | undefined, b: React.DependencyList | undefined) =>
        !a || !b || a.length !== b.length || a.some((value, index) => !Object.is(value, b[index]));

    const install = () => {
        vi.spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
            const index = cursor++;

            if (!(index in slots)) {
                slots[index] = typeof initial === 'function' ? initial() : initial;
            }

            return [
                slots[index],
                (next: unknown) => {
                    slots[index] = typeof next === 'function' ? next(slots[index]) : next;
                },
            ];
        }) as typeof React.useState);
        vi.spyOn(React, 'useRef').mockImplementation(((initial: unknown) => {
            const index = cursor++;
            slots[index] ??= { current: initial };
            return slots[index];
        }) as typeof React.useRef);

        const memo = (factory: () => unknown, deps?: React.DependencyList) => {
            const index = cursor++;
            const previous = slots[index] as
                { deps?: React.DependencyList; value: unknown } | undefined;

            if (!previous || changed(previous.deps, deps)) {
                slots[index] = { value: factory(), deps };
            }

            return (slots[index] as { value: unknown }).value;
        };

        vi.spyOn(React, 'useMemo').mockImplementation(memo as typeof React.useMemo);
        vi.spyOn(React, 'useCallback').mockImplementation(((
            callback: unknown,
            deps: React.DependencyList,
        ) => memo(() => callback, deps)) as typeof React.useCallback);
        vi.spyOn(React, 'useId').mockImplementation(
            () => memo(() => `test-${cursor}`, []) as string,
        );

        const registerEffect: typeof React.useEffect = (effect, deps) => {
            const index = cursor++;
            const previous = slots[index] as
                { deps?: React.DependencyList; cleanup?: () => void } | undefined;

            if (!previous || changed(previous.deps, deps)) {
                pending.push(() => {
                    previous?.cleanup?.();
                    const cleanup = effect();
                    slots[index] = { deps, cleanup };
                });
            }
        };

        vi.spyOn(React, 'useEffect').mockImplementation(registerEffect);
        vi.spyOn(React, 'useLayoutEffect').mockImplementation(registerEffect);
    };

    return {
        render<T>(component: () => T): T {
            install();
            cursor = 0;
            const result = component();
            const effects = pending;
            pending = [];
            effects.forEach((effect) => effect());
            return result;
        },
        unmount() {
            slots.forEach((slot) => {
                const effect = slot as { cleanup?: () => void } | null;
                effect?.cleanup?.();
            });
        },
    };
}

export function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
    return React.Children.toArray(node).flatMap((child) => {
        if (!React.isValidElement<{ children?: React.ReactNode }>(child)) {
            return [];
        }

        return [
            child as React.ReactElement<Record<string, unknown>>,
            ...elements(child.props.children),
        ];
    });
}
