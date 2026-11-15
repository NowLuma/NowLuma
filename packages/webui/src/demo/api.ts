import { normalizeOneBotConfig } from '@/lib/onebot-config';
import { normalizeUpdateSourceConfig } from '@nowluma/common/update-source';
import { APP_VERSION, ALL_ACCOUNTS_CONFIRMATION } from '@/types';
import type {
    DebugInvokeResult,
    LogLevel,
    StorageCleanupRequest,
    SystemSettingsPatch,
    UiConfig,
} from '@/types';
import {
    DEMO_NEW_PASSWORD,
    DEMO_PASSWORD,
    DEMO_PID,
    DEMO_DESKTOP_URL,
    DEMO_TOTP,
    DEMO_UIN,
    demoActions,
    demoConfig,
    demoLog,
    demoProcess,
    demoStorage,
    demoSystem,
    demoSystemSettings,
    demoUi,
} from './fixtures';

export type DemoScenario = 'setup' | 'ready' | 'offline' | 'failure';
type Body = Record<string, unknown>;
type Feed = { path: string; send: (data: unknown) => void; close: () => void };

function object(value: unknown): Body {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('DEMO: Expected a JSON object');
    }

    return value as Body;
}

function parseDemoConfig(value: unknown) {
    const raw = object(value);

    if (raw.networks !== undefined) {
        const networks = object(raw.networks);

        for (const kind of ['httpServers', 'httpClients', 'wsServers', 'wsClients']) {
            const list = networks[kind];

            if (list === undefined) {
                continue;
            }

            if (!Array.isArray(list) || list.length > 16) {
                throw new Error('DEMO: Invalid adapter list');
            }

            for (const item of list) {
                const network = object(item);

                if (typeof network.name !== 'string' || !network.name.trim()) {
                    throw new Error('DEMO: Adapter name required');
                }

                if (kind.endsWith('Servers')) {
                    if (
                        !Number.isInteger(network.port) ||
                        Number(network.port) < 0 ||
                        Number(network.port) > 65535
                    ) {
                        throw new Error('DEMO: Invalid adapter port');
                    }
                } else if (typeof network.url !== 'string' || !network.url.trim()) {
                    throw new Error('DEMO: Adapter URL required');
                }
            }
        }
    }

    return normalizeOneBotConfig(raw);
}

function validateDemoShape(value: unknown, sample: unknown): void {
    if (Array.isArray(sample)) {
        if (!Array.isArray(value) || value.length > 1000) {
            throw new Error('DEMO: Invalid array');
        }

        if (sample.length) {
            value.forEach((item) => validateDemoShape(item, sample[0]));
        }
    } else if (sample !== null && typeof sample === 'object') {
        const payload = object(value);

        for (const [key, expected] of Object.entries(sample)) {
            validateDemoShape(payload[key], expected);
        }
    } else if (
        typeof value !== typeof sample ||
        (typeof value === 'number' && !Number.isFinite(value))
    ) {
        throw new Error('DEMO: Invalid field type');
    }
}

const DEMO_NOTIFICATION_SHAPE = {
    version: 1,
    debounceSeconds: 10,
    channels: [{ id: '', name: '', url: '', bodyTemplate: '', enabled: true }],
};
const DEMO_GLOBAL_SHAPE = {
    rkey: { fallbackServers: [''] },
    musicSignUrl: '',
    videoUploadConcurrency: 2,
};

function json(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function fakeError(message: string, status = 400): Response {
    return json({ success: false, message, code: 'DEMO_ERROR' }, status);
}

// All effects stay in this instance. There is deliberately no real fetch fallback.
export class DemoApi {
    private generation = 0;
    private token: string | null = null;
    private password = DEMO_PASSWORD;
    private consent = false;
    private mustChange = true;
    private totpEnabled = false;
    private totpPending = false;
    private recoveryCodes = ['DEMO-RECOVERY-0001', 'DEMO-RECOVERY-0002'];
    private process = demoProcess();
    private ui: UiConfig = demoUi();
    private config = demoConfig();
    private settings = demoSystemSettings();
    private hasCert = false;
    private storage = demoStorage();
    private notifications = {
        version: 1,
        debounceSeconds: 10,
        channels: [
            {
                id: 'demo-webhook',
                name: 'DEMO webhook · no delivery',
                type: 'webhook' as const,
                url: 'https://demo.invalid/webhook',
                bodyTemplate: '{"text":"DEMO {nickname} {event}"}',
                enabled: true,
            },
        ],
    };
    private recent: Array<{
        time: number;
        uin: string;
        event: 'online';
        channelId: string;
        ok: boolean;
        status: number;
    }> = [];
    private globalConfig = {
        rkey: { fallbackServers: ['https://demo.invalid/rkey'] },
        musicSignUrl: '',
        videoUploadConcurrency: 2,
    };
    private sources = {
        mode: 'direct' as 'direct' | 'auto' | 'mirror',
        mirror: '',
        mirrors: ['https://demo.invalid/mirror'],
    };
    private updatePhase: 'idle' | 'ready' | 'restarting' = 'idle';
    private logLevel: LogLevel = 'info';
    private logs = [
        demoLog(1, 'Practice only — no QQ, VNC, filesystem or outgoing API traffic'),
        demoLog(2, 'DEMO adapter example: waiting for simulated scan', 'warn'),
    ];
    private messages = new Map<number, Body>([
        [
            100,
            {
                message_id: 100,
                user_id: 10002,
                message: [{ type: 'text', data: { text: 'DEMO sample message' } }],
                raw_message: 'DEMO sample message',
                time: 1784851200,
            },
        ],
    ]);
    private nextMessageId = 101;
    private feeds = new Set<Feed>();
    private listeners = new Set<() => void>();
    scenario: DemoScenario = 'setup';
    failNextMutation = false;
    backgroundUrl: string | null = null;
    notice = 'DEMO ready. Use only the example credentials.';

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    };

    private announce(message: string) {
        this.notice = message;
        this.listeners.forEach((listener) => listener());
    }

    get examplePassword() {
        return this.password;
    }

    get summary() {
        return {
            authenticated: this.token !== null,
            consent: this.consent,
            mustChange: this.mustChange,
            scanned: this.process.account !== null,
            online: this.process.status === 'online',
            messages: this.messages.size,
        };
    }

    reset() {
        this.closeFeeds();

        if (this.backgroundUrl) {
            URL.revokeObjectURL(this.backgroundUrl);
        }

        const fresh = new DemoApi();
        this.generation++;
        Object.assign(this, {
            token: null,
            password: DEMO_PASSWORD,
            consent: false,
            mustChange: true,
            totpEnabled: false,
            totpPending: false,
            recoveryCodes: fresh.recoveryCodes,
            process: demoProcess(),
            ui: demoUi(),
            config: demoConfig(),
            settings: demoSystemSettings(),
            hasCert: false,
            storage: demoStorage(),
            notifications: fresh.notifications,
            recent: [],
            globalConfig: fresh.globalConfig,
            sources: fresh.sources,
            updatePhase: 'idle',
            logLevel: 'info',
            logs: fresh.logs,
            messages: fresh.messages,
            nextMessageId: 101,
            scenario: 'setup',
            failNextMutation: false,
            backgroundUrl: null,
        });
        this.announce('DEMO reset: all practice writes, files and sessions cleared.');
    }

    setScenario(scenario: DemoScenario) {
        if (scenario === 'setup') {
            this.reset();
            return;
        }

        this.scenario = scenario;

        if (scenario === 'ready') {
            this.consent = true;
            this.mustChange = false;
            this.scan();
            this.process = {
                ...this.process,
                injected: true,
                connected: true,
                loggedIn: true,
                uin: DEMO_UIN,
                status: 'online',
            };
        } else if (scenario === 'offline') {
            this.process = {
                ...this.process,
                connected: false,
                loggedIn: false,
                status: 'disconnected',
                error: 'DEMO: simulated account offline',
            };
        }

        if (scenario === 'failure') {
            this.closeFeeds();
        } else {
            this.emitState();
        }

        this.announce(`DEMO scenario: ${scenario}. No real runtime was changed.`);
    }

    scan() {
        this.process.account = { uin: DEMO_UIN, nickname: 'DEMO 小光' };
        this.emitState();
        this.announce(
            'DEMO scan simulated. Now choose 加载 on process 4242; detection is not QQ delivery.',
        );
    }

    private accounts() {
        return this.process.status === 'online' ? [{ uin: DEMO_UIN, nickname: 'DEMO 小光' }] : [];
    }

    private connections() {
        return this.accounts().map((account) => ({
            ...account,
            adapters: [
                ...this.config.networks.httpServers.map((network) => ({
                    name: network.name,
                    kind: 'httpServer',
                    status: network.enabled === false ? 'disabled' : 'ok',
                    detail: 'DEMO listener only — no socket opened',
                })),
                ...this.config.networks.httpClients.map((network) => ({
                    name: network.name,
                    kind: 'httpClient',
                    status: network.enabled === false ? 'disabled' : 'ok',
                    detail: 'DEMO only — no outgoing request',
                })),
                ...this.config.networks.wsServers.map((network) => ({
                    name: network.name,
                    kind: 'wsServer',
                    status: network.enabled === false ? 'disabled' : 'ok',
                    detail: 'DEMO listener only — no socket opened',
                })),
                ...this.config.networks.wsClients.map((network) => ({
                    name: network.name,
                    kind: 'wsClient',
                    status: network.enabled === false ? 'disabled' : 'ok',
                    detail: 'DEMO only — no WebSocket',
                })),
            ],
        }));
    }

    private emitState() {
        for (const feed of this.feeds) {
            if (feed.path === '/api/state/stream') {
                feed.send({ resource: 'processes', data: [this.process] });
                feed.send({ resource: 'qq-list', data: this.accounts() });
                feed.send({ resource: 'connections', data: this.connections() });
            }
        }

        this.storage.snapshot.accounts[0].online = this.process.status === 'online';
    }

    private addLog(message: string, level: LogLevel = 'info') {
        const log = demoLog((this.logs.at(-1)?.id ?? 0) + 1, message, level);
        this.logs = [...this.logs.slice(-199), log];
        this.announce(message);
        this.feeds.forEach((feed) => {
            if (feed.path === '/api/logs/stream') {
                feed.send(log);
            }
        });
    }

    private closeFeeds() {
        [...this.feeds].forEach((feed) => feed.close());
    }

    private stream(path: string, signal?: AbortSignal | null, frames?: unknown[]) {
        if (signal?.aborted) {
            throw new DOMException('DEMO request aborted', 'AbortError');
        }

        const encoder = new TextEncoder();
        const feeds = this.feeds;
        let dispose: (() => void) | null = null;
        const stream = new ReadableStream<Uint8Array>(
            {
                start: (controller) => {
                    let closed = false;

                    const close = () => {
                        if (closed) {
                            return;
                        }

                        closed = true;
                        signal?.removeEventListener('abort', close);
                        feeds.delete(feed);
                        controller.close();
                    };

                    const feed: Feed = {
                        path,
                        close,
                        send: (data) => {
                            if (closed) {
                                return;
                            }

                            const frame = encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

                            if (frame.byteLength > (controller.desiredSize ?? 0)) {
                                dispose?.();
                                const error = new Error('DEMO: Stream buffer limit reached');
                                controller.error(error);
                                this.announce(error.message);
                                return;
                            }

                            controller.enqueue(frame);
                        },
                    };

                    dispose = () => {
                        closed = true;
                        signal?.removeEventListener('abort', close);
                        feeds.delete(feed);
                    };

                    if (frames) {
                        frames.forEach(feed.send);
                        close();
                        return;
                    }

                    if (feeds.size >= 16) {
                        throw new Error('DEMO: Too many open streams');
                    }

                    feeds.add(feed);
                    signal?.addEventListener('abort', close, { once: true });

                    if (path === '/api/logs/stream') {
                        this.logs.forEach(feed.send);
                    } else {
                        feed.send({ kind: 'ready' });
                    }

                    if (path === '/api/state/stream') {
                        this.emitState();
                    }
                },
                cancel: () => {
                    dispose?.();
                },
            },
            { highWaterMark: 256 * 1024, size: (frame) => frame.byteLength },
        );
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
    }

    fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
        try {
            if (init.signal?.aborted) {
                throw new DOMException('DEMO request aborted', 'AbortError');
            }

            const request = input instanceof Request ? input : null;
            const origin =
                typeof location === 'undefined' ? 'https://demo.invalid' : location.origin;
            const url = new URL(request?.url ?? String(input), origin);

            if (url.origin !== origin) {
                this.announce(`DEMO blocked external request: ${url.origin}`);
                return fakeError('DEMO: External URLs are blocked; no request was sent', 403);
            }

            if (!url.pathname.startsWith('/api/')) {
                this.announce(`DEMO blocked unsupported URL: ${url.pathname}`);
                return fakeError(`DEMO: Unsupported URL ${url.pathname}; no network fallback`, 404);
            }

            const method = (init.method ?? request?.method ?? 'GET').toUpperCase();
            const headers = new Headers(init.headers ?? request?.headers);
            const raw =
                init.body ?? (request && method !== 'GET' ? await request.text() : undefined);

            if (typeof raw === 'string' && raw.length > 2_000_000) {
                return fakeError('DEMO: Request too large', 413);
            }

            const body = typeof raw === 'string' && raw ? object(JSON.parse(raw)) : {};
            const path = url.pathname;

            if (path === '/api/ui/public' && method === 'GET') {
                return json({ appearance: this.ui.appearance });
            }

            if (path === '/api/login' && method === 'POST') {
                if (body.password !== this.password) {
                    return fakeError(
                        `DEMO: Use only example password ${this.password}. Never enter a real password.`,
                        401,
                    );
                }

                if (
                    this.totpEnabled &&
                    body.totp !== DEMO_TOTP &&
                    !this.recoveryCodes.includes(String(body.recoveryCode))
                ) {
                    return body.totp || body.recoveryCode
                        ? fakeError('DEMO: Invalid example second factor', 401)
                        : json({ needsTotp: true });
                }

                if (body.recoveryCode) {
                    this.recoveryCodes = this.recoveryCodes.filter(
                        (code) => code !== body.recoveryCode,
                    );
                }

                this.token = `demo-session-${++this.generation}`;
                this.announce('DEMO login accepted. This is not a real server session.');
                return json({ token: this.token, mustChangePassword: this.mustChange });
            }

            if (!this.token || headers.get('X-Nowluma-Token') !== this.token) {
                return fakeError('DEMO: Login required', 401);
            }

            if (path === '/api/logout' && method === 'POST') {
                this.token = null;
                this.closeFeeds();
                return json({ success: true });
            }

            if (path === '/api/status' && method === 'GET') {
                return json({ authenticated: true });
            }

            if (path === '/api/auth/state' && method === 'GET') {
                return json({ mustChangePassword: this.mustChange });
            }

            if (path === '/api/agreements' && method === 'GET') {
                return json({
                    version: 'demo-v1',
                    consentRequired: !this.consent,
                    documents: [
                        {
                            id: 'eula',
                            title: 'DEMO 使用练习 / Practice agreement',
                            declaredVersion: 'DEMO',
                            effectiveDate: '2026-07-24',
                            text: '这是模拟练习文本，不是生产协议。\nPractice only. All operations are in browser memory. No QQ connection or delivery, no filesystem writes, no physical desktop. Never enter actual passwords, tokens or account data. Production uses the supplied EULA and LICENSE.',
                        },
                        {
                            id: 'privacy',
                            title: 'DEMO 隐私提示 / Privacy reminder',
                            declaredVersion: 'DEMO',
                            effectiveDate: '2026-07-24',
                            text: '示例登录密码 DemoOnly!2026；新密码 DemoChanged!2026；2FA 123456。\nUse only these public examples. Nothing is persisted. Reset or refresh clears the simulator.',
                        },
                    ],
                });
            }

            if (path === '/api/agreements/record-consent' && method === 'POST') {
                if (body.version !== 'demo-v1') {
                    return json(
                        {
                            success: false,
                            currentVersion: 'demo-v1',
                            message: 'DEMO: Agreement version changed',
                        },
                        409,
                    );
                }

                this.consent = true;
                return json({ success: true });
            }

            if (path === '/api/auth/check-strength' && method === 'POST') {
                const valid = body.password === DEMO_NEW_PASSWORD;
                return json({
                    valid,
                    rules: [
                        {
                            id: 'demo-only',
                            label: `仅输入示例 / Example only: ${DEMO_NEW_PASSWORD}`,
                            ok: valid,
                        },
                    ],
                });
            }

            if (path === '/api/auth/change-password' && method === 'POST') {
                if (body.oldPassword !== this.password || body.newPassword !== DEMO_NEW_PASSWORD) {
                    return fakeError(
                        `DEMO: Old password must be the example; new password must be ${DEMO_NEW_PASSWORD}`,
                    );
                }

                this.password = DEMO_NEW_PASSWORD;
                this.mustChange = false;
                return json({ success: true });
            }

            if (!this.consent || this.mustChange) {
                return fakeError('DEMO: Finish practice agreement/password setup first', 403);
            }

            if (this.scenario === 'failure') {
                return fakeError(
                    'DEMO: Simulated API failure. Choose Ready or Reset in the practice guide.',
                    503,
                );
            }

            if (method !== 'GET' && this.failNextMutation) {
                this.failNextMutation = false;
                this.addLog('Simulated write failure; no data changed', 'error');
                this.announce(
                    'DEMO: Write failed intentionally. Retry only after inspecting the result.',
                );
                return fakeError('DEMO: Simulated write failure; nothing changed', 503);
            }

            if (path === '/api/processes' && method === 'GET') {
                return json({ list: [this.process] });
            }

            if (path === '/api/qq-list' && method === 'GET') {
                return json({ list: this.accounts() });
            }

            if (path === '/api/connections' && method === 'GET') {
                return json({ list: this.connections() });
            }

            if (path === '/api/system' && method === 'GET') {
                return json(demoSystem());
            }

            if (
                ['/api/state/stream', '/api/logs/stream', '/api/debug/stream'].includes(path) &&
                method === 'GET'
            ) {
                return this.stream(path, init.signal ?? request?.signal);
            }

            const processAction = path.match(/^\/api\/processes\/(\d+)\/(load|unload|refresh)$/);

            if (processAction && method === 'POST') {
                if (Number(processAction[1]) !== DEMO_PID) {
                    return fakeError('DEMO: Unknown process', 404);
                }

                const action = processAction[2];

                if (action === 'load' && !this.process.account) {
                    return fakeError('DEMO: Open the mock desktop and simulate a scan first', 409);
                }

                this.process = {
                    ...this.process,
                    injected: action !== 'unload',
                    connected: action !== 'unload',
                    loggedIn: action !== 'unload',
                    uin: action === 'unload' ? '' : DEMO_UIN,
                    status: action === 'unload' ? 'available' : 'online',
                    error: '',
                };
                this.emitState();
                this.addLog(`Process ${action}: in-memory simulation only`, 'success');
                return json({ process: this.process });
            }

            const configAccount = path.match(/^\/api\/config\/([^/]+)$/);

            if (configAccount) {
                if (decodeURIComponent(configAccount[1]) !== DEMO_UIN) {
                    return fakeError('DEMO: Unknown account', 404);
                }

                if (method === 'GET') {
                    return json({ config: this.config });
                }

                if (method === 'POST') {
                    this.config = parseDemoConfig(body);
                    this.emitState();
                    this.addLog(
                        'Configuration saved to memory; no listener or remote connection opened',
                        'success',
                    );
                    return json({
                        config: this.config,
                        saved: true,
                        applied: this.process.status === 'online',
                        online: this.process.status === 'online',
                        errors: [],
                        message: 'DEMO: Saved in memory. No real transport.',
                    });
                }
            }

            if (path === '/api/ui') {
                if (method === 'POST') {
                    const next: UiConfig = {
                        ...this.ui,
                        appearance: {
                            ...this.ui.appearance,
                            ...(body.appearance ? object(body.appearance) : {}),
                        },
                        layout: { ...this.ui.layout, ...(body.layout ? object(body.layout) : {}) },
                        pages: { ...this.ui.pages, ...(body.pages ? object(body.pages) : {}) },
                    };
                    validateDemoShape(next, demoUi());
                    // Custom CSS is never evaluated by the static practice site.
                    next.appearance.customCss = '';
                    this.ui = next;
                } else if (method !== 'GET') {
                    return fakeError('DEMO: Unsupported UI method', 405);
                }

                return json({ config: this.ui });
            }

            if (path === '/api/ui/background' && (method === 'POST' || method === 'DELETE')) {
                if (this.backgroundUrl) {
                    URL.revokeObjectURL(this.backgroundUrl);
                }

                this.backgroundUrl = null;

                if (method === 'POST') {
                    const file = raw instanceof FormData ? raw.get('file') : null;

                    if (
                        !(file instanceof Blob) ||
                        !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
                            file.type,
                        ) ||
                        file.size > 8 * 1024 ** 2
                    ) {
                        return fakeError('DEMO: Choose PNG/JPEG/WebP/GIF up to 8 MiB');
                    }

                    this.backgroundUrl = URL.createObjectURL(file);
                }

                this.ui.appearance.background = {
                    ...this.ui.appearance.background,
                    hasImage: !!this.backgroundUrl,
                    imageVersion: this.ui.appearance.background.imageVersion + 1,
                };
                return json({ config: this.ui });
            }

            if (path === '/api/logs' && method === 'GET') {
                return json({
                    list: this.logs.slice(
                        -Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') ?? 500))),
                    ),
                });
            }

            if (path === '/api/logs/level' && (method === 'GET' || method === 'POST')) {
                const levels: LogLevel[] = ['trace', 'debug', 'info', 'success', 'warn', 'error'];

                if (method === 'POST') {
                    if (!levels.includes(body.level as LogLevel)) {
                        return fakeError('DEMO: Invalid log level');
                    }

                    this.logLevel = body.level as LogLevel;
                }

                return json({ level: this.logLevel, levels });
            }

            if (path === '/api/logs/export/trace' && method === 'GET') {
                return new Response(this.logs.map((log) => log.line).join('\n'), {
                    headers: { 'Content-Disposition': 'attachment; filename="DEMO-trace.log"' },
                });
            }

            if (path.startsWith('/api/update/')) {
                if (path === '/api/update/check' && method === 'GET') {
                    return json({
                        current: APP_VERSION,
                        latest: '99.0.0-demo',
                        hasUpdate: true,
                        htmlUrl: null,
                        notes: 'DEMO release notes. Download/restart only change memory; no software is downloaded or restarted.',
                        publishedAt: '2026-07-24T00:00:00Z',
                        checkedAt: Date.now(),
                    });
                }

                if (path === '/api/update/sources' && (method === 'GET' || method === 'POST')) {
                    if (method === 'POST') {
                        this.sources = normalizeUpdateSourceConfig(body);
                    }

                    return json({
                        config: this.sources,
                        saved: true,
                        applied: true,
                        online: true,
                        errors: [],
                        message: 'DEMO: Source stored in memory only',
                    });
                }

                if (path === '/api/update/sources/test' && method === 'POST') {
                    const config = normalizeUpdateSourceConfig(body);
                    return json({
                        results: [
                            ...new Set([config.mirror, ...config.mirrors].filter(Boolean)),
                        ].map((mirror) => ({
                            mirror,
                            available: true,
                            latencyMs: 12,
                            error: 'DEMO result — no network probe',
                        })),
                    });
                }

                if (path === '/api/update/download' && method === 'POST') {
                    this.updatePhase = 'ready';
                } else if (path === '/api/update/restart' && method === 'POST') {
                    this.updatePhase = 'restarting';
                } else if (path !== '/api/update/status' || method !== 'GET') {
                    return this.unhandled(path, method);
                }

                return json({
                    current: APP_VERSION,
                    phase: this.updatePhase,
                    ...(this.updatePhase === 'idle' ? {} : { version: '99.0.0-demo' }),
                });
            }

            if (path === '/api/system/settings' && (method === 'GET' || method === 'POST')) {
                if (method === 'POST') {
                    if (
                        body.webuiPort !== undefined &&
                        (!Number.isInteger(body.webuiPort) ||
                            Number(body.webuiPort) < 1 ||
                            Number(body.webuiPort) > 65535)
                    ) {
                        return fakeError('DEMO: Invalid port');
                    }

                    const settings = { ...this.settings, ...(body as SystemSettingsPatch) };
                    validateDemoShape(settings, demoSystemSettings());
                    this.settings = settings;
                    return json({ settings: this.settings, restartRequiredToApply: true });
                }

                return json({
                    settings: this.settings,
                    effective: {
                        vncPort: 0,
                        vncUrl: DEMO_DESKTOP_URL,
                        hookAutoLoad: this.settings.hookAutoLoad,
                    },
                    hasCert: this.hasCert,
                    envOverrides: [],
                    listeningPort: 5099,
                    restartRequiredToApply: false,
                });
            }

            if (path === '/api/system/tls/cert' && (method === 'POST' || method === 'DELETE')) {
                if (
                    method === 'POST' &&
                    (body.cert !== 'DEMO CERTIFICATE' || body.key !== 'DEMO PRIVATE KEY')
                ) {
                    return fakeError(
                        'DEMO: Use literal DEMO CERTIFICATE and DEMO PRIVATE KEY; never upload real keys',
                    );
                }

                this.hasCert = method === 'POST';
                return json({ success: true });
            }

            if (path === '/api/system/backup/export' && method === 'GET') {
                return json({
                    demo: true,
                    version: 1,
                    config: this.config,
                    ui: this.ui,
                    settings: this.settings,
                    globalConfig: this.globalConfig,
                    notifications: this.notifications,
                });
            }

            if (path === '/api/system/backup/import' && method === 'POST') {
                const backup = object(body.backup);

                if (
                    backup.demo !== true ||
                    backup.version !== 1 ||
                    body.restoreCredentials === true
                ) {
                    return fakeError(
                        'DEMO: Only simulator backups without credential restoration are accepted',
                    );
                }

                const config = parseDemoConfig(backup.config);
                const ui = object(backup.ui);

                if (!ui.appearance || !ui.layout || !ui.pages) {
                    return fakeError('DEMO: Incomplete backup');
                }

                const settings = object(backup.settings);
                const globalConfig = object(backup.globalConfig);
                const notifications = object(backup.notifications);
                validateDemoShape(ui, demoUi());
                validateDemoShape(settings, demoSystemSettings());
                validateDemoShape(globalConfig, DEMO_GLOBAL_SHAPE);
                validateDemoShape(notifications, DEMO_NOTIFICATION_SHAPE);
                this.config = config;
                this.ui = structuredClone(ui) as unknown as UiConfig;
                this.ui.appearance.customCss = '';
                this.settings = { ...this.settings, ...settings };
                this.globalConfig = { ...this.globalConfig, ...globalConfig };
                this.notifications = { ...this.notifications, ...notifications };
                this.emitState();
                return json({
                    success: true,
                    transactionId: 'DEMO-memory-restore',
                    restored: ['DEMO config', 'DEMO ui', 'DEMO settings'],
                    skipped: ['credentials'],
                    migrated: [],
                    restartRequiredToApply: false,
                });
            }

            if (path === '/api/system/storage' && method === 'GET') {
                return json(this.storage);
            }

            if (path === '/api/system/storage/settings' && method === 'POST') {
                for (const field of ['logMaxTotalMb', 'logRetainDays'] as const) {
                    if (
                        body[field] !== undefined &&
                        (!Number.isFinite(body[field]) || Number(body[field]) < 0)
                    ) {
                        return fakeError('DEMO: Invalid storage limit');
                    }
                }

                this.storage.settings.saved = { ...this.storage.settings.saved, ...body };
                this.storage.settings.effective = { ...this.storage.settings.saved };
                this.storage.snapshot.logs = {
                    ...this.storage.snapshot.logs,
                    maxTotalBytes: this.storage.settings.saved.logMaxTotalMb * 1024 ** 2,
                    retainDays: this.storage.settings.saved.logRetainDays,
                    perUinEnabled: this.storage.settings.saved.logPerUin,
                };
                return json({
                    success: true,
                    settings: this.storage.settings,
                    status: this.storage.snapshot.logs,
                    snapshot: this.storage.snapshot,
                });
            }

            if (path === '/api/system/storage/cleanup' && method === 'POST') {
                return this.cleanup(body);
            }

            if (path === '/api/notifications/config' && (method === 'GET' || method === 'POST')) {
                if (method === 'POST') {
                    if (!Array.isArray(body.channels) || body.channels.length > 16) {
                        return fakeError('DEMO: Invalid channels');
                    }

                    const config = { ...this.notifications, ...body };
                    validateDemoShape(config, DEMO_NOTIFICATION_SHAPE);
                    this.notifications = config;
                }

                return json({ success: true, config: this.notifications });
            }

            if (path === '/api/notifications/recent' && method === 'GET') {
                return json({ recent: this.recent });
            }

            if (path === '/api/notifications/test' && method === 'POST') {
                if (!this.notifications.channels.some((channel) => channel.id === body.channelId)) {
                    return fakeError('DEMO: Unknown notification channel', 404);
                }

                this.recent.unshift({
                    time: Date.now(),
                    uin: DEMO_UIN,
                    event: 'online',
                    channelId: String(body.channelId),
                    ok: true,
                    status: 200,
                });
                this.recent = this.recent.slice(0, 20);
                return json({
                    success: true,
                    message: 'DEMO: Simulated delivery; no email or webhook was sent',
                    status: 200,
                });
            }

            if (path === '/api/global-config' && (method === 'GET' || method === 'POST')) {
                if (method === 'POST') {
                    const config = { ...this.globalConfig, ...body };
                    validateDemoShape(config, DEMO_GLOBAL_SHAPE);
                    this.globalConfig = config;
                }

                return json({ success: true, config: this.globalConfig });
            }

            if (path === '/api/auth/totp' && method === 'GET') {
                return json(
                    this.totpEnabled
                        ? {
                              enabled: true,
                              remainingRecoveryCodes: this.recoveryCodes.length,
                              label: 'DEMO example only',
                          }
                        : { enabled: false },
                );
            }

            if (path === '/api/auth/totp/begin' && method === 'POST') {
                this.totpPending = true;
                return json({
                    success: true,
                    secret: 'JBSWY3DPEHPK3PXP',
                    otpauthUrl: 'otpauth://totp/DEMO?secret=JBSWY3DPEHPK3PXP&issuer=DEMO',
                    issuer: 'DEMO example — never enroll',
                    accountName: 'DEMO',
                });
            }

            if (path === '/api/auth/totp/confirm' && method === 'POST') {
                if (
                    !this.totpPending ||
                    body.password !== this.password ||
                    body.code !== DEMO_TOTP
                ) {
                    return fakeError('DEMO: Use example password and code 123456');
                }

                this.totpEnabled = true;
                this.totpPending = false;
                return json({ success: true, recoveryCodes: this.recoveryCodes });
            }

            if (
                ['/api/auth/totp/disable', '/api/auth/totp/recovery-codes'].includes(path) &&
                method === 'POST'
            ) {
                if (
                    !this.totpEnabled ||
                    body.password !== this.password ||
                    (body.totp !== DEMO_TOTP &&
                        !this.recoveryCodes.includes(String(body.recoveryCode)))
                ) {
                    return fakeError('DEMO: Invalid example second factor');
                }

                if (path.endsWith('/disable')) {
                    this.totpEnabled = false;
                } else {
                    this.recoveryCodes = ['DEMO-RECOVERY-0003', 'DEMO-RECOVERY-0004'];
                }

                return json({ success: true, recoveryCodes: this.recoveryCodes });
            }

            if (path === '/api/debug/actions' && method === 'GET') {
                return json({
                    actions: demoActions,
                    categories: [...new Set(demoActions.map((action) => action.category))].map(
                        (category) => ({
                            category,
                            count: demoActions.filter((action) => action.category === category)
                                .length,
                        }),
                    ),
                });
            }

            if (
                ['/api/debug/invoke', '/api/debug/invoke-stream'].includes(path) &&
                method === 'POST'
            ) {
                if (body.uin !== DEMO_UIN) {
                    return fakeError('DEMO: Unknown account', 404);
                }

                if (this.process.status !== 'online') {
                    return fakeError('DEMO: Account offline', 409);
                }

                const params = object(body.params);
                const result = this.invoke(String(body.action), params);
                this.feeds.forEach((feed) => {
                    if (feed.path === '/api/debug/stream') {
                        feed.send({
                            kind: 'action',
                            uin: DEMO_UIN,
                            action: body.action,
                            params,
                            response: result,
                            ms: 1,
                        });
                    }
                });

                if (path.endsWith('invoke-stream')) {
                    return this.stream(path, init.signal ?? request?.signal, [result]);
                }

                return json(result);
            }

            if (path === '/api/debug/upload' && method === 'POST') {
                const file = raw instanceof FormData ? raw.get('file') : null;

                if (!(file instanceof Blob) || file.size > 8 * 1024 ** 2) {
                    return fakeError('DEMO: Choose a file up to 8 MiB');
                }

                return json({
                    status: 'ok',
                    path: '/DEMO/memory/upload',
                    size: file.size,
                    message: 'DEMO: File metadata only; no disk upload',
                });
            }

            return this.unhandled(path, method);
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw error;
            }

            return fakeError(`DEMO: ${error instanceof Error ? error.message : 'Invalid request'}`);
        }
    };

    private unhandled(path: string, method: string) {
        this.announce(`DEMO unsupported: ${method} ${path}. No network fallback.`);
        return fakeError(`DEMO: Unsupported endpoint ${method} ${path}`, 404);
    }

    private invoke(action: string, params: Body): DebugInvokeResult {
        let data: unknown;

        switch (action) {
            case 'get_login_info':
                data = { user_id: Number(DEMO_UIN), nickname: 'DEMO 小光' };
                break;
            case 'get_friend_list':
                data = [{ user_id: 10002, nickname: 'DEMO friend', remark: 'DEMO contact' }];
                break;
            case 'get_group_list':
                data = [
                    {
                        group_id: 20001,
                        group_name: 'DEMO practice group',
                        member_count: 2,
                        max_member_count: 200,
                    },
                ];
                break;
            case 'get_group_member_list':
                if (Number(params.group_id) !== 20001) {
                    return { status: 'failed', retcode: 1404, message: 'DEMO: Unknown group' };
                }

                data = [
                    {
                        group_id: 20001,
                        user_id: 10002,
                        nickname: 'DEMO friend',
                        card: 'DEMO',
                        role: 'member',
                    },
                ];
                break;
            case 'get_msg':
                data = this.messages.get(Number(params.message_id));

                if (!data) {
                    return { status: 'failed', retcode: 1404, message: 'DEMO: Message not found' };
                }

                break;
            case 'send_private_msg':
            case 'send_group_msg':
            case 'send_group_forward_msg':
            case 'send_private_forward_msg': {
                const group = action.includes('group');
                const message = params[action.includes('forward') ? 'messages' : 'message'];

                if (
                    Number(params[group ? 'group_id' : 'user_id']) !== (group ? 20001 : 10002) ||
                    !(
                        (typeof message === 'string' && message.length) ||
                        (Array.isArray(message) && message.length)
                    )
                ) {
                    return {
                        status: 'failed',
                        retcode: 1400,
                        message:
                            'DEMO: Choose sample contact 10002 / group 20001 and a non-empty message',
                    };
                }

                const text =
                    typeof message === 'string'
                        ? message
                        : (message as unknown[])
                              .map((segment) => {
                                  const item = object(segment);
                                  const data = item.type === 'text' ? object(item.data) : {};
                                  return typeof data.text === 'string' ? data.text : '';
                              })
                              .join('');
                const messageId = this.nextMessageId++;
                this.messages.set(messageId, {
                    message_id: messageId,
                    user_id: 10002,
                    ...(group ? { group_id: 20001 } : {}),
                    message,
                    time: Math.floor(Date.now() / 1000),
                    sender: { user_id: Number(DEMO_UIN), nickname: 'DEMO 小光' },
                });

                if (this.messages.size > 100) {
                    this.messages.delete(this.messages.keys().next().value!);
                }

                this.addLog(
                    text === '#nl'
                        ? '#nl DEMO reply: account online, adapter simulated; not proof of QQ delivery'
                        : `DEMO message ${messageId} stored only in memory`,
                    'success',
                );
                this.feeds.forEach((feed) => {
                    if (feed.path === '/api/debug/stream') {
                        feed.send({
                            kind: 'event',
                            uin: DEMO_UIN,
                            event: {
                                post_type: 'message',
                                message_type: group ? 'group' : 'private',
                                user_id: 10002,
                                ...(group ? { group_id: 20001 } : {}),
                                message_id: messageId,
                                message,
                                demo: true,
                            },
                        });
                    }
                });
                this.announce(`DEMO message ${messageId} stored in memory — not delivered to QQ.`);
                data = { message_id: messageId };
                break;
            }

            default:
                return {
                    status: 'failed',
                    retcode: 1404,
                    message: `DEMO: Action ${action} is not simulated`,
                };
        }

        return { status: 'ok', retcode: 0, data, message: 'DEMO: Simulated result only' };
    }

    private cleanup(body: Body) {
        const request = body as unknown as StorageCleanupRequest;
        const snapshot = this.storage.snapshot;
        let freedBytes: number;
        let deletedFiles: number;

        // shortcut: sample bytes are evenly spread across files; use per-file fixtures for precise cleanup previews.
        if (request.scope === 'logs') {
            deletedFiles = snapshot.logs.fileCount - snapshot.logs.activeFileCount;
            freedBytes = Math.floor(
                (snapshot.logs.totalBytes * deletedFiles) / Math.max(1, snapshot.logs.fileCount),
            );
            snapshot.logs.totalBytes -= freedBytes;
            snapshot.logs.fileCount = snapshot.logs.activeFileCount;
        } else if (request.scope === 'temporary') {
            deletedFiles = snapshot.temporary.fileCount - snapshot.temporary.activeItemCount;
            freedBytes = Math.floor(
                (snapshot.temporary.totalBytes * deletedFiles) /
                    Math.max(1, snapshot.temporary.fileCount),
            );
            snapshot.temporary.totalBytes -= freedBytes;
            snapshot.temporary.fileCount = snapshot.temporary.activeItemCount;
        } else if (request.scope === 'account' || request.scope === 'allAccounts') {
            if (!['messages', 'media', 'reactions'].includes(request.category)) {
                return fakeError('DEMO: Invalid cleanup category');
            }

            if (request.scope === 'account' && request.uin !== DEMO_UIN) {
                return fakeError('DEMO: Unknown cleanup account', 404);
            }

            if (
                request.scope === 'allAccounts' &&
                request.confirmation !== ALL_ACCOUNTS_CONFIRMATION
            ) {
                return fakeError('DEMO: Explicit all-account confirmation required');
            }

            const account = snapshot.accounts[0];
            const field = `${request.category}Bytes` as
                'messagesBytes' | 'mediaBytes' | 'reactionsBytes';
            freedBytes = account[field];
            account[field] = 0;
            account.totalBytes -= freedBytes;
            deletedFiles = freedBytes ? 1 : 0;
        } else {
            return fakeError('DEMO: Unknown cleanup scope');
        }

        snapshot.totals = {
            logsBytes: snapshot.logs.totalBytes,
            temporaryBytes: snapshot.temporary.totalBytes,
            accountDataBytes: snapshot.accounts[0].totalBytes,
            managedBytes:
                snapshot.logs.totalBytes +
                snapshot.temporary.totalBytes +
                snapshot.accounts[0].totalBytes,
        };
        const lastCleanup = {
            at: new Date().toISOString(),
            scope: request.scope,
            accountScope:
                request.scope === 'account'
                    ? ('single' as const)
                    : request.scope === 'allAccounts'
                      ? ('all' as const)
                      : ('global' as const),
            ...('category' in request ? { category: request.category } : {}),
            ...('uin' in request ? { uin: request.uin } : {}),
            deletedFiles,
            freedBytes,
            failureCount: 0,
            failures: [],
        };
        this.storage.lastCleanup = lastCleanup;
        this.addLog(`DEMO cleanup: ${freedBytes} pretend bytes, no filesystem access`, 'success');
        return json({
            success: true,
            message: 'DEMO: In-memory cleanup only',
            scope: request.scope,
            cleanup: {
                deletedFiles,
                freedBytes,
                failures: [],
                skippedActiveItems:
                    request.scope === 'temporary' ? snapshot.temporary.activeItemCount : 0,
                status: snapshot.logs,
                ...('category' in request ? { category: request.category, uins: [DEMO_UIN] } : {}),
            },
            snapshot,
            lastCleanup,
        });
    }
}
