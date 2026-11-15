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
    pendingOp: null as 'load' | 'unload' | 'refresh' | null,
}));

vi.mock('@/contexts/AppStateContext', () => ({
    useAppState: () => ({
        processList: state.processList,
        qqList: state.qqList,
        connections: state.connections,
        resources: {
            processList: {
                ready: state.ready.processList,
                error: state.errors.processList || null,
            },
            qqList: { ready: state.ready.qqList, error: state.errors.qqList || null },
            connections: {
                ready: state.ready.connections,
                error: state.errors.connections || null,
            },
        },
        processOps: {
            statusOf: () => state.pendingOp,
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

const { GettingStartedPanel } = await import('../src/components/overview/getting-started-panel');

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
    state.pendingOp = null;
}

function render(): string {
    return renderToStaticMarkup(<GettingStartedPanel />);
}

describe('GettingStartedPanel', () => {
    it('releases the reserved title box after reading so wrapped headings cannot be clipped', () => {
        reset();
        state.processList = [proc()];
        state.qqList = [{ uin: '10001', nickname: '测试' }];
        state.connections = [conn()];
        const html = render();
        expect(html).toMatch(/aria-label="下一步提示"[^>]*class="[^"]*skeleton-swap-fluid/);
        expect(html).not.toContain('height:20px');
        expect(html).toContain('<h3');
        reset();
        state.ready = { processList: false, qqList: false, connections: false };
        expect(render()).not.toContain('skeleton-swap-fluid');
    });

    it('ready 状态显示已完成的一句话与说明入口', () => {
        reset();
        state.processList = [proc()];
        state.qqList = [{ uin: '10001', nickname: '测试' }];
        state.connections = [conn()];

        const html = render();
        expect(html).toContain('连接进度');
        expect(html).toContain('QQ 与机器人连接已就绪');
        expect(html).toContain('连接说明');
        expect(html).toContain('aria-label="连接路径"');

        for (const stage of ['登录 QQ', '接入会话', '连接机器人']) {
            expect(html).toContain(stage);
        }
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
        expect(html).toContain('选择 QQ');
        expect(html).not.toContain('QQ 已找到，接入这个会话');
    });

    it('only enables attachment for the selected available session and disables it during an operation', () => {
        reset();
        state.processList = [proc({ status: 'available', injected: false })];
        expect(render()).toContain('接入会话');
        state.pendingOp = 'load';
        const html = render();
        expect(html).toContain('正在处理 QQ 会话');
        expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?处理中/);
        expect(html).not.toContain('QQ 已找到，接入这个会话');
    });
});
