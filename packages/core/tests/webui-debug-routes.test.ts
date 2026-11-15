import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { OneBotInstance } from '@nowluma/onebot/instance';
import { registerDebugRoutes, resolveDebugInvoke } from '../src/webui/debug-routes';

function makeApp() {
    const getInstance = vi.fn();
    const getInstances = vi.fn(() => []);
    const app = new Hono();
    registerDebugRoutes(app, {
        manager: { getInstance, getInstances },
        shutdown: new AbortController().signal,
    });
    return { app, getInstance };
}

function post(app: Hono, path: string, body: string) {
    return app.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    });
}

const badRequests: { body: string; message: string }[] = [
    { body: '{', message: '请求格式错误' },
    { body: JSON.stringify({ uin: 'not-a-uin', action: 'send_msg' }), message: '无效的账号' },
    { body: JSON.stringify({ uin: '123456', action: '' }), message: 'action 必填' },
    {
        body: JSON.stringify({ uin: '123456', action: 'send_msg', params: [] }),
        message: 'params 必须是对象',
    },
];

describe('shared debug invoke validation', () => {
    for (const path of ['/api/debug/invoke', '/api/debug/invoke-stream']) {
        it(`${path} rejects malformed bodies in the shared order without touching an account`, async () => {
            const { app, getInstance } = makeApp();

            for (const { body, message } of badRequests) {
                const res = await post(app, path, body);
                expect(res.status).toBe(400);
                expect(await res.json()).toEqual({ status: 'failed', message });
            }

            const offline = await post(
                app,
                path,
                JSON.stringify({ uin: '123456', action: 'send_msg' }),
            );
            expect(offline.status).toBe(404);
            expect(await offline.json()).toEqual({ status: 'failed', message: '账号不在线' });
            expect(getInstance).toHaveBeenCalledTimes(1);
        });
    }

    it('looks up the account only after the whole body is valid', async () => {
        const { app, getInstance } = makeApp();
        await post(app, '/api/debug/invoke', JSON.stringify({ uin: '123456', action: '' }));
        expect(getInstance).not.toHaveBeenCalled();
    });
});

describe('debug invoke after validation', () => {
    it('invokes the action on the resolved instance', async () => {
        const invokeAction = vi.fn(async () => ({ status: 'ok', retcode: 0 }));
        const instance = { invokeAction } as unknown as OneBotInstance;
        const app = new Hono();
        registerDebugRoutes(app, {
            manager: { getInstance: () => instance, getInstances: () => [instance] },
            shutdown: new AbortController().signal,
        });

        const res = await post(
            app,
            '/api/debug/invoke',
            JSON.stringify({ uin: '123456', action: 'send_msg', params: { x: 1 } }),
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: 'ok', retcode: 0 });
        expect(invokeAction).toHaveBeenCalledWith('send_msg', { x: 1 });
    });
});

describe('resolveDebugInvoke', () => {
    it('passes an empty params object through as before', async () => {
        const instance = {} as OneBotInstance;
        const target = await resolveDebugInvoke(
            {
                req: { json: async () => ({ uin: '123456', action: 'send_msg' }) },
            } as never,
            { getInstance: () => instance },
        );
        expect(target).toEqual({
            ok: true,
            instance,
            input: { action: 'send_msg', params: {} },
        });
    });
});
