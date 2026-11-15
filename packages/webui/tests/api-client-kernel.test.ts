import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoKernelCatalog } from '../src/demo/fixtures';
import { createApiClient } from '../src/lib/api/client';
import type { KernelChoiceInput } from '../src/lib/api/types';

const catalog = demoKernelCatalog();
const choice: KernelChoiceInput = {
    kernel: 'compat',
    riskAccepted: true,
    riskVersion: catalog.riskVersion,
};
const selection = { ...choice, acceptedAt: '2026-11-15T12:00:00.000Z' };
const tokenStore = { load: () => 'fixture-token', save: vi.fn() };
const response = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status });

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('ApiClient.kernel transport', () => {
    it('fetches the public catalog without a token and scopes guarded GET/POST to the real UIN', async () => {
        const fetch = vi
            .fn()
            .mockResolvedValueOnce(response(catalog))
            .mockResolvedValueOnce(
                response({ selection: null, options: catalog.options, canLoad: false }),
            )
            .mockResolvedValueOnce(response({ success: true, selection, canLoad: true }));
        vi.stubGlobal('fetch', fetch);
        const client = createApiClient({ tokenStore });

        expect(await client.kernel.catalog()).toEqual(catalog);
        expect(new Headers(fetch.mock.calls[0][1]?.headers).has('X-Nowluma-Token')).toBe(false);
        expect((await client.kernel.get('10001')).canLoad).toBe(false);
        expect(await client.kernel.save('10001', choice)).toEqual({
            success: true,
            selection,
            canLoad: true,
        });
        expect(fetch.mock.calls.map(([url]) => url)).toEqual([
            '/api/kernel/catalog',
            '/api/kernel/accounts/10001',
            '/api/kernel/accounts/10001',
        ]);
        const init = fetch.mock.calls[2][1];
        expect(init.method).toBe('POST');
        expect(new Headers(init.headers).get('X-Nowluma-Token')).toBe('fixture-token');
        expect(JSON.parse(init.body)).toEqual(choice);
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it.each(['', '0001', 'PID:4242', '10001/20002', '-1'])(
        'rejects unknown/unsafe UIN %j before requesting',
        async (uin) => {
            const fetch = vi.fn();
            vi.stubGlobal('fetch', fetch);
            const client = createApiClient({ tokenStore });
            await expect(client.kernel.get(uin)).rejects.toMatchObject({ status: 400 });
            await expect(client.kernel.save(uin, choice)).rejects.toMatchObject({ status: 400 });
            expect(fetch).not.toHaveBeenCalled();
        },
    );

    it('rejects extra fields or malformed input before a POST', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        const client = createApiClient({ tokenStore });

        for (const input of [
            null,
            {},
            { ...choice, uin: '20002' },
            { ...choice, riskAccepted: 'true' },
            { ...choice, riskVersion: '' },
            Object.assign(Object.create(choice), { first: 1, second: 2, third: 3 }),
        ]) {
            await expect(
                client.kernel.save('10001', input as KernelChoiceInput),
            ).rejects.toMatchObject({ status: 400 });
        }

        expect(fetch).not.toHaveBeenCalled();
    });

    it.each([
        {
            input: { ...choice, riskAccepted: false },
            status: 400,
            message: '必须主动确认兼容内核风险',
        },
        {
            input: { ...choice, kernel: 'rewrite' as const },
            status: 409,
            message: '当前平台尚未验证',
        },
        { input: { ...choice, riskVersion: 'old' }, status: 409, message: '风险说明版本已更新' },
        { input: choice, status: 500, message: '策略存储失败' },
    ])('preserves the $status save error without retry', async ({ input, status, message }) => {
        const fetch = vi.fn().mockResolvedValue(response({ success: false, message }, status));
        vi.stubGlobal('fetch', fetch);
        const client = createApiClient({ tokenStore });
        await expect(client.kernel.save('10001', input)).rejects.toMatchObject({ status, message });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it.each([
        {},
        { ...catalog, riskVersion: '' },
        { ...catalog, riskText: 42 },
        { ...catalog, options: [catalog.options[0], catalog.options[0]] },
        { ...catalog, options: [{ ...catalog.options[0], reason: null }, catalog.options[1]] },
    ])('rejects a malformed catalog boundary (%j)', async (payload) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload)));
        await expect(createApiClient({ tokenStore }).kernel.catalog()).rejects.toMatchObject({
            status: 502,
            code: 'INVALID_RESPONSE',
        });
    });

    it.each([
        { selection: null, canLoad: true },
        { selection: { ...selection, kernel: 'rewrite' }, canLoad: true },
        { selection: { ...selection, riskAccepted: false }, canLoad: true },
        { selection: { ...selection, acceptedAt: 'not-a-date' }, canLoad: false },
        { selection, canLoad: 'true' },
    ])('rejects an inconsistent account policy (%j)', async (payload) => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(response({ options: catalog.options, ...payload })),
        );
        await expect(createApiClient({ tokenStore }).kernel.get('10001')).rejects.toMatchObject({
            status: 502,
            code: 'INVALID_RESPONSE',
        });
    });

    it.each([
        { success: false },
        { canLoad: false },
        { selection: null },
        { selection: { ...selection, riskVersion: 'old' } },
        { selection: { ...selection, riskAccepted: false } },
        { selection: { ...selection, acceptedAt: '' } },
        { selection: { ...selection, kernel: 'rewrite' } },
    ])('never treats an unconfirmed save as successful (%j)', async (patch) => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValue(response({ success: true, canLoad: true, selection, ...patch })),
        );
        await expect(
            createApiClient({ tokenStore }).kernel.save('10001', choice),
        ).rejects.toMatchObject({ status: 502, code: 'INVALID_RESPONSE' });
    });

    it('propagates a caller abort to public and private requests', async () => {
        const signals: AbortSignal[] = [];
        const fetch = vi.fn(
            (_url: string, init: RequestInit) =>
                new Promise((_resolve, reject) => {
                    const signal = init.signal!;
                    signals.push(signal);
                    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
                }),
        );
        vi.stubGlobal('fetch', fetch);
        const client = createApiClient({ tokenStore });
        const abort = new AbortController();
        const catalogRequest = client.kernel.catalog(abort.signal);
        const accountRequest = client.kernel.get('10001', abort.signal);
        const saveRequest = client.kernel.save('10001', choice, abort.signal);
        abort.abort();
        await expect(catalogRequest).rejects.toMatchObject({ name: 'AbortError' });
        await expect(accountRequest).rejects.toMatchObject({ name: 'AbortError' });
        await expect(saveRequest).rejects.toMatchObject({ name: 'AbortError' });
        expect(signals).toHaveLength(3);
        expect(signals.every((signal) => signal.aborted)).toBe(true);
    });
});
