// Per-network-kind metadata: localized title, summary projector for the
// list view, and factory for "create new" defaults. Centralised here so the
// page / list / dialog all agree on naming and shape and a new adapter
// kind only needs one entry in NETWORK_TABS to wire end-to-end.

import type {
    HttpClientNetwork,
    HttpServerNetwork,
    MessageFormat,
    NetworkKind,
    OneBotNetworks,
    WsClientNetwork,
    WsRole,
    WsServerNetwork,
} from '@/types';

export type TabKey = 'general' | NetworkKind;

export interface NetworkTabDescriptor<K extends NetworkKind> {
    key: K;
    /** Tab label and dialog title prefix. */
    title: string;
    /** Short subtitle shown under the tab when active. */
    description: string;
    /** Singular noun for "新建 / 编辑 X". */
    noun: string;
    /** Project the adapter into a short list-card summary string. */
    summarize: (item: OneBotNetworks[K][number]) => string;
    /** Factory producing a fresh adapter with a unique suffix in its name. */
    defaultEntry: (suffix: number) => OneBotNetworks[K][number];
}

export function generateAccessToken(): string {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const httpServersTab: NetworkTabDescriptor<'httpServers'> = {
    key: 'httpServers',
    title: 'HTTP 接口',
    description: '在本机提供 HTTP 接口，供 Bot 程序调用。',
    noun: 'HTTP 接口',
    summarize: (it: HttpServerNetwork) => {
        const host = it.host?.trim() || '0.0.0.0';
        const path = (it.path?.trim() || '/').replace(/^\/?/, '/');
        return `${host}:${it.port}${path}${it.enableWebSocket === true ? ' · WebSocket' : ''}${it.enableSse === true ? ' · SSE' : ''}`;
    },
    defaultEntry: (suffix): HttpServerNetwork => ({
        name: `http-${suffix}`,
        host: '127.0.0.1',
        port: 3000,
        path: '/',
        enableWebSocket: false,
        enableSse: false,
        accessToken: generateAccessToken(),
        messageFormat: 'array',
        reportSelfMessage: false,
    }),
};

const httpClientsTab: NetworkTabDescriptor<'httpClients'> = {
    key: 'httpClients',
    title: 'HTTP 推送',
    description: '向指定 HTTP 地址推送事件。',
    noun: 'HTTP 推送',
    summarize: (it: HttpClientNetwork) => it.url || '(未设置 URL)',
    defaultEntry: (suffix): HttpClientNetwork => ({
        name: `httppost-${suffix}`,
        url: 'http://127.0.0.1:5700',
        messageFormat: 'array',
        reportSelfMessage: false,
    }),
};

const wsServersTab: NetworkTabDescriptor<'wsServers'> = {
    key: 'wsServers',
    title: 'WebSocket 监听',
    description: '在本机监听 WebSocket，等待 Bot 程序连接。',
    noun: 'WebSocket 监听',
    summarize: (it: WsServerNetwork) => {
        const host = it.host?.trim() || '0.0.0.0';
        const path = (it.path?.trim() || '/').replace(/^\/?/, '/');
        const role = it.role ?? 'Universal';
        return `${host}:${it.port}${path} · ${role}`;
    },
    defaultEntry: (suffix): WsServerNetwork => ({
        name: `ws-${suffix}`,
        host: '127.0.0.1',
        port: 3001,
        path: '/',
        role: 'Universal' as WsRole,
        accessToken: generateAccessToken(),
        messageFormat: 'array',
        reportSelfMessage: false,
    }),
};

const wsClientsTab: NetworkTabDescriptor<'wsClients'> = {
    key: 'wsClients',
    title: '反向 WebSocket',
    description: '主动连接 Bot 程序的 WebSocket 地址。',
    noun: '反向 WebSocket',
    summarize: (it: WsClientNetwork) => {
        const role = it.role ?? 'Universal';
        return `${it.url || '(未设置 URL)'} · ${role}`;
    },
    defaultEntry: (suffix): WsClientNetwork => ({
        name: `wsclient-${suffix}`,
        url: 'ws://127.0.0.1:8080/ws',
        role: 'Universal' as WsRole,
        reconnectIntervalMs: 5000,
        messageFormat: 'array',
        reportSelfMessage: false,
    }),
};

/**
 * Order here drives both the tab strip order and the dialog/page wiring.
 * Each entry stays strictly typed on its kind so callers get the narrow
 * adapter shape (no NetworkBase widening).
 */
export const NETWORK_TABS = {
    httpServers: httpServersTab,
    httpClients: httpClientsTab,
    wsServers: wsServersTab,
    wsClients: wsClientsTab,
} satisfies { [K in NetworkKind]: NetworkTabDescriptor<K> };

export const NETWORK_TAB_ORDER: NetworkKind[] = [
    'httpServers',
    'httpClients',
    'wsServers',
    'wsClients',
];

export const ALL_TABS: TabKey[] = ['general', ...NETWORK_TAB_ORDER];

/**
 * Find the smallest suffix N (starting at list.length + 1) such that
 * `factory(N).name` doesn't collide with any existing adapter. Used by
 * the page to seed a fresh-default adapter when the user clicks "create".
 */
export function nextUniqueSuffix(
    networks: { name: string }[],
    factory: (suffix: number) => { name: string },
): number {
    const used = new Set(networks.map((n) => n.name));
    let suffix = networks.length + 1;

    while (used.has(factory(suffix).name)) {
        suffix += 1;
    }

    return suffix;
}

// Re-exported for callers that just need to type a generic adapter.
export interface AdapterCommon {
    name: string;
    enabled?: boolean;
    accessToken?: string;
    messageFormat: MessageFormat;
    reportSelfMessage: boolean;
}
