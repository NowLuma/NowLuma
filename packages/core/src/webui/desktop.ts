import { WebSocketServer, type WebSocket } from '@nowluma/websocket';
import { createLogger } from '@nowluma/common/logger';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import type { IncomingMessage, Server } from 'node:http';
import type { Socket } from 'node:net';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import type { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { parse } from 'hono/utils/cookie';
import { connectAuthenticatedVnc, RFB_VERSION } from './desktop-rfb';
import { DESKTOP_CLIENT, DESKTOP_HTML, DESKTOP_STYLE } from './desktop-page';

const log = createLogger('Desktop');
const COOKIE = 'nowluma_desktop_session';
const COOKIE_PATH = '/desktop';
const options = (secure: boolean) => ({
    httpOnly: true,
    sameSite: 'Strict' as const,
    secure,
    path: COOKIE_PATH,
});

export function setDesktopSessionCookie(c: Context, token: string, tls: boolean): void {
    const secure = tls || c.req.header('origin')?.startsWith('https://') === true;
    setCookie(c, COOKIE, token, { ...options(secure), maxAge: 24 * 60 * 60 });
}

export function clearDesktopSessionCookie(c: Context, tls: boolean): void {
    deleteCookie(c, COOKIE, options(tls));
}

/** A browser-origin match is mandatory for upgrade, even with a valid cookie. */
export function desktopOriginAllowed(
    origin: string | undefined,
    host: string | undefined,
): boolean {
    if (!origin || !host) {
        return false;
    }

    try {
        const url = new URL(origin);
        return (
            ['http:', 'https:'].includes(url.protocol) && url.origin === origin && url.host === host
        );
    } catch {
        return false;
    }
}

export interface DesktopOptions {
    enabled: boolean;
    sessionAllowed: (token: string) => boolean;
    passwordFile?: string;
    staticRoot?: string;
    port?: number;
}

/** Only authentication gates live here; the VNC target is always loopback. */
export function createDesktopGateway(app: Hono, config: DesktopOptions) {
    const root = config.staticRoot ?? '/usr/share/novnc';
    const passwordFile = config.passwordFile ?? path.join(process.env.HOME ?? '', '.vnc/password');
    const wss = new WebSocketServer({
        noServer: true,
        maxPayload: 1024 * 1024,
        perMessageDeflate: false,
    });
    const active = new Set<WebSocket>();
    let server: Server | undefined;

    const authorize = (c: Context) =>
        config.enabled && config.sessionAllowed(getCookie(c, COOKIE) ?? '');

    for (const route of ['/desktop', '/desktop/*']) {
        app.use(route, async (c, next) => {
            c.header('Cache-Control', 'no-store');

            if (!authorize(c)) {
                return c.text(
                    '请返回控制台登录，再打开 QQ 桌面。 / Sign in to the console first.',
                    401,
                );
            }

            const origin = c.req.header('origin');

            if (origin && !desktopOriginAllowed(origin, c.req.header('host'))) {
                return c.text('Forbidden', 403);
            }

            return next();
        });
    }

    app.get('/desktop', (c) => c.redirect('/desktop/'));
    app.get('/desktop/', (c) => {
        c.header(
            'Content-Security-Policy',
            "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'none'",
        );
        return c.html(DESKTOP_HTML);
    });
    app.get('/desktop/client.js', (c) =>
        c.body(DESKTOP_CLIENT, 200, { 'Content-Type': 'text/javascript; charset=utf-8' }),
    );
    app.get('/desktop/style.css', (c) =>
        c.body(DESKTOP_STYLE, 200, { 'Content-Type': 'text/css; charset=utf-8' }),
    );
    app.get('/desktop/vendor/*', (c) => {
        try {
            const relative = decodeURIComponent(c.req.path.slice('/desktop/vendor/'.length));

            if (relative.includes('\0') || relative.includes('\\')) {
                return c.text('Not found', 404);
            }

            const file = realpathSync(path.resolve(root, relative));
            const base = realpathSync(root) + path.sep;

            if (!file.startsWith(base) || !statSync(file).isFile() || !file.endsWith('.js')) {
                return c.text('Not found', 404);
            }

            return c.body(readFileSync(file), 200, {
                'Content-Type': 'text/javascript; charset=utf-8',
            });
        } catch {
            return c.text('Not found', 404);
        }
    });

    const upgrade = (req: IncomingMessage, transport: Duplex, head: Buffer) => {
        if (req.url !== '/desktop/socket') {
            transport.destroy();
            return;
        }

        const token = parse(req.headers.cookie ?? '', COOKIE)[COOKIE] ?? '';

        if (!config.enabled || !config.sessionAllowed(token)) {
            transport.end(
                'HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
            );
            return;
        }

        if (!desktopOriginAllowed(req.headers.origin, req.headers.host)) {
            transport.end(
                'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
            );
            return;
        }

        if (active.size >= 8) {
            transport.destroy();
            return;
        }

        wss.handleUpgrade(req, transport, head, (ws) => {
            active.add(ws);
            bridge(ws, transport, token).catch((error: unknown) => {
                log.warn(
                    'desktop connection failed: %s',
                    error instanceof Error ? error.message : String(error),
                );
                ws.close(1011, 'Desktop connection failed');
            });
        });
    };

    async function bridge(ws: WebSocket, transport: Duplex, token: string) {
        const abort = new AbortController();
        let vnc: Socket | undefined;
        let pending = Buffer.alloc(0);
        let stage = 0;
        const expire = setInterval(() => {
            if (!config.sessionAllowed(token)) {
                ws.close(1008, 'Console session expired');
            }
        }, 1000);
        expire.unref();
        ws.once('close', () => {
            clearInterval(expire);
            active.delete(ws);
            abort.abort();
            vnc?.destroy();
        });
        ws.on('error', () => ws.terminate());
        ws.on('message', (data: Buffer, binary: boolean) => {
            if (!config.sessionAllowed(token)) {
                ws.close(1008, 'Console session expired');
                return;
            }

            if (!binary) {
                ws.close(1003, 'Binary frames required');
                return;
            }

            if (stage === 3) {
                if (vnc && !vnc.write(data)) {
                    transport.pause();
                }

                return;
            }

            pending = Buffer.concat([pending, data]);

            if (pending.length > 14) {
                ws.close(1008, 'Invalid desktop handshake');
                return;
            }

            settle();
        });

        function settle() {
            if (!vnc) {
                return;
            }

            if (stage === 0 && pending.length >= 12) {
                if (!pending.subarray(0, 12).equals(RFB_VERSION)) {
                    ws.close(1008, 'RFB 3.8 required');
                    return;
                }

                pending = pending.subarray(12);
                stage = 1;
                // The gateway already authenticated to VNC; the browser uses its console session.
                ws.send(Buffer.from([1, 1]));
            }

            if (stage === 1 && pending.length >= 1) {
                if (pending[0] !== 1) {
                    ws.close(1008, 'Invalid security type');
                    return;
                }

                pending = pending.subarray(1);
                stage = 2;
                ws.send(Buffer.alloc(4));
            }

            if (stage === 2 && pending.length >= 1) {
                const shared = pending[0];
                pending = pending.subarray(1);

                if (shared !== 0 && shared !== 1) {
                    ws.close(1008, 'Invalid desktop initialization');
                    return;
                }

                stage = 3;
                vnc.on('data', (chunk: Buffer) => {
                    if (!config.sessionAllowed(token)) {
                        ws.close(1008, 'Console session expired');
                        return;
                    }

                    vnc!.pause();
                    ws.send(chunk, (error) => {
                        if (error) {
                            vnc!.destroy();
                        } else {
                            vnc!.resume();
                        }
                    });
                });
                vnc.on('drain', () => transport.resume());
                vnc.once('close', () => ws.close(1000, 'Desktop disconnected'));
                vnc.write(Buffer.from([shared]));

                if (pending.length) {
                    vnc.write(pending);
                }

                pending = Buffer.alloc(0);
                vnc.resume();
            }
        }

        const storedPassword = readFileSync(passwordFile);
        const password =
            storedPassword.length === 9 && storedPassword[8] === 10
                ? storedPassword.subarray(0, 8)
                : storedPassword;

        if (password.length !== 8) {
            throw new Error('Invalid private desktop credential');
        }

        try {
            vnc = await connectAuthenticatedVnc(password, abort.signal, config.port);
        } finally {
            password.fill(0);
        }

        ws.send(RFB_VERSION);
        settle();
    }

    return {
        attach(listener: Server) {
            if (!config.enabled) {
                return;
            }

            server = listener;
            listener.on('upgrade', upgrade);
        },
        stop() {
            server?.off('upgrade', upgrade);

            for (const ws of active) {
                ws.terminate();
            }

            wss.close();
        },
    };
}
