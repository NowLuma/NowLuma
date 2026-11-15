import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Secret, TOTP } from 'otpauth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as logger from '@nowluma/common/logger';
import type { OneBotManager } from '@nowluma/onebot/manager';
import { initWebUI } from '../src/webui/server';
import { StateBus } from '../src/webui/state-bus';

const capture = vi.hoisted(() => ({
    fetch: undefined as ((request: Request) => Response | Promise<Response>) | undefined,
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

const PASSWORD = 'Initial!Password123';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const STREAM_ROUTES = [
    '/api/debug/stream',
    '/api/logs/stream',
    '/api/state/stream',
    '/api/debug/invoke-stream',
] as const;

interface Invocation {
    emit: (json: string) => Promise<void>;
    isAlive: () => boolean;
    finish: () => void;
    settled: boolean;
}

interface WatchedStream {
    route: string;
    text: string;
    closed: boolean;
    reader: ReadableStreamDefaultReader<Uint8Array>;
    finished: Promise<void>;
}

let cwd: string;
let temporary: string;
let server: Awaited<ReturnType<typeof initWebUI>> | undefined;
let streams: WatchedStream[];
let invocations: Invocation[];
let activeLogs: number;

beforeEach(() => {
    cwd = process.cwd();
    temporary = mkdtempSync(path.join(os.tmpdir(), 'nowluma-session-streams-'));
    process.chdir(temporary);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-19T12:00:00Z'));
    vi.stubEnv('NOWLUMA_DEV_MODE', '0');
    vi.stubEnv('NOWLUMA_WEBUI_BOOTSTRAP_PASSWORD', PASSWORD);
    vi.stubEnv('NOWLUMA_ACCEPT_EULA', '1');
    vi.stubEnv('NOWLUMA_ACCEPT_PRIVACY', '1');
    vi.stubEnv('NOWLUMA_DESKTOP_PROXY', '0');
    streams = [];
    invocations = [];
    activeLogs = 0;
    const subscribe = logger.subscribeLogs;
    vi.spyOn(logger, 'subscribeLogs').mockImplementation((listener) => {
        const unsubscribe = subscribe(listener);
        activeLogs++;

        return () => {
            activeLogs--;
            unsubscribe();
        };
    });
});

afterEach(async () => {
    await server?.stop();
    server = undefined;
    await Promise.all(streams.map((stream) => stream.reader.cancel()));
    invocations.forEach((invocation) => invocation.finish());
    await Promise.all(streams.map((stream) => stream.finished));
    vi.clearAllTimers();
    vi.useRealTimers();
    process.chdir(cwd);
    rmSync(temporary, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

function call(route: string, token = '', body?: unknown, signal?: AbortSignal, cookie = '') {
    return capture.fetch!(
        new Request(`http://localhost:5099${route}`, {
            method: body === undefined ? 'GET' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Nowluma-Token': token,
                Cookie: cookie,
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            signal,
        }),
    );
}

async function login(secondFactor: Record<string, string> = {}): Promise<string> {
    const response = await call('/api/login', '', { password: PASSWORD, ...secondFactor });
    expect(response.status).toBe(200);
    const result = (await response.json()) as { success: boolean; token: string };
    expect(result.success).toBe(true);
    return result.token;
}

function makeInstance(uin: string) {
    const events = new Set<(event: unknown) => void>();
    const actions = new Set<(action: Record<string, unknown>) => void>();
    const instance = {
        uin,
        nickname: 'isolated fake',
        subscribeDebugEvents: vi.fn((listener: (event: unknown) => void) => {
            events.add(listener);
            return () => events.delete(listener);
        }),
        observeActions: vi.fn((listener: (action: Record<string, unknown>) => void) => {
            actions.add(listener);
            return () => actions.delete(listener);
        }),
        invokeAction: vi.fn(async () => ({ status: 'ok', retcode: 0 })),
        invokeStream: vi.fn(
            async (_request: string, emit: Invocation['emit'], isAlive: Invocation['isAlive']) => {
                let finish!: () => void;
                const pending = new Promise<void>((resolve) => {
                    finish = resolve;
                });
                const invocation: Invocation = { emit, isAlive, finish, settled: false };
                invocations.push(invocation);

                try {
                    await emit(JSON.stringify({ kind: 'invoke-ready', uin }));
                    await pending;
                    await emit(JSON.stringify({ kind: 'invoke-finished', uin }));
                } finally {
                    invocation.settled = true;
                }
            },
        ),
    };
    return { instance, events, actions };
}

async function start() {
    const accounts = [makeInstance('123456'), makeInstance('234567')];
    const bus = new StateBus();
    let activeState = 0;
    const subscribe = bus.subscribe.bind(bus);
    vi.spyOn(bus, 'subscribe').mockImplementation((listener) => {
        const unsubscribe = subscribe(listener);
        activeState++;

        return () => {
            activeState--;
            unsubscribe();
        };
    });
    const manager = {
        getInstance: (uin: string) =>
            accounts.find((account) => account.instance.uin === uin)?.instance ?? null,
        getInstances: vi.fn(() => accounts.map((account) => account.instance)),
        getConnectionStatuses: vi.fn(() => []),
    };
    server = await initWebUI(5099, manager as unknown as OneBotManager, undefined, undefined, {
        stateBus: bus,
    });
    return {
        accounts,
        expectSubscribers(count: number) {
            for (const account of accounts) {
                expect(account.events.size).toBe(count);
                expect(account.actions.size).toBe(count);
            }

            expect(activeLogs).toBe(count);
            expect(activeState).toBe(count);
        },
        async publish(marker: string) {
            for (const account of accounts) {
                account.events.forEach((listener) => listener({ marker }));
                account.actions.forEach((listener) => listener({ action: marker }));
            }

            logger.createLogger('SessionStreamTest').info(marker);
            bus.publish('qq-list');
            await vi.advanceTimersByTimeAsync(50);
        },
    };
}

async function openStreams(token: string, signal?: AbortSignal): Promise<WatchedStream[]> {
    const opened: WatchedStream[] = [];

    for (const route of STREAM_ROUTES) {
        const response = await call(
            route,
            token,
            route === '/api/debug/invoke-stream'
                ? { uin: '123456', action: 'fake_pending' }
                : undefined,
            signal,
        );
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('text/event-stream');
        const stream: WatchedStream = {
            route,
            text: '',
            closed: false,
            reader: response.body!.getReader(),
            finished: Promise.resolve(),
        };
        const decoder = new TextDecoder();
        stream.finished = (async () => {
            for (;;) {
                const result = await stream.reader.read();

                if (result.done) {
                    stream.closed = true;
                    return;
                }

                stream.text += decoder.decode(result.value);
            }
        })();
        streams.push(stream);
        opened.push(stream);
    }

    await vi.advanceTimersByTimeAsync(0);
    return opened;
}

async function expectClosed(opened: WatchedStream[]) {
    await vi.advanceTimersByTimeAsync(0);

    for (const stream of opened) {
        expect(stream.closed, stream.route).toBe(true);
    }

    await Promise.all(opened.map((stream) => stream.finished));
}

async function expectRejected(token: string) {
    for (const route of STREAM_ROUTES) {
        const response = await call(
            route,
            token,
            route === '/api/debug/invoke-stream'
                ? { uin: '123456', action: 'fake_pending' }
                : undefined,
        );
        expect(response.status, route).toBe(401);
    }
}

function totp(secret: string): string {
    return new TOTP({ secret: Secret.fromBase32(secret) }).generate({ timestamp: Date.now() });
}

async function enableTotp(token: string) {
    const beginning = await call('/api/auth/totp/begin', token, {});
    expect(beginning.status).toBe(200);
    const { secret } = (await beginning.json()) as { secret: string };
    const confirmation = await call('/api/auth/totp/confirm', token, {
        password: PASSWORD,
        code: totp(secret),
    });
    expect(confirmation.status).toBe(200);
    const { recoveryCodes } = (await confirmation.json()) as { recoveryCodes: string[] };
    return { secret, recoveryCodes };
}

describe('WebUI session stream revocation', () => {
    it.each(['logout', 'password change', 'TOTP confirmation', 'TOTP disable'])(
        '%s closes every affected stream before any later account disclosure',
        async (revocation) => {
            const fixture = await start();
            let tokenA: string;
            const tokenB = await login();
            let enrollment: Awaited<ReturnType<typeof enableTotp>> | undefined;

            if (revocation === 'TOTP disable') {
                enrollment = await enableTotp(tokenB);
                vi.setSystemTime(Date.now() + 30_000);
                tokenA = await login({ totp: totp(enrollment.secret) });
            } else {
                tokenA = await login();
            }

            const openedA = await openStreams(tokenA);
            const openedB = await openStreams(tokenB);
            fixture.expectSubscribers(2);
            await fixture.publish('before-revocation');
            expect(openedA[0].text).toContain('before-revocation');
            expect(openedB[0].text).toContain('before-revocation');

            if (revocation === 'logout') {
                expect((await call('/api/logout', tokenA, {})).status).toBe(200);
            } else if (revocation === 'password change') {
                const response = await call('/api/auth/change-password', tokenB, {
                    oldPassword: PASSWORD,
                    newPassword: 'Changed!Password123',
                });
                expect(await response.json()).toEqual({ success: true, requireRelogin: true });
            } else if (revocation === 'TOTP confirmation') {
                await enableTotp(tokenB);
            } else {
                expect(
                    (
                        await call('/api/auth/totp/disable', tokenB, {
                            password: PASSWORD,
                            recoveryCode: enrollment!.recoveryCodes[0],
                        })
                    ).status,
                ).toBe(200);
            }

            const revokeAll = revocation === 'password change';
            fixture.expectSubscribers(revokeAll ? 0 : 1);
            await expectClosed(openedA);

            if (revokeAll) {
                await expectClosed(openedB);
            } else {
                expect(openedB.every((stream) => !stream.closed)).toBe(true);
                expect((await call('/api/status', tokenB)).status).toBe(200);
            }

            expect(invocations[0].isAlive()).toBe(false);
            expect(invocations[0].settled).toBe(false);
            await expect(invocations[0].emit('{"marker":"forbidden-late-frame"}')).rejects.toThrow(
                'stream transport closed',
            );
            await fixture.publish('after-revocation');
            expect(openedA.every((stream) => !stream.text.includes('after-revocation'))).toBe(true);
            expect(openedA.every((stream) => !stream.text.includes('forbidden-late-frame'))).toBe(
                true,
            );

            if (!revokeAll) {
                expect(openedB[0].text).toContain('after-revocation');
                expect(openedB[1].text).toContain('after-revocation');
            }

            await expectRejected(tokenA);

            if (revokeAll) {
                await expectRejected(tokenB);
            }

            invocations[0].finish();
            await vi.advanceTimersByTimeAsync(0);
            expect(invocations[0].settled).toBe(true);
            expect(fixture.accounts[0].instance.invokeStream).toHaveBeenCalledTimes(2);
        },
    );

    it('expires idle streams at the original token deadline without waiting for maintenance', async () => {
        const fixture = await start();
        const issuedAt = Date.now();
        const tokenA = await login();
        vi.setSystemTime(issuedAt + TOKEN_TTL_MS - 10);
        const tokenB = await login();
        const openedA = await openStreams(tokenA);
        const openedB = await openStreams(tokenB);
        fixture.expectSubscribers(2);
        await vi.advanceTimersByTimeAsync(10);
        expect(openedA.every((stream) => !stream.closed)).toBe(true);
        await vi.advanceTimersByTimeAsync(1);
        fixture.expectSubscribers(1);
        await expectClosed(openedA);
        expect(openedB.every((stream) => !stream.closed)).toBe(true);
        await fixture.publish('after-expiry');
        expect(openedA.every((stream) => !stream.text.includes('after-expiry'))).toBe(true);
        expect(openedB[0].text).toContain('after-expiry');
        await expectRejected(tokenA);
    });

    it.each(['API check', 'avatar check', 'token maintenance'])(
        '%s also revokes streams when it finds an expired token',
        async (expiryPath) => {
            const fixture = await start();
            const issuedAt = Date.now();
            const tokenA = await login();
            vi.setSystemTime(issuedAt + 5 * 60_000);
            const tokenB = await login();
            const openedA = await openStreams(tokenA);
            const openedB = await openStreams(tokenB);
            vi.setSystemTime(issuedAt + TOKEN_TTL_MS + 1);

            if (expiryPath === 'API check') {
                expect((await call('/api/status', tokenA)).status).toBe(401);
            } else if (expiryPath === 'avatar check') {
                expect(
                    (
                        await call(
                            '/avatar/123456',
                            '',
                            undefined,
                            undefined,
                            `nowluma_avatar_session=${tokenA}`,
                        )
                    ).status,
                ).toBe(401);
            } else {
                await vi.advanceTimersByTimeAsync(60_000);
            }

            fixture.expectSubscribers(1);
            await expectClosed(openedA);
            expect(openedB.every((stream) => !stream.closed)).toBe(true);
            await fixture.publish('expired-token-must-not-see');
            expect(
                openedA.every((stream) => !stream.text.includes('expired-token-must-not-see')),
            ).toBe(true);
            await expectRejected(tokenA);
        },
    );

    it('does not revoke another session for an unknown logout token or a failed credential change', async () => {
        const fixture = await start();
        const token = await login();
        const opened = await openStreams(token);
        expect((await call('/api/logout', 'unknown-token', {})).status).toBe(401);
        expect(
            (
                await call('/api/auth/change-password', token, {
                    oldPassword: 'incorrect',
                    newPassword: 'Changed!Password123',
                })
            ).status,
        ).toBe(401);
        fixture.expectSubscribers(1);
        await fixture.publish('still-authorized');
        expect(opened[0].text).toContain('still-authorized');
        expect(opened.every((stream) => !stream.closed)).toBe(true);
    });

    it('releases stream subscriptions and timers on body cancellation, request abort and stop', async () => {
        const fixture = await start();
        const token = await login();
        const maintenanceTimers = vi.getTimerCount();
        const canceled = await openStreams(token);
        const activeTimers = vi.getTimerCount();
        expect(activeTimers).toBeGreaterThan(maintenanceTimers);
        await Promise.all(canceled.map((stream) => stream.reader.cancel()));
        await expectClosed(canceled);
        fixture.expectSubscribers(0);
        expect(vi.getTimerCount()).toBe(maintenanceTimers);
        const abort = new AbortController();
        const aborted = await openStreams(token, abort.signal);
        expect(vi.getTimerCount()).toBe(activeTimers);
        abort.abort();
        await expectClosed(aborted);
        fixture.expectSubscribers(0);
        expect(vi.getTimerCount()).toBe(maintenanceTimers);
        const stopped = await openStreams(token);
        await server!.stop();
        server = undefined;
        await expectClosed(stopped);
        fixture.expectSubscribers(0);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('does not start a stream action when its session is revoked while reading the body', async () => {
        const fixture = await start();
        const token = await login();
        let completeBody!: () => void;
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                completeBody = () => {
                    controller.enqueue(
                        new TextEncoder().encode(
                            JSON.stringify({
                                uin: '123456',
                                action: 'fake_pending',
                            }),
                        ),
                    );
                    controller.close();
                };
            },
        });
        const pending = capture.fetch!(
            new Request('http://localhost:5099/api/debug/invoke-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Nowluma-Token': token },
                body,
                ...{ duplex: 'half' },
            }),
        );
        await vi.advanceTimersByTimeAsync(0);
        expect((await call('/api/logout', token, {})).status).toBe(200);
        completeBody();
        const response = await pending;
        expect(await response.text()).toBe('');
        expect(fixture.accounts[0].instance.invokeStream).not.toHaveBeenCalled();
        fixture.expectSubscribers(0);
        expect(vi.getTimerCount()).toBe(1);
    });

    it('lets an already authorized non-stream action settle unchanged after credential revocation', async () => {
        const fixture = await start();
        const tokenA = await login();
        const tokenB = await login();
        const result = {
            status: 'failed',
            retcode: 1400,
            message: 'original uncertain write detail',
        };
        let finish!: (response: typeof result) => void;
        fixture.accounts[0].instance.invokeAction.mockImplementationOnce(
            () =>
                new Promise<typeof result>((resolve) => {
                    finish = resolve;
                }),
        );
        const pending = call('/api/debug/invoke', tokenA, {
            uin: '123456',
            action: 'uncertain_write',
        });
        await vi.advanceTimersByTimeAsync(0);
        expect(fixture.accounts[0].instance.invokeAction).toHaveBeenCalledOnce();
        await call('/api/auth/change-password', tokenB, {
            oldPassword: PASSWORD,
            newPassword: 'Changed!Password123',
        });
        finish(result);
        expect(await (await pending).json()).toEqual(result);
        expect(fixture.accounts[0].instance.invokeAction).toHaveBeenCalledOnce();
        await expectRejected(tokenA);
    });
});
