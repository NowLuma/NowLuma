import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionTester } from '../src/components/debug/action-tester';
import type { DebugActionDoc, DebugStreamFrame, QQInfo } from '../src/types';
import { elements, hookHost } from './helpers/hook-host';

const api = vi.hoisted(() => ({ debug: { invokeStream: vi.fn(), invoke: vi.fn() } }));
const tasks = vi.hoisted(() => ({
    start: vi.fn(() => 'stream-1'),
    update: vi.fn(),
    finish: vi.fn(),
}));
const history = vi.hoisted(() => ({
    loadHistory: vi.fn(() => []),
    pushHistory: vi.fn(() => []),
    clearHistory: vi.fn(),
}));
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));
vi.mock('motion/react', async (original) => ({
    ...(await original<typeof import('motion/react')>()),
    useReducedMotionConfig: () => true,
}));
vi.mock('@/lib/api', () => ({ useApi: () => api }));
vi.mock('@/contexts/DebugTaskContext', () => ({ useDebugTasks: () => tasks }));
vi.mock('@/lib/debug-history', () => history);
const docs: DebugActionDoc[] = [
    {
        name: 'read_stream',
        summary: 'fixture stream',
        aliases: [],
        params: [],
        readOnly: true,
        stream: true,
    },
];
const accounts = [{ uin: '10001', nickname: 'Fixture' }] as QQInfo[];
let host: ReturnType<typeof hookHost>;
const render = () => host.render(() => ActionTester({ accounts, docs }));

const flush = async () => {
    for (let i = 0; i < 12; i++) {
        await Promise.resolve();
    }
};

function runButton(tree: ReactNode) {
    return elements(tree).find(
        (item) => item.type === 'button' && item.props['data-press-scale'] === '',
    )!;
}

beforeEach(() => {
    host = hookHost();
    api.debug.invokeStream.mockReset();
    tasks.start.mockClear();
    tasks.finish.mockClear();
    history.pushHistory.mockClear();
    render();
    const picker = elements(render()).find((item) => item.props.ariaLabel === '选择接口')!;
    (picker.props.onChange as (value: string) => void)('read_stream');
});
afterEach(() => {
    host.unmount();
    vi.restoreAllMocks();
});

describe('ActionTester stream completion', () => {
    it('shows failure when the connection ends after a progress frame', async () => {
        api.debug.invokeStream.mockImplementation(
            async (_uin, _action, _params, frame: (value: DebugStreamFrame) => void) => {
                frame({ status: 'ok', retcode: 0, data: { type: 'progress', progress: 0.5 } });
            },
        );
        (runButton(render()).props.onClick as () => void)();
        await flush();
        const alert = elements(render()).find((item) => item.props.role === 'alert');
        expect(alert?.props.children).toBe('流已结束，但未收到完成响应');
        expect(tasks.finish).toHaveBeenCalledExactlyOnceWith('stream-1', 'failed');
        expect(history.pushHistory).toHaveBeenCalledWith(
            expect.objectContaining({
                uin: '10001',
                action: 'read_stream',
                ok: false,
                stream: true,
            }),
        );
        expect(api.debug.invokeStream).toHaveBeenCalledOnce();
    });

    it('requires the successful terminal response before marking a stream done', async () => {
        api.debug.invokeStream.mockImplementation(
            async (_uin, _action, _params, frame: (value: DebugStreamFrame) => void) => {
                frame({ status: 'ok', retcode: 0, data: { type: 'response', value: 42 } });
            },
        );
        (runButton(render()).props.onClick as () => void)();
        await flush();
        expect(tasks.finish).toHaveBeenCalledExactlyOnceWith('stream-1', 'done');
        expect(
            elements(render()).some((item) => item.props.children === '流已结束，但未收到完成响应'),
        ).toBe(false);
        expect(history.pushHistory).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    });
});
