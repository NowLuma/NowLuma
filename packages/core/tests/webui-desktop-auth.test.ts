import { mkdtempSync, rmSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OneBotManager } from '@nowluma/onebot/manager';
import { initWebUI } from '../src/webui/server';
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
    temporary = mkdtempSync(path.join(os.tmpdir(), 'nowluma-desktop-auth-'));
    process.chdir(temporary);
    vi.stubEnv('NOWLUMA_DEV_MODE', '0');
    vi.stubEnv('NOWLUMA_DESKTOP_PROXY', '1');
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

function call(route: string, token = '', body?: unknown, cookie = '') {
    return capture.fetch!(
        new Request(`http://localhost:5099${route}`, {
            method: body === undefined ? 'GET' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Nowluma-Token': token,
                Cookie: cookie,
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
    );
}

function desktopCookie(response: Response) {
    return response.headers
        .getSetCookie()
        .find((value) => value.startsWith('nowluma_desktop_session='))!
        .split(';', 1)[0]!;
}

describe('desktop uses the actual WebUI authorization gates', () => {
    it('does not bypass required agreements and rejects a logged-out cookie', async () => {
        vi.stubEnv('NOWLUMA_WEBUI_BOOTSTRAP_PASSWORD', 'Initial!Password123');
        server = await initWebUI(5099, {} as OneBotManager);
        const login = await call('/api/login', '', { password: 'Initial!Password123' });
        const { token } = (await login.json()) as { token: string };
        const cookie = desktopCookie(login);
        expect((await call('/desktop/', '', undefined, cookie)).status).toBe(401);
        expect((await call('/api/desktop/session', token, {})).status).toBe(403);
        const { version } = (await (await call('/api/agreements', token)).json()) as {
            version: string;
        };
        expect((await call('/api/agreements/record-consent', token, { version })).status).toBe(200);
        expect((await call('/desktop/', '', undefined, cookie)).status).toBe(200);
        expect((await call('/api/desktop/session', '', {}, cookie)).status).toBe(401);
        await call('/api/logout', token, {});
        expect((await call('/desktop/', '', undefined, cookie)).status).toBe(401);
    });

    it('blocks the desktop before first password rotation and invalidates its cookie on rotation', async () => {
        vi.stubEnv('NOWLUMA_WEBUI_BOOTSTRAP_PASSWORD', '');
        vi.stubEnv('NOWLUMA_ACCEPT_EULA', '1');
        vi.stubEnv('NOWLUMA_ACCEPT_PRIVACY', '1');
        const original = WebuiAuth.prototype.takeInitialPassword;
        let password = '';
        vi.spyOn(WebuiAuth.prototype, 'takeInitialPassword').mockImplementation(function (
            this: WebuiAuth,
        ) {
            const value = original.call(this);
            password = value ?? '';
            return value;
        });
        server = await initWebUI(5099, {} as OneBotManager);
        const login = await call('/api/login', '', { password });
        const { token, mustChangePassword } = (await login.json()) as {
            token: string;
            mustChangePassword: boolean;
        };
        expect(mustChangePassword).toBe(true);
        const cookie = desktopCookie(login);
        expect((await call('/desktop/', '', undefined, cookie)).status).toBe(401);
        expect((await call('/api/desktop/session', token, {})).status).toBe(403);
        expect(
            (
                await call('/api/auth/change-password', token, {
                    oldPassword: password,
                    newPassword: 'Changed!Password123',
                })
            ).status,
        ).toBe(200);
        expect((await call('/desktop/', '', undefined, cookie)).status).toBe(401);
        const next = await call('/api/login', '', { password: 'Changed!Password123' });
        expect((await call('/desktop/', '', undefined, desktopCookie(next))).status).toBe(200);
    });
});
