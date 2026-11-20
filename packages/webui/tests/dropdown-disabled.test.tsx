import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDropdown } from '../src/components/interior/dropdown';
import { hookHost } from './helpers/hook-host';
import type { HookHost } from './helpers/hook-host';

vi.mock('react', async (original) => ({ ...(await original<typeof React>()) }));

let host: HookHost;
beforeEach(() => {
    host = hookHost();
    vi.stubGlobal('document', new EventTarget());
});
afterEach(() => {
    host.unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('dropdown disabling during an operation', () => {
    it('closes a previously opened menu, blocks selection while busy, and permits a fresh selection after settlement', () => {
        let disabled = false;
        const onChange = vi.fn();
        const focus = vi.fn();
        const render = () =>
            host.render(() =>
                useDropdown({
                    items: [
                        { value: 'direct', label: '直连' },
                        { value: 'mirror', label: '镜像' },
                    ],
                    defaultValue: 'direct',
                    disabled,
                    onChange,
                }),
            );
        const initial = render();
        initial.triggerProps.ref.current = { focus } as unknown as HTMLButtonElement;
        initial.triggerProps.onClick();
        expect(render().open).toBe(true);

        disabled = true;
        render();
        const busy = render();
        expect(busy.open).toBe(false);
        busy.getItemProps(1).onClick();
        expect(render().selectedItem?.value).toBe('direct');
        expect(onChange).not.toHaveBeenCalled();
        expect(focus).not.toHaveBeenCalled();

        disabled = false;
        render().triggerProps.onClick();
        render().getItemProps(1).onClick();
        expect(render().selectedItem?.value).toBe('mirror');
        expect(onChange).toHaveBeenCalledExactlyOnceWith('mirror');
        expect(focus).toHaveBeenCalledOnce();
    });
});
