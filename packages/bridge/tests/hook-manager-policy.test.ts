import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HookManager } from '../src/hook-manager';
import { PipeWatcher } from '../src/pipe-watcher';
import type { QqHookClient } from '../src/qq-hook-client';
import type { AccountLoginState } from '../src/qq-account';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
class Client extends EventEmitter {
    isClosed = false;
    state = { loggedIn: false, uin: '0', uinNumber: 0n };
    connectAll = vi.fn(async () => {});
    getLoginState() {
        return this.state;
    }
    reconcileLoginIdentity = vi.fn(async () => {});
    close() {
        this.isClosed = true;
    }
    login(uin: string) {
        this.state = { loggedIn: true, uin, uinNumber: BigInt(uin) };
        this.emit('loginState', this.state);
    }
}
const cleanups: Array<() => void> = [];
afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
});

function setup(
    options: { auto?: boolean; live?: boolean; uin?: string | null; pids?: number[] } = {},
) {
    let uin = options.uin === undefined ? '10001' : options.uin;
    let live = options.live ?? false;
    let pids = options.pids ?? [4242];

    let notify = () => {};

    const approved = new Set<string>();
    const clients: Client[] = [];
    const processes = async () => pids.map((pid) => ({ pid, name: 'qq', path: '' }));
    const watcher = new PipeWatcher({
        listProcesses: processes,
        listLivePipes: async () => new Set(live ? pids : []),
        intervalMs: 60_000,
    });
    const detect = vi.fn(async (): Promise<AccountLoginState[]> =>
        uin ? pids.map((pid) => ({ pid, uin: uin!, uid: 'test', nickname: 'test' })) : [],
    );
    const inject = vi.fn(async () => ({
        method: 'loadModuleManual' as const,
        handle: { base: 0n, entry: 0n, exceptionTable: 0n, size: 0 },
    }));
    const bridge = {
        onHookLogin: vi.fn(),
        onPacket: vi.fn(),
        onPidDisconnected: vi.fn(),
        onPidReceiveHealthChanged: vi.fn(),
    };
    const authorize = vi.fn(async (account: string) => {
        if (!approved.has(account)) {
            throw new Error('explicit consent required');
        }
    });
    const manager = new HookManager({
        bridgeManager: bridge,
        injector: { inject, unload: vi.fn(async () => {}) },
        pipeWatcher: watcher,
        makeClient: () => {
            const client = new Client();
            clients.push(client);
            return client as unknown as QqHookClient;
        },
        listProcesses: processes,
        detectAccounts: detect,
        watchAccounts: (_pids, callback) => {
            notify = callback;

            return () => {};
        },
        autoLoadOnDiscovery: options.auto,
        authorizeAccount: authorize,
    });
    cleanups.push(() => {
        manager.dispose();
        watcher.dispose();
    });
    return {
        manager,
        watcher,
        inject,
        bridge,
        clients,
        approved,
        detect,
        authorize,
        setUin: (next: string | null) => {
            uin = next;
        },
        setLive: (next: boolean) => {
            live = next;
        },
        setProcesses: (next: number[]) => {
            pids = next;
        },
        notify: () => notify(),
    };
}

describe('HookManager account authorization', () => {
    it.each([false, true])(
        'blocks unapproved manual and auto native injection (auto=%s)',
        async (auto) => {
            const ctx = setup({ auto });
            await ctx.manager.listProcesses();
            await flush();
            const info = await ctx.manager.loadProcess(4242);
            expect(info).toMatchObject({ status: 'error', injected: false, connected: false });
            expect(info.error).toContain('内核选择待确认');
            expect(ctx.inject).not.toHaveBeenCalled();
            expect(ctx.clients).toHaveLength(0);
            expect((await ctx.manager.refreshProcess(4242)).error).toContain('内核选择待确认');
            ctx.authorize.mockClear();

            for (let i = 0; i < 5; i++) {
                await ctx.watcher.tickNow();
            }

            await flush();
            expect(ctx.authorize).not.toHaveBeenCalled();
        },
    );

    it('blocks an existing pipe before creating a client, then permits explicit refresh after consent', async () => {
        const ctx = setup({ live: true });
        await ctx.manager.listProcesses();
        await flush();
        expect(ctx.clients).toHaveLength(0);
        ctx.approved.add('10001');
        expect((await ctx.manager.refreshProcess(4242)).connected).toBe(true);
        expect(ctx.inject).not.toHaveBeenCalled();
        ctx.clients[0]!.login('10001');
        await flush();
        expect(ctx.bridge.onHookLogin).toHaveBeenCalledWith(4242, '10001', expect.anything());
    });

    it('does not inherit another account approval, unknown identity or detection failure', async () => {
        const ctx = setup({ uin: null });
        ctx.approved.add('10001');
        expect((await ctx.manager.loadProcess(4242)).injected).toBe(false);
        ctx.setUin('20002');
        expect((await ctx.manager.loadProcess(4242)).injected).toBe(false);
        ctx.setUin('10001');
        ctx.detect.mockRejectedValueOnce(new Error('identity unavailable'));
        expect((await ctx.manager.loadProcess(4242)).injected).toBe(false);
        expect(ctx.inject).not.toHaveBeenCalled();
        expect((await ctx.manager.loadProcess(4242)).injected).toBe(true);
    });

    it('revokes a direct hook-reported account switch before packets or login bind', async () => {
        const ctx = setup({ live: true });
        ctx.approved.add('10001');
        ctx.approved.add('20002');
        await ctx.manager.refreshProcess(4242);
        const client = ctx.clients[0]!;
        client.login('10001');
        await flush();
        expect(ctx.bridge.onHookLogin).toHaveBeenCalledTimes(1);
        ctx.setUin('20002');
        client.login('20002');
        client.emit('packet', {
            uin: '20002',
            cmd: 'Test',
            body: Buffer.alloc(0),
            seq: 1,
            error: 0,
        });
        expect(client.isClosed).toBe(true);
        expect(ctx.bridge.onHookLogin).toHaveBeenCalledTimes(1);
        expect(ctx.bridge.onPacket).not.toHaveBeenCalled();
        expect(ctx.bridge.onPidDisconnected).toHaveBeenCalledWith(4242);
    });

    it('rechecks local identity on account watcher changes while online', async () => {
        const ctx = setup({ live: true });
        ctx.approved.add('10001');
        await ctx.manager.refreshProcess(4242);
        ctx.clients[0]!.login('10001');
        await flush();
        ctx.setUin('20002');
        ctx.notify();
        await flush();
        expect(ctx.clients[0]!.isClosed).toBe(true);
        expect(ctx.bridge.onPidDisconnected).toHaveBeenCalledWith(4242);
    });

    it('discards late identity detection when the manager is disposed', async () => {
        const ctx = setup();
        ctx.approved.add('10001');
        await ctx.manager.listProcesses();
        const deferred = Promise.withResolvers<AccountLoginState[]>();
        ctx.detect.mockImplementationOnce(() => deferred.promise);
        const pending = ctx.manager.loadProcess(4242);
        await flush();
        ctx.manager.dispose();
        deferred.resolve([{ pid: 4242, uin: '10001', uid: 'test', nickname: 'test' }]);
        await pending;
        expect(ctx.inject).not.toHaveBeenCalled();
        expect(ctx.clients).toHaveLength(0);
    });

    it('does not read account data on each online heartbeat', async () => {
        const ctx = setup({ live: true });
        ctx.approved.add('10001');
        await ctx.manager.refreshProcess(4242);
        const client = ctx.clients[0]!;
        client.login('10001');
        await flush();
        const reads = ctx.detect.mock.calls.length;

        for (let i = 0; i < 20; i++) {
            client.login('10001');
            client.emit('packet', {
                uin: '10001',
                cmd: 'Test',
                body: Buffer.alloc(0),
                seq: i,
                error: 0,
            });
        }

        expect(ctx.detect).toHaveBeenCalledTimes(reads);
    });
});

describe('HookManager authorization races', () => {
    it('allows authorized native auto-load and blocks delayed detection invalidated by an account change', async () => {
        const ctx = setup({ auto: true });
        ctx.approved.add('10001');
        await ctx.manager.listProcesses();
        await flush();
        expect(ctx.inject).toHaveBeenCalledTimes(1);
        const other = setup();
        other.approved.add('10001');
        await other.manager.listProcesses();
        const deferred = Promise.withResolvers<AccountLoginState[]>();
        other.detect.mockImplementationOnce(() => deferred.promise);
        const pending = other.manager.loadProcess(4242);
        await flush();
        other.setUin('20002');
        other.notify();
        deferred.resolve([{ pid: 4242, uin: '10001', uid: 'test', nickname: 'test' }]);
        const result = await pending;
        expect(result.error).toContain('内核选择待确认');
        expect(other.inject).not.toHaveBeenCalled();
    });

    it('never connects an existing pipe without local identity, even when another account has consent', async () => {
        const ctx = setup({ live: true, uin: null });
        ctx.approved.add('10001');
        await ctx.manager.refreshProcess(4242);
        expect(ctx.clients).toHaveLength(0);
        expect(ctx.inject).not.toHaveBeenCalled();
    });

    it('rechecks consent before reconnecting a closed client', async () => {
        const ctx = setup({ live: true });
        ctx.approved.add('10001');
        await ctx.manager.refreshProcess(4242);
        const client = ctx.clients[0]!;
        client.login('10001');
        await flush();
        client.isClosed = true;
        client.emit('close');
        await flush();
        ctx.approved.clear();
        await ctx.manager.refreshProcess(4242);
        expect(ctx.clients).toHaveLength(1);
        ctx.approved.add('10001');
        expect((await ctx.manager.refreshProcess(4242)).connected).toBe(true);
        const replacement = ctx.clients[1]!;
        replacement.login('10001');
        await flush();
        expect(ctx.bridge.onHookLogin).toHaveBeenCalledTimes(2);
    });

    it('rejects foreign packets even without a login-state switch', async () => {
        const ctx = setup({ live: true });
        ctx.approved.add('10001');
        await ctx.manager.refreshProcess(4242);
        const client = ctx.clients[0]!;
        client.login('10001');
        await flush();
        client.emit('packet', {
            uin: '20002',
            cmd: 'Test',
            body: Buffer.alloc(0),
            seq: 1,
            error: 0,
        });
        expect(client.isClosed).toBe(true);
        expect(ctx.bridge.onPacket).not.toHaveBeenCalled();
        expect(ctx.bridge.onPidDisconnected).toHaveBeenCalledWith(4242);
    });
});

describe('HookManager authorization lifecycle', () => {
    it('discards a delayed login authorization after logout', async () => {
        const ctx = setup({ live: true });
        ctx.approved.add('10001');
        await ctx.manager.refreshProcess(4242);
        const deferred = Promise.withResolvers<AccountLoginState[]>();
        ctx.detect.mockImplementationOnce(() => deferred.promise);
        const client = ctx.clients[0]!;
        client.login('10001');
        client.emit('loginState', { loggedIn: false, uin: '0', uinNumber: 0n });
        deferred.resolve([{ pid: 4242, uin: '10001', uid: 'test', nickname: 'test' }]);
        await flush();
        expect(ctx.bridge.onHookLogin).not.toHaveBeenCalled();
        client.login('10001');
        await flush();
        expect(ctx.bridge.onHookLogin).toHaveBeenCalledTimes(1);
    });

    it('does not inject after process disappearance while identity detection is in flight', async () => {
        const ctx = setup();
        ctx.approved.add('10001');
        await ctx.manager.listProcesses();
        const deferred = Promise.withResolvers<AccountLoginState[]>();
        ctx.detect.mockImplementationOnce(() => deferred.promise);
        const pending = ctx.manager.loadProcess(4242);
        await flush();
        ctx.watcher.emit('process-gone', 4242);
        deferred.resolve([{ pid: 4242, uin: '10001', uid: 'test', nickname: 'test' }]);
        await pending;
        await flush();
        expect(ctx.inject).not.toHaveBeenCalled();
        expect(ctx.clients).toHaveLength(0);
    });
});

const settle = async () => {
    for (let i = 0; i < 3; i += 1) {
        await flush();
    }
};

describe('HookManager auto-load after login', () => {
    it('attaches an approved account that signs in after discovery, once', async () => {
        const ctx = setup({ auto: true, uin: null });
        ctx.approved.add('10001');
        await ctx.manager.listProcesses();
        await settle();
        expect(ctx.inject).not.toHaveBeenCalled();
        expect(ctx.authorize).not.toHaveBeenCalled();
        const initial = (await ctx.manager.listProcesses())[0]!;
        expect(initial.status).toBe('error');
        expect(initial.error).toContain('内核选择待确认');
        expect(initial.manualStopped).toBe(false);

        ctx.setUin('10001');
        ctx.notify();
        await settle();
        expect(ctx.inject).toHaveBeenCalledExactlyOnceWith(4242);
        expect(ctx.authorize).toHaveBeenCalledExactlyOnceWith('10001');

        for (let i = 0; i < 3; i += 1) {
            await ctx.watcher.tickNow();
        }

        ctx.notify();
        await settle();
        expect(ctx.inject).toHaveBeenCalledTimes(1);
        expect(ctx.authorize).toHaveBeenCalledTimes(1);
    });

    it('keeps an unconfirmed account waiting after one attempt', async () => {
        const ctx = setup({ auto: true, uin: '10001' });
        await ctx.manager.listProcesses();
        await settle();
        expect(ctx.authorize).toHaveBeenCalledTimes(1);
        expect(ctx.inject).not.toHaveBeenCalled();

        ctx.notify();

        for (let i = 0; i < 3; i += 1) {
            await ctx.watcher.tickNow();
        }

        await settle();
        expect(ctx.authorize).toHaveBeenCalledTimes(1);
        expect(ctx.inject).not.toHaveBeenCalled();
        expect((await ctx.manager.listProcesses())[0]!.error).toContain('内核选择待确认');
    });

    it('re-arms when the gate could not resolve an identity that later appears', async () => {
        const ctx = setup({ auto: true, uin: '10001' });
        ctx.approved.add('10001');
        let fail = true;
        ctx.detect.mockImplementation(async () => {
            if (fail) {
                throw new Error('identity unavailable');
            }

            return [{ pid: 4242, uin: '10001', uid: 'test', nickname: 'test' }];
        });
        await ctx.manager.listProcesses();
        await settle();
        expect(ctx.inject).not.toHaveBeenCalled();

        fail = false;
        ctx.notify();
        await settle();
        expect(ctx.inject).toHaveBeenCalledExactlyOnceWith(4242);
    });

    it('does not attach a newly known account when auto-load is disabled', async () => {
        const ctx = setup({ auto: false, uin: null });
        ctx.approved.add('10001');
        await ctx.manager.listProcesses();
        await settle();
        ctx.setUin('10001');
        ctx.notify();

        for (let i = 0; i < 3; i += 1) {
            await ctx.watcher.tickNow();
        }

        await settle();
        expect(ctx.inject).not.toHaveBeenCalled();
        expect(ctx.authorize).not.toHaveBeenCalled();
    });
});

describe('HookManager manual unload', () => {
    it('stays stopped across pipe, account and tick events until an explicit load', async () => {
        const ctx = setup({ auto: true, live: true });
        ctx.approved.add('10001');
        await ctx.manager.listProcesses();
        await settle();
        expect(ctx.clients).toHaveLength(1);
        ctx.clients[0]!.login('10001');
        await settle();
        const authorizations = ctx.authorize.mock.calls.length;

        const unloaded = await ctx.manager.unloadProcess(4242);
        expect(unloaded).toMatchObject({ status: 'connecting', manualStopped: true });
        expect(unloaded.error).toContain('命名管道仍然存在');
        expect(ctx.clients[0]!.isClosed).toBe(true);

        ctx.notify();

        for (let i = 0; i < 3; i += 1) {
            await ctx.watcher.tickNow();
        }

        const refreshed = await ctx.manager.refreshProcess(4242);
        await settle();
        expect(ctx.clients).toHaveLength(1);
        expect(ctx.inject).not.toHaveBeenCalled();
        expect(ctx.authorize).toHaveBeenCalledTimes(authorizations);
        expect(refreshed).toMatchObject({ status: 'connecting', manualStopped: true });
        expect(refreshed.error).toContain('命名管道仍然存在');

        const loaded = await ctx.manager.loadProcess(4242);
        expect(loaded).toMatchObject({ injected: true, manualStopped: false });
        expect(ctx.inject).not.toHaveBeenCalled();
        expect(await ctx.manager.refreshProcess(4242)).toMatchObject({
            connected: true,
            manualStopped: false,
        });
        await settle();
        expect(ctx.clients).toHaveLength(2);
    });

    it('keeps a policy-pending unload cancelled and auto-loads only the next PID lifecycle', async () => {
        const ctx = setup({ auto: true, uin: null });
        ctx.approved.add('10001');
        await ctx.manager.listProcesses();
        await settle();
        expect(ctx.inject).not.toHaveBeenCalled();

        expect(await ctx.manager.unloadProcess(4242)).toMatchObject({
            status: 'available',
            manualStopped: true,
        });

        ctx.setUin('10001');
        ctx.notify();

        for (let i = 0; i < 3; i += 1) {
            await ctx.watcher.tickNow();
        }

        await settle();
        expect(ctx.inject).not.toHaveBeenCalled();
        expect(ctx.clients).toHaveLength(0);
        expect(ctx.authorize).not.toHaveBeenCalled();

        ctx.setProcesses([]);
        await ctx.watcher.tickNow();
        await settle();
        ctx.setProcesses([5555]);
        await ctx.watcher.tickNow();
        await settle();
        expect(ctx.inject).toHaveBeenCalledExactlyOnceWith(5555);
    });
});
