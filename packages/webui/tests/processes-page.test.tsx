import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessesPage } from '../src/components/pages/processes-page';
import type { HookProcessInfo } from '../src/types';

const state = vi.hoisted(() => ({
    processList: [] as HookProcessInfo[],
    ready: true,
    error: '',
    operation: null as 'load' | 'unload' | 'refresh' | null,
}));

vi.mock('@/contexts/AppStateContext', () => ({
    useAppState: () => ({
        processList: state.processList,
        processOps: { statusOf: () => state.operation, banner: null },
        refreshProcesses: vi.fn(),
        resources: { processList: { ready: state.ready, error: state.error } },
    }),
}));
vi.mock('@/contexts/LayoutContext', () => ({
    useLayout: () => ({ pages: { processesSort: 'pid' }, setPages: vi.fn() }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({ appearance: { disableMotion: true } }),
}));
vi.mock('@/components/confirm-dialog', () => ({ ConfirmDialog: () => null }));

beforeEach(() => Object.assign(state, { ready: true, error: '', operation: null }));

function renderProcess(overrides: Partial<HookProcessInfo>) {
    state.processList = [
        {
            pid: 4242,
            name: 'qq',
            path: '',
            injected: false,
            connected: false,
            loggedIn: false,
            uin: '0',
            status: 'available',
            error: '',
            method: '',
            account: null,
            ...overrides,
        },
    ];
    return renderToStaticMarkup(<ProcessesPage />);
}

describe('process account labels', () => {
    it('does not label an unidentified process as signed out', () => {
        const markup = renderProcess({});
        expect(markup).toContain('PID 4242');
        expect(markup).not.toContain('未登录');
        expect(markup).not.toContain('/avatar/');
    });

    it('shows the locally detected identity before hook login', () => {
        const markup = renderProcess({ account: { uin: '10001', nickname: 'Alice' } });
        expect(markup).toContain('Alice');
        expect(markup).toContain('/avatar/10001');
        expect(markup).toContain('QQ 10001');
    });

    it('uses native login identity without an account database', () => {
        const markup = renderProcess({ loggedIn: true, uin: '10002', status: 'online' });
        expect(markup).toContain('/avatar/10002');
        expect(markup).toContain('已在线');
    });

    it('keeps stale identity visible with an explicit read-error alert', () => {
        state.error = '读取超时';
        const markup = renderProcess({ account: { uin: '10001', nickname: 'Alice' } });
        expect(markup).toContain('role="alert"');
        expect(markup).toContain('读取超时；当前显示上次成功读取的进程状态。');
        expect(markup).toContain('Alice');
    });

    it('does not replace a pending read with the empty-process state', () => {
        state.ready = false;
        state.processList = [];
        const markup = renderToStaticMarkup(<ProcessesPage />);
        expect(markup).not.toContain('未检测到可加载 QQ 主进程');
        expect(markup).toContain('进程列表');
    });

    it('retains busy, unload and reconnect controls in the stable rows', () => {
        const online = renderProcess({
            injected: true,
            loggedIn: true,
            uin: '10002',
            status: 'online',
        });
        expect(online).toContain('卸载');
        expect(online).toContain('aria-label="刷新进程 4242 管道状态"');
        state.operation = 'unload';
        const busy = renderProcess({
            injected: true,
            loggedIn: true,
            uin: '10002',
            status: 'online',
        });
        expect(busy).toContain('卸载中');
        expect(busy).toContain('disabled=""');
    });

    it('does not apply a stale local nickname to a newly logged-in account', () => {
        const markup = renderProcess({
            loggedIn: true,
            uin: '10002',
            status: 'online',
            account: { uin: '10001', nickname: 'Alice' },
        });
        expect(markup).toContain('/avatar/10002');
        expect(markup).not.toContain('Alice');
        expect(markup).not.toContain('10001');
    });
});
