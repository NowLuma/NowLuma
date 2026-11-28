import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../src/lib/api/client';

const initialToken = 'initial-session';
const rotatedToken = 'rotated-session';

afterEach(() => vi.unstubAllGlobals());

describe('password-change session rotation', () => {
    it('authenticates subsequent requests with the rotated session despite an old 401', async () => {
        const previous = Promise.withResolvers<Response>();
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string, init?: RequestInit) => {
                if (url === '/api/previous') {
                    return previous.promise;
                }

                if (url === '/api/auth/change-password') {
                    return Promise.resolve(Response.json({ success: true, token: rotatedToken }));
                }

                const authorized =
                    new Headers(init?.headers).get('X-Nowluma-Token') === rotatedToken;
                return Promise.resolve(Response.json({}, { status: authorized ? 200 : 401 }));
            }),
        );
        const save = vi.fn();
        const onUnauthorized = vi.fn();
        const client = createApiClient({
            tokenStore: { load: () => initialToken, save },
            onUnauthorized,
        });
        const oldRequest = client.request('/api/previous');

        await expect(client.changePassword('old-password', 'new-password')).resolves.toEqual({
            success: true,
            message: undefined,
            token: rotatedToken,
        });
        previous.resolve(new Response(null, { status: 401 }));
        await oldRequest;

        expect(await client.status()).toBe(true);
        expect(save.mock.calls).toEqual([[rotatedToken]]);
        expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it.each(['logout', 'login'] as const)(
        'does not replace the current session when a password response arrives after %s',
        async (action) => {
            const pendingResponse = Promise.withResolvers<Response>();
            vi.stubGlobal(
                'fetch',
                vi.fn((url: string) => {
                    if (url === '/api/auth/change-password') {
                        return pendingResponse.promise;
                    }

                    return Promise.resolve(Response.json({ token: 'later-session' }));
                }),
            );
            const save = vi.fn();
            const client = createApiClient({ tokenStore: { load: () => initialToken, save } });
            const pendingChange = client.changePassword('old-password', 'new-password');

            if (action === 'logout') {
                await client.logout();
            } else {
                await client.login('new-password');
            }

            pendingResponse.resolve(Response.json({ success: true, token: rotatedToken }));
            await expect(pendingChange).resolves.toEqual({
                success: false,
                message: '密码已修改，但登录状态已变化，请确认当前会话',
            });
            expect(save.mock.calls).toEqual([[action === 'logout' ? null : 'later-session']]);
        },
    );

    it.each([
        { success: true },
        { success: true, token: '' },
        { success: true, token: 123 },
        { success: 'true', token: rotatedToken },
    ])('rejects an invalid rotation response without advancing setup (%j)', async (payload) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));
        const save = vi.fn();
        const client = createApiClient({ tokenStore: { load: () => initialToken, save } });

        await expect(client.changePassword('old-password', 'new-password')).resolves.toMatchObject({
            success: false,
        });
        expect(save).not.toHaveBeenCalled();
    });
});
