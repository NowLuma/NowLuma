import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessesPage } from '../src/components/pages/processes-page';
import { ConfirmDialog } from '../src/components/confirm-dialog';
import type { HookProcessInfo } from '../src/types';
import { elements, hookHost } from './helpers/hook-host';

const state = vi.hoisted(() => ({
    processList: [] as HookProcessInfo[],
    sort: 'pid',
    load: vi.fn(),
    unload: vi.fn(),
    refresh: vi.fn(),
}));
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));
vi.mock('motion/react', async (original) => ({
    ...(await original<typeof import('motion/react')>()),
    useReducedMotionConfig: () => true,
}));
vi.mock('@/contexts/AppStateContext', () => ({
    useAppState: () => ({
        processList: state.processList,
        processOps: {
            statusOf: () => null,
            banner: null,
            load: state.load,
            unload: state.unload,
            refresh: state.refresh,
        },
        refreshProcesses: vi.fn(),
        resources: { processList: { ready: true, error: '' } },
    }),
}));
vi.mock('@/contexts/LayoutContext', () => ({
    useLayout: () => ({ pages: { processesSort: state.sort }, setPages: vi.fn() }),
}));
const process = (pid: number, name: string): HookProcessInfo => ({
    pid,
    name,
    path: '',
    injected: false,
    connected: false,
    loggedIn: false,
    uin: '',
    status: 'available',
    error: '',
    method: '',
    account: null,
});
let host: ReturnType<typeof hookHost>;
const render = () => host.render(ProcessesPage);
const rows = (tree: ReactNode) =>
    elements(tree).filter((item) => String(item.props.className).startsWith('cp-row '));
const detail = (tree: ReactNode) =>
    elements(tree).find(
        (item) => typeof item.type === 'function' && item.type.name === 'ProcessDetail',
    );

beforeEach(() => {
    host = hookHost();
    state.sort = 'pid';
    state.processList = [process(100, 'Z QQ'), process(200, 'A QQ')];
    state.load.mockReset().mockResolvedValue(undefined);
    state.unload.mockReset();
    state.refresh.mockReset();
});
afterEach(() => {
    host.unmount();
    vi.restoreAllMocks();
});

describe('ProcessesPage PID selection', () => {
    it('requires a choice when more than one process is present', () => {
        expect(detail(render())).toBeUndefined();
        expect(state.load).not.toHaveBeenCalled();
    });

    it('retains the chosen PID after sorting and confirms only that process', async () => {
        (rows(render())[1].props.onClick as () => void)();
        state.sort = 'name';
        const selected = detail(render())!;
        expect((selected.props.proc as HookProcessInfo).pid).toBe(200);
        (selected.props.onLoad as () => void)();
        const confirmation = elements(render()).find((item) => item.type === ConfirmDialog)!;
        expect(confirmation.props.open).toBe(true);
        expect(state.load).not.toHaveBeenCalled();
        await (confirmation.props.onConfirm as () => Promise<void>)();
        expect(state.load).toHaveBeenCalledExactlyOnceWith(200);
    });

    it('does not retarget a vanished selection to the only remaining process', () => {
        (rows(render())[1].props.onClick as () => void)();
        state.processList = [process(100, 'Z QQ')];
        expect(detail(render())).toBeUndefined();
        expect(rows(render()).every((item) => item.props['aria-current'] === undefined)).toBe(true);
        expect(state.load).not.toHaveBeenCalled();
        expect(state.refresh).not.toHaveBeenCalled();
    });
});
