import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OneBotManager } from '@nowluma/onebot/manager';
import { initWebUI } from '../src/webui/server';
import { COMPAT_RISK_VERSION, KernelPolicyStore } from '../src/kernel-policy';
import { WebuiAuth } from '../src/webui/auth';

const capture = vi.hoisted(() => ({
    fetch: undefined as ((req: Request) => Response | Promise<Response>) | undefined,
}));
vi.mock('@hono/node-server', () => ({
    serve: vi.fn(
        (options: { fetch: typeof capture.fetch }, listen: (info: { port: number }) => void) => {
            capture.fetch = options.fetch;
            const server = new EventEmitter();
            Object.assign(server, { close: (done: () => void) => done() });
            queueMicrotask(() => listen({ port: 5099 }));
            return server;
        },
    ),
}));
vi.mock('../src/webui/port', () => ({ findAvailablePort: vi.fn(async () => 5099) }));

let temporary: string;
let cwd: string;
let server: Awaited<ReturnType<typeof initWebUI>> | undefined;

beforeEach(() => {
    cwd = process.cwd();
    temporary = mkdtempSync(path.join(os.tmpdir(), 'nowluma-route-guards-'));
    process.chdir(temporary);
    vi.stubEnv('NOWLUMA_DEV_MODE', '1');
    vi.stubEnv('NOWLUMA_ACCEPT_EULA', '');
    vi.stubEnv('NOWLUMA_ACCEPT_PRIVACY', '');
});

afterEach(async () => {
    await server?.stop();
    server = undefined;
    process.chdir(cwd);
    rmSync(temporary, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

function call(route: string, token = '', body?: unknown) {
    return capture.fetch!(
        new Request(`http://localhost:5099${route}`, {
            method: body === undefined ? 'GET' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Nowluma-Token': token,
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
    );
}

async function login(): Promise<string> {
    const res = await call('/api/login', '', { password: 'nowluma-dev' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { token: string };
    return json.token;
}

const MOVED_ROUTES = ['/api/system/settings', '/api/debug/actions'];

describe('moved route groups stay behind the WebUI guards', () => {
    it('rejects unauthenticated requests before reaching the route handlers', async () => {
        server = await initWebUI(5099, {} as OneBotManager);

        for (const route of MOVED_ROUTES) {
            expect((await call(route)).status).toBe(401);
        }

        const invoke = await call('/api/debug/invoke', '', {
            uin: '123456',
            action: 'send_msg',
        });
        expect(invoke.status).toBe(401);
    });

    it('applies the consent gate to moved routes, then serves them after consent', async () => {
        server = await initWebUI(5099, {} as OneBotManager);
        const token = await login();

        for (const route of MOVED_ROUTES) {
            const res = await call(route, token);
            expect(res.status).toBe(403);
            expect(await res.json()).toMatchObject({ consentRequired: true });
        }

        const agreements = (await (await call('/api/agreements', token)).json()) as {
            version: string;
        };
        const recorded = await call('/api/agreements/record-consent', token, {
            version: agreements.version,
        });
        expect(recorded.status).toBe(200);

        expect((await call('/api/debug/actions', token)).status).toBe(200);

        const settings = await call('/api/system/settings', token);
        expect(settings.status).toBe(200);
        expect(await settings.json()).toMatchObject({
            listeningPort: 5099,
            restartRequiredToApply: true,
        });

        // No state bus is wired in this test: the endpoint is registered behind
        // auth and reports "not configured" instead of 401/404.
        expect((await call('/api/state/stream', token)).status).toBe(503);

        const badInvoke = await call('/api/debug/invoke', token, {
            uin: '123456',
            action: '',
        });
        expect(badInvoke.status).toBe(400);
        expect(await badInvoke.json()).toEqual({ status: 'failed', message: 'action 必填' });
    });
});

const KERNEL_ACCOUNT = '/api/kernel/accounts/10001';
const KERNEL_CHOICE = { kernel: 'compat', riskAccepted: true, riskVersion: COMPAT_RISK_VERSION };

async function acceptConsent(token: string) {
    const agreements = (await (await call('/api/agreements', token)).json()) as { version: string };
    expect(
        (await call('/api/agreements/record-consent', token, { version: agreements.version }))
            .status,
    ).toBe(200);
}

describe('account kernel routes', () => {
    it('exposes only the safe catalog publicly and guards account reads and writes through consent and revocation', async () => {
        const store = new KernelPolicyStore();
        server = await initWebUI(5099, {} as OneBotManager, undefined, undefined, {
            kernelPolicy: store,
        });
        const catalog = await call('/api/kernel/catalog');
        expect(catalog.status).toBe(200);
        expect(await catalog.json()).toMatchObject({
            riskVersion: COMPAT_RISK_VERSION,
            options: [
                { id: 'compat', label: '兼容内核', available: true },
                { id: 'rewrite', label: '重写内核', available: false },
            ],
        });
        expect((await call('/api/kernel/catalog', '', {})).status).toBe(401);
        expect((await call(KERNEL_ACCOUNT)).status).toBe(401);
        expect((await call(KERNEL_ACCOUNT, '', KERNEL_CHOICE)).status).toBe(401);
        const token = await login();
        expect((await call(KERNEL_ACCOUNT, token)).status).toBe(403);
        expect((await call(KERNEL_ACCOUNT, token, KERNEL_CHOICE)).status).toBe(403);
        await acceptConsent(token);
        expect(await (await call(KERNEL_ACCOUNT, token)).json()).toMatchObject({
            selection: null,
            canLoad: false,
        });
        const saved = await call(KERNEL_ACCOUNT, token, KERNEL_CHOICE);
        expect(saved.status).toBe(200);
        expect(await saved.json()).toMatchObject({
            success: true,
            selection: KERNEL_CHOICE,
            canLoad: true,
        });
        expect(await (await call('/api/kernel/accounts/20002', token)).json()).toMatchObject({
            selection: null,
            canLoad: false,
        });
        expect((await call('/api/logout', token, {})).status).toBe(200);
        expect((await call(KERNEL_ACCOUNT, token)).status).toBe(401);
        expect((await call(KERNEL_ACCOUNT, token, KERNEL_CHOICE)).status).toBe(401);
    });

    it('blocks account policy while the password must change', async () => {
        vi.spyOn(WebuiAuth.prototype, 'mustChangePassword').mockReturnValue(true);
        server = await initWebUI(5099, {} as OneBotManager, undefined, undefined, {
            kernelPolicy: new KernelPolicyStore(),
        });
        const token = await login();
        await acceptConsent(token);

        for (const body of [undefined, KERNEL_CHOICE]) {
            const response = await call(KERNEL_ACCOUNT, token, body);
            expect(response.status).toBe(403);
            expect(await response.json()).toMatchObject({ mustChangePassword: true });
        }
    });

    it('rejects invalid choices and reports corrupt storage without overwriting it', async () => {
        const store = new KernelPolicyStore();
        server = await initWebUI(5099, {} as OneBotManager, undefined, undefined, {
            kernelPolicy: store,
        });
        const token = await login();
        await acceptConsent(token);

        for (const [body, status] of [
            [{ ...KERNEL_CHOICE, kernel: 'rewrite' }, 409],
            [{ ...KERNEL_CHOICE, riskAccepted: false }, 400],
            [{ ...KERNEL_CHOICE, riskVersion: 'stale' }, 409],
            [{ ...KERNEL_CHOICE, extra: true }, 400],
        ] as const) {
            expect((await call(KERNEL_ACCOUNT, token, body)).status).toBe(status);
        }

        expect((await call('/api/kernel/accounts/0', token, KERNEL_CHOICE)).status).toBe(400);
        expect(
            (await call(KERNEL_ACCOUNT, token, { ...KERNEL_CHOICE, data: 'x'.repeat(5000) }))
                .status,
        ).toBe(413);
        store.save('10001', KERNEL_CHOICE);
        writeFileSync(path.join('config', 'kernel-selections.json'), '{broken');
        expect((await call(KERNEL_ACCOUNT, token)).status).toBe(500);
        expect((await call(KERNEL_ACCOUNT, token, KERNEL_CHOICE)).status).toBe(500);
        expect(() => store.get('10001')).toThrow('损坏');
    });
});
