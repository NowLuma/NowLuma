import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '../src/router/app-layout';
import { KernelChoiceDialog } from '../src/components/kernel-choice';
import { elements, hookHost } from './helpers/hook-host';

const mocks = vi.hoisted(() => ({
    beforeAttach: vi.fn(),
    cancelPending: vi.fn(),
    logout: vi.fn(async () => undefined),
    onLogoutComplete: vi.fn(),
    refreshProcesses: vi.fn(),
    reloadAppearance: vi.fn(),
    useHookProcessOps: vi.fn(),
    pending: {
        target: { pid: 4242, path: '/DEMO/QQ', uin: '10001', nickname: 'A' },
        catalog: { riskVersion: 'fixture-current' },
        confirm: vi.fn(),
        cancel: vi.fn(),
    },
    ops: { load: vi.fn(), refresh: vi.fn(), unload: vi.fn(), statusOf: vi.fn(), banner: '' },
}));
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));
vi.mock('@/lib/api', async (load) => ({
    ...(await load<Record<string, unknown>>()),
    useApi: () => ({ logout: mocks.logout }),
}));
vi.mock('@/contexts/ThemeContext', async (load) => ({
    ...(await load<Record<string, unknown>>()),
    useTheme: () => ({ pollInterval: 10000, reloadAppearance: mocks.reloadAppearance }),
}));
vi.mock('@/contexts/SessionContext', async (load) => ({
    ...(await load<Record<string, unknown>>()),
    useSession: () => ({ status: 'fixture', onLogoutComplete: mocks.onLogoutComplete }),
}));
vi.mock('@/hooks/use-app-resources', () => ({
    useAppResources: () => ({
        connections: [],
        systemInfo: null,
        refreshProcesses: mocks.refreshProcesses,
    }),
}));
vi.mock('@/hooks/use-kernel-choice', () => ({
    useKernelChoice: () => ({ pending: mocks.pending, beforeAttach: mocks.beforeAttach }),
}));
vi.mock('@/hooks/use-hook-process-ops', () => ({
    useHookProcessOps: (options: unknown) => {
        mocks.useHookProcessOps(options);
        return {
            ops: mocks.ops,
            unloadFailedAlert: null,
            dismissUnloadFailedAlert: vi.fn(),
            cancelPending: mocks.cancelPending,
        };
    },
}));

afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe('AppLayout shared kernel choice owner', () => {
    it('passes one gated process owner to every route and keys one modal by real account/version', async () => {
        const host = hookHost();
        const tree = host.render(() => AppLayout());
        expect(mocks.useHookProcessOps).toHaveBeenCalledWith({
            beforeAttach: mocks.beforeAttach,
            onAfterOp: mocks.refreshProcesses,
        });
        expect(tree.props.value.processOps).toBe(mocks.ops);
        const dialogs = elements(tree).filter((element) => element.type === KernelChoiceDialog);
        expect(dialogs).toHaveLength(1);
        expect(dialogs[0].key).toMatch(/4242.*10001.*fixture-current/);
        expect(dialogs[0].props.choice).toBe(mocks.pending);
        await tree.props.value.onLogout();
        expect(mocks.cancelPending.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.logout.mock.invocationCallOrder[0],
        );
        expect(mocks.logout.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.onLogoutComplete.mock.invocationCallOrder[0],
        );
        host.unmount();
    });
});
