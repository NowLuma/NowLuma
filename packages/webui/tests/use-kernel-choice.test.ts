import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoKernelCatalog, demoProcess } from '../src/demo/fixtures';
import { useKernelChoice } from '../src/hooks/use-kernel-choice';
import { useHookProcessOps } from '../src/hooks/use-hook-process-ops';
import type { HookProcessInfo } from '../src/types';
import type { KernelChoiceInput, KernelSelection } from '../src/lib/api/types';
import { hookHost } from './helpers/hook-host';

const mocks = vi.hoisted(() => ({
    api: {
        processes: { list: vi.fn(), load: vi.fn(), refresh: vi.fn(), unload: vi.fn() },
        kernel: { catalog: vi.fn(), get: vi.fn(), save: vi.fn() },
    },
    runAction: vi.fn(async (_options: unknown, action: () => Promise<unknown>) => action()),
    onAfterOp: vi.fn(),
}));
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));
vi.mock('@/lib/api', async (load) => ({
    ...(await load<Record<string, unknown>>()),
    useApi: () => mocks.api,
}));
vi.mock('@/contexts/ActionFeedbackContext', () => ({
    useActionFeedback: () => ({ runAction: mocks.runAction }),
}));

const catalog = demoKernelCatalog();
const input: KernelChoiceInput = {
    kernel: 'compat',
    riskAccepted: true,
    riskVersion: catalog.riskVersion,
};
const saved: KernelSelection = { ...input, acceptedAt: '2026-11-15T12:00:00.000Z' };
let process: HookProcessInfo;
let selections: Map<string, KernelSelection>;
let choiceHost: ReturnType<typeof hookHost>;
let opsHost: ReturnType<typeof hookHost>;
const choice = () => choiceHost.render(() => useKernelChoice());

const operations = () => {
    const { beforeAttach } = choice();
    return opsHost.render(() => useHookProcessOps({ beforeAttach, onAfterOp: mocks.onAfterOp }));
};

const pendingChoice = async () => {
    await vi.waitFor(() => expect(choice().pending).not.toBeNull());
    return choice().pending!;
};

beforeEach(() => {
    vi.clearAllMocks();
    choiceHost = hookHost();
    opsHost = hookHost();
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    process = { ...demoProcess(), account: { uin: '10001', nickname: 'account A' } };
    selections = new Map();
    mocks.api.processes.list.mockImplementation(async () => [process]);
    mocks.api.kernel.catalog.mockResolvedValue(catalog);
    mocks.api.kernel.get.mockImplementation(async (uin: string) => ({
        selection: selections.get(uin) ?? null,
        options: catalog.options,
        canLoad: selections.has(uin),
    }));
    mocks.api.kernel.save.mockImplementation(async (uin: string, value: KernelChoiceInput) => {
        const selection = { ...value, acceptedAt: saved.acceptedAt };
        selections.set(uin, selection);
        return { success: true, selection, canLoad: true };
    });

    for (const kind of ['load', 'refresh', 'unload'] as const) {
        mocks.api.processes[kind].mockImplementation(async () => ({
            success: true,
            process: {
                ...process,
                status: kind === 'unload' ? 'available' : 'injected',
                error: '',
            },
        }));
    }
});
afterEach(() => {
    opsHost.unmount();
    choiceHost.unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('useKernelChoice through the shared useHookProcessOps load/refresh owner', () => {
    it.each([undefined, { uin: '', nickname: '' }, { uin: 'PID:4242', nickname: '' }])(
        'requires a fresh real account and never asks or attaches for %j',
        async (account) => {
            process.account = account;
            await operations().ops.load(process.pid);
            expect(mocks.api.processes.list).toHaveBeenCalledTimes(1);
            expect(choice().pending).toBeNull();
            expect(mocks.api.kernel.get).not.toHaveBeenCalled();
            expect(mocks.api.kernel.save).not.toHaveBeenCalled();
            expect(mocks.api.processes.load).not.toHaveBeenCalled();
            expect(operations().ops.banner).toContain('尚未识别当前 QQ 账号');
        },
    );

    it('cancel keeps zero POST/load/refresh effects and inflight dedupe includes the dialog wait', async () => {
        const ops = operations().ops;
        const loading = ops.load(process.pid);
        const pending = await pendingChoice();
        expect(operations().ops.statusOf(process.pid)).toBe('load');
        await ops.load(process.pid);
        await ops.refresh(process.pid);
        expect(mocks.api.kernel.get).toHaveBeenCalledTimes(1);
        pending.cancel();
        await loading;
        expect(choice().pending).toBeNull();
        expect(mocks.api.kernel.save).not.toHaveBeenCalled();
        expect(mocks.api.processes.load).not.toHaveBeenCalled();
        expect(mocks.api.processes.refresh).not.toHaveBeenCalled();
        expect(mocks.runAction).not.toHaveBeenCalled();
        expect(operations().ops.statusOf(process.pid)).toBeNull();
    });

    it.each(['load', 'refresh'] as const)(
        'saves account A once, rechecks identity and performs explicit %s once',
        async (kind) => {
            const work = operations().ops[kind](process.pid);
            const pending = await pendingChoice();
            await Promise.all([pending.confirm(input), pending.confirm(input)]);
            await work;
            expect(mocks.api.kernel.save).toHaveBeenCalledTimes(1);
            expect(mocks.api.kernel.save).toHaveBeenCalledWith(
                '10001',
                input,
                expect.any(AbortSignal),
            );
            expect(mocks.api.processes[kind]).toHaveBeenCalledTimes(1);
            expect(mocks.api.processes.list).toHaveBeenCalledTimes(3);
            expect(mocks.onAfterOp).toHaveBeenCalledTimes(1);
            expect(choice().pending).toBeNull();

            process = { ...process, account: { uin: '20002', nickname: 'account B' } };
            const second = operations().ops.load(process.pid);
            expect((await pendingChoice()).target.uin).toBe('20002');
            choice().pending!.cancel();
            await second;
            expect(selections.has('20002')).toBe(false);
            expect(mocks.api.kernel.save).toHaveBeenCalledTimes(1);
        },
    );

    it('uses a saved account choice without asking again, but still re-reads the PID identity', async () => {
        selections.set('10001', saved);
        await operations().ops.load(process.pid);
        expect(mocks.api.processes.list).toHaveBeenCalledTimes(2);
        expect(mocks.api.kernel.catalog).not.toHaveBeenCalled();
        expect(mocks.api.kernel.save).not.toHaveBeenCalled();
        expect(mocks.api.processes.load).toHaveBeenCalledTimes(1);
    });

    it.each([
        new Error('策略存储失败'),
        { success: false, message: '未保存' },
        { success: true, canLoad: true, selection: { ...saved, riskVersion: 'old' } },
    ])('failed or unknown save remains an error and never operates (%j)', async (failure) => {
        if (failure instanceof Error) {
            mocks.api.kernel.save.mockRejectedValueOnce(failure);
        } else {
            mocks.api.kernel.save.mockResolvedValueOnce(failure);
        }

        const work = operations().ops.load(process.pid);
        const pending = await pendingChoice();
        await expect(pending.confirm(input)).rejects.toThrow();
        expect(choice().pending).toBe(pending);
        expect(mocks.api.processes.load).not.toHaveBeenCalled();
        expect(mocks.onAfterOp).not.toHaveBeenCalled();
        pending.cancel();
        await work;
    });

    it('a late saved-policy response cannot authorize a different account now using the PID', async () => {
        let finishPolicy!: (value: unknown) => void;
        mocks.api.kernel.get.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishPolicy = resolve;
                }),
        );
        const work = operations().ops.load(process.pid);
        await vi.waitFor(() => expect(mocks.api.kernel.get).toHaveBeenCalledTimes(1));
        process = { ...process, account: { uin: '20002', nickname: 'B' } };
        finishPolicy({ selection: saved, options: catalog.options, canLoad: true });
        await work;
        expect(mocks.api.processes.load).not.toHaveBeenCalled();
        expect(mocks.api.kernel.save).not.toHaveBeenCalled();
        expect(operations().ops.banner).toContain('账号或进程已变化');
    });

    it('a backend autoload-policy error leads to the same explicit account choice on load', async () => {
        process = { ...process, status: 'error', error: '请为此 QQ 账号选择接入内核' };
        const work = operations().ops.load(process.pid);
        const pending = await pendingChoice();
        expect(pending.target.uin).toBe('10001');
        await pending.confirm(input);
        await work;
        expect(mocks.api.kernel.save).toHaveBeenCalledTimes(1);
        expect(mocks.api.processes.load).toHaveBeenCalledTimes(1);
    });

    it('rejects an inactive acknowledgment and disabled rewrite before saving', async () => {
        const work = operations().ops.load(process.pid);
        const pending = await pendingChoice();

        for (const invalid of [
            { ...input, riskAccepted: false },
            { ...input, kernel: 'rewrite' as const },
            { ...input, riskVersion: 'old' },
        ]) {
            await expect(pending.confirm(invalid)).rejects.toThrow('请主动确认');
        }

        expect(mocks.api.kernel.save).not.toHaveBeenCalled();
        pending.cancel();
        await work;
    });

    it.each(['account', 'path'] as const)(
        'blocks a changed %s before saving, without borrowing the old acknowledgment',
        async (field) => {
            const work = operations().ops.load(process.pid);
            const pending = await pendingChoice();

            if (field === 'account') {
                process = { ...process, account: { uin: '20002', nickname: 'B' } };
            } else {
                process = { ...process, path: '/different/QQ' };
            }

            await expect(pending.confirm(input)).rejects.toThrow('账号或进程已变化');
            expect(mocks.api.kernel.save).not.toHaveBeenCalled();
            expect(mocks.api.processes.load).not.toHaveBeenCalled();
            pending.cancel();
            await work;
        },
    );

    it('a switch during a late save authorizes only A, never B or the recycled PID', async () => {
        let finishSave!: (result: unknown) => void;
        mocks.api.kernel.save.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishSave = resolve;
                }),
        );
        const work = operations().ops.load(process.pid);
        const pending = await pendingChoice();
        const confirming = pending.confirm(input);
        await vi.waitFor(() => expect(mocks.api.kernel.save).toHaveBeenCalledTimes(1));
        selections.set('10001', saved);
        process = { ...process, account: { uin: '20002', nickname: 'B' } };
        finishSave({ success: true, selection: saved, canLoad: true });
        await confirming;
        await work;
        expect(mocks.api.kernel.save.mock.calls[0][0]).toBe('10001');
        expect(selections.has('20002')).toBe(false);
        expect(mocks.api.processes.load).not.toHaveBeenCalled();
        expect(operations().ops.banner).toContain('账号或进程已变化');
    });

    it.each(['logout', 'unmount'] as const)(
        '%s resolves a pending modal and ignores its late confirmation',
        async (reason) => {
            const controller = operations();
            const work = controller.ops.load(process.pid);
            const pending = await pendingChoice();

            if (reason === 'logout') {
                controller.cancelPending();
            } else {
                opsHost.unmount();
                choiceHost.unmount();
            }

            await work;
            await pending.confirm(input);
            expect(mocks.api.kernel.save).not.toHaveBeenCalled();
            expect(mocks.api.processes.load).not.toHaveBeenCalled();
        },
    );

    it('logout aborts a save already in flight and its late response cannot inject', async () => {
        let finishSave!: (result: unknown) => void;
        mocks.api.kernel.save.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishSave = resolve;
                }),
        );
        const controller = operations();
        const work = controller.ops.load(process.pid);
        const pending = await pendingChoice();
        const confirming = pending.confirm(input);
        await vi.waitFor(() => expect(mocks.api.kernel.save).toHaveBeenCalledTimes(1));
        const signal = mocks.api.kernel.save.mock.calls[0][2] as AbortSignal;
        controller.cancelPending();
        expect(signal.aborted).toBe(true);
        await work;
        finishSave({ success: true, selection: saved, canLoad: true });
        await expect(confirming).rejects.toMatchObject({ name: 'AbortError' });
        expect(mocks.api.processes.load).not.toHaveBeenCalled();
    });

    it('unload never asks and preserves the existing still-connected failure alert', async () => {
        mocks.api.processes.unload.mockResolvedValueOnce({
            success: true,
            process: { ...process, status: 'connecting', error: '管道仍存活' },
        });
        await operations().ops.unload(process.pid);
        expect(mocks.api.processes.list).not.toHaveBeenCalled();
        expect(mocks.api.kernel.get).not.toHaveBeenCalled();
        expect(operations().unloadFailedAlert).toEqual({ pid: process.pid, error: '管道仍存活' });
        operations().dismissUnloadFailedAlert();
        expect(operations().unloadFailedAlert).toBeNull();
    });

    it.each([
        { process: { pid: 4242, status: 'injected' } },
        { success: false, process: { pid: 4242, status: 'error', error: '操作失败' } },
    ])('does not report an unknown/failed operation as successful (%j)', async (outcome) => {
        selections.set('10001', saved);
        mocks.api.processes.load.mockResolvedValueOnce(outcome);
        await operations().ops.load(process.pid);
        expect(operations().ops.banner).toContain('加载失败');
        expect(mocks.onAfterOp).not.toHaveBeenCalled();
    });
});
