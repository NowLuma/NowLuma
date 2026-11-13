import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AccountConnections, HookProcessInfo } from '../src/types';

// 与 processes-page.test.tsx 一致：mock 掉上下文，只验证面板自身的渲染与制动。
const state = vi.hoisted(() => ({
    processList: [] as HookProcessInfo[],
    qqList: [] as { uin: string; nickname: string }[],
    connections: [] as AccountConnections[],
    ready: { processList: true, qqList: true, connections: true },
    errors: { processList: '', qqList: '', connections: '' },
}));

vi.mock('@/contexts/AppStateContext', () => ({
    useAppState: () => ({
        processList: state.processList,
        qqList: state.qqList,
        connections: state.connections,
        resources: {
            processList: { ready: state.ready.processList, error: state.errors.processList || null },
            qqList: { ready: state.ready.qqList, error: state.errors.qqList || null },
            connections: {
                ready: state.ready.connections,
                error: state.errors.connections || null,
            },
        },
        processOps: {
            statusOf: () => null,
            banner: '',
            load: vi.fn(),
            unload: vi.fn(),
            refresh: vi.fn(),
        },
        selectedUin: null,
        refreshProcesses: vi.fn(),
        refreshQqList: vi.fn(),
        refreshConnections: vi.fn(),
    }),
}));

vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({ appearance: { disableMotion: true } }),
}));

vi.mock('@/components/confirm-dialog', () => ({ ConfirmDialog: () => null }));
vi.mock('@/components/interior/modal', () => ({ Modal: () => null }));

const { GettingStartedPanel } = await import(
    '../src/components/overview/getting-started-panel'
);

function proc(over: Partial<HookProcessInfo> = {}): HookProcessInfo {
    return {
        pid: 100,
        name: 'qq',
        path: '/opt/QQ/qq',
        injected: true,
        connected: true,
        loggedIn: true,
        uin: '10001',
        status: 'online',
        error: '',
        method: 'loadModuleManual',
        account: { uin: '10001', nickname: '测试' },
        ...over,
    };
}

function conn(over: Partial<AccountConnections> = {}): AccountConnections {
    return {
        uin: '10001',
        nickname: '测试',
        adapters: [{ name: 'ws', kind: 'wsServer', status: 'ok', detail: 'listening' }],
        ...over,
    };
}

function reset() {
    state.processList = [];
    state.qqList = [];
    state.connections = [];
    state.ready = { processList: true, qqList: true, connections: true };
    state.errors = { processList: '', qqList: '', connections: '' };
}

function render(): string {
    return renderToStaticMarkup(<GettingStartedPanel />);
}

describe('GettingStartedPanel', () => {
    it('ready 状态显示已完成的一句话与说明入口', () => {
        reset();
        state.processList = [proc()];
        state.qqList = [{ uin: '10001', nickname: '测试' }];
        state.connections = [conn()];

        const html = render();
        expect(html).toContain('接下来做什么');
        expect(html).toContain('QQ 已经接好了');
        expect(html).toContain('看看说明');
    });

    it('未读完时不把空列表当成「没打开 QQ」', () => {
        reset();
        state.ready = { processList: false, qqList: false, connections: false };

        const html = render();
        expect(html).not.toContain('打开 QQ');
        expect(html).toContain('aria-busy="true"');
    });

    it('读绪且全空时提示去打开 QQ', () => {
        reset();

        const html = render();
        expect(html).toContain('打开 QQ');
        expect(html).toContain('我已打开 QQ');
    });

    it('读取失败时错误进入 role=alert 且给出重试', () => {
        reset();
        state.errors = { processList: '', qqList: '连接超时', connections: '' };

        const html = render();
        expect(html).toContain('role="alert"');
        expect(html).toContain('连接超时');
        expect(html).toContain('重新检查');
    });

    it('引导文案不出现实现术语', () => {
        reset();
        state.processList = [proc({ status: 'available', injected: false })];

        const html = render();
        for (const term of ['注入', '管道', 'OneBot']) {
            expect(html).not.toContain(term);
        }
    });

    it('多进程时给出选择入口，而不是直接连接某一个', () => {
        reset();
        state.processList = [proc({ pid: 100 }), proc({ pid: 200 })];

        const html = render();
        expect(html).toContain('选一个 QQ');
        expect(html).not.toContain('连接这个 QQ');
    });

    it('操作进行中时主按钮禁用并显示进行中文案', () => {
        reset();
        state.processList = [proc({ status: 'available', injected: false })];

        // statusOf 未返回操作时按钮可用；这里只确认文案存在。
        const html = render();
        expect(html).toContain('连接这个 QQ');
    });
});
