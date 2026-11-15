import { mkdtempSync, rmSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OneBotManager } from '@nowluma/onebot/manager';
import { initWebUI } from '../src/webui/server';

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
