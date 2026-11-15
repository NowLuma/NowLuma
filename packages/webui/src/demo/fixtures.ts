import { kernelDisplayCatalog } from '@nowluma/common/kernel-display';
import { DEFAULT_APPEARANCE } from '@/contexts/ThemeContext';
import { DEFAULT_LAYOUT, DEFAULT_PAGES } from '@/contexts/LayoutContext';
import { normalizeOneBotConfig } from '@/lib/onebot-config';
import type { KernelCatalog } from '@/lib/api/types';
import type {
    DebugActionDoc,
    HookProcessInfo,
    LogEntry,
    StorageOverviewResponse,
    SystemInfo,
    SystemSettings,
    UiConfig,
} from '@/types';

export {
    DEMO_PASSWORD,
    DEMO_NEW_PASSWORD,
    DEMO_TOTP,
    DEMO_UIN,
    DEMO_PID,
    DEMO_AVATAR,
    DEMO_DESKTOP_URL,
} from './constants';
import { DEMO_UIN, DEMO_PID, DEMO_DESKTOP_URL } from './constants';

export function demoKernelCatalog(): KernelCatalog {
    return kernelDisplayCatalog();
}

export const demoActions: DebugActionDoc[] = [
    {
        name: 'get_login_info',
        aliases: [],
        category: '账号',
        summary: 'DEMO: Read the simulated account',
        readOnly: true,
        returns: '{ user_id, nickname }',
        params: [],
    },
    {
        name: 'get_friend_list',
        aliases: [],
        category: '好友',
        summary: 'DEMO: Local sample contacts',
        readOnly: true,
        params: [],
    },
    {
        name: 'get_group_list',
        aliases: [],
        category: '群组',
        summary: 'DEMO: Local sample groups',
        readOnly: true,
        params: [],
    },
    {
        name: 'send_private_msg',
        aliases: [],
        category: '消息',
        summary: 'DEMO: Write a message to memory, never QQ',
        readOnly: false,
        returns: '{ message_id }',
        params: [
            { name: 'user_id', type: 'number', required: true, role: 'user_id' },
            { name: 'message', type: 'string | MessageSegment[]', required: true },
        ],
    },
    {
        name: 'get_group_member_list',
        aliases: [],
        category: '群组',
        summary: 'DEMO: Local sample group members',
        readOnly: true,
        params: [{ name: 'group_id', type: 'number', required: true, role: 'group_id' }],
    },
    ...(['send_group_msg', 'send_group_forward_msg', 'send_private_forward_msg'] as const).map(
        (name): DebugActionDoc => ({
            name,
            aliases: [],
            category: '消息',
            summary: 'DEMO: Compose group/forward messages in memory only',
            readOnly: false,
            returns: '{ message_id }',
            params: [
                {
                    name: name.includes('group') ? 'group_id' : 'user_id',
                    type: 'number',
                    required: true,
                    role: name.includes('group') ? 'group_id' : 'user_id',
                },
                {
                    name: name.includes('forward') ? 'messages' : 'message',
                    type: 'MessageSegment[]',
                    required: true,
                },
            ],
        }),
    ),
    {
        name: 'get_msg',
        aliases: [],
        category: '消息',
        summary: 'DEMO: Read a sample or composed message',
        readOnly: true,
        params: [{ name: 'message_id', type: 'number', required: true, role: 'message_id' }],
    },
];

export function demoProcess(): HookProcessInfo {
    return {
        pid: DEMO_PID,
        name: 'QQ · DEMO',
        path: '/DEMO/QQ',
        injected: false,
        connected: false,
        loggedIn: false,
        uin: '',
        status: 'available',
        error: '',
        method: 'DEMO — no native transport',
        account: null,
    };
}

export function demoUi(): UiConfig {
    return structuredClone({
        version: 1,
        appearance: DEFAULT_APPEARANCE,
        layout: DEFAULT_LAYOUT,
        pages: DEFAULT_PAGES,
    });
}

export function demoConfig() {
    return normalizeOneBotConfig({
        networks: {
            httpServers: [
                {
                    name: 'DEMO HTTP',
                    host: '127.0.0.1',
                    port: 3000,
                    messageFormat: 'array',
                    reportSelfMessage: false,
                    enableWebSocket: true,
                    enableSse: true,
                },
            ],
            httpClients: [],
            wsServers: [],
            wsClients: [],
        },
        statusCommand: { enabled: true, swallow: true, cooldownSeconds: 30, trigger: '#nl' },
        historySync: { enabled: true },
    });
}

export function demoSystemSettings(): SystemSettings {
    return {
        webuiPort: 5099,
        webuiHost: '127.0.0.1',
        tlsEnabled: false,
        trustProxy: '',
        vncPort: 0,
        vncUrl: DEMO_DESKTOP_URL,
        hookAutoLoad: false,
    };
}

export function demoSystem(): SystemInfo {
    return {
        hostname: 'DEMO browser memory',
        platform: 'linux',
        arch: 'x64',
        archLabel: 'x86-64',
        release: 'DEMO',
        distro: 'DEMO Linux (simulated)',
        uptime: 3600,
        processUptime: 600,
        nodeVersion: 'DEMO / no Node runtime',
        deployment: {
            mode: 'docker',
            workingDirectory: '/DEMO',
            home: '/DEMO/home',
            uid: 1000,
            directories: {
                config: '/DEMO/config',
                data: '/DEMO/data',
                logs: '/DEMO/logs',
                qq: '/DEMO/home/QQ',
            },
            writable: { config: true, data: true, logs: true, qq: true },
            desktopAvailable: true,
            vncPort: 0,
            vncUrl: DEMO_DESKTOP_URL,
        },
        cpu: {
            model: 'DEMO CPU',
            cores: 4,
            speedMHz: 2400,
            loadAvg: [0.1, 0.2, 0.1],
            perCore: [10, 15, 5, 18],
            average: 12,
        },
        memory: { total: 4 * 1024 ** 3, free: 3 * 1024 ** 3, used: 1024 ** 3, usagePercent: 25 },
        runtime: {
            pid: DEMO_PID,
            lowIntegrity: false,
            rss: 128 * 1024 ** 2,
            heapTotal: 64 * 1024 ** 2,
            heapUsed: 40 * 1024 ** 2,
            external: 1024,
            arrayBuffers: 512,
        },
    };
}

export function demoStorage(): StorageOverviewResponse {
    const settings = { logMaxTotalMb: 256, logRetainDays: 7, logPerUin: true };
    return {
        settings: { saved: { ...settings }, effective: { ...settings }, envOverrides: [] },
        lastCleanup: null,
        snapshot: {
            logs: {
                state: 'healthy',
                totalBytes: 65536,
                maxTotalBytes: 256 * 1024 ** 2,
                retainDays: 7,
                perUinEnabled: true,
                fileCount: 3,
                activeFileCount: 1,
                droppedLines: 0,
            },
            temporary: { totalBytes: 32768, fileCount: 2, activeItemCount: 1 },
            accounts: [
                {
                    uin: DEMO_UIN,
                    nickname: 'DEMO 小光',
                    online: false,
                    messagesBytes: 65536,
                    mediaBytes: 131072,
                    reactionsBytes: 4096,
                    totalBytes: 200704,
                },
            ],
            totals: {
                logsBytes: 65536,
                temporaryBytes: 32768,
                accountDataBytes: 200704,
                managedBytes: 299008,
            },
        },
    };
}

export function demoLog(id: number, message: string, level: LogEntry['level'] = 'info'): LogEntry {
    return {
        id,
        time: new Date().toISOString(),
        level,
        uin: Number(DEMO_UIN),
        scope: 'DEMO',
        message,
        line: `[DEMO] ${message}`,
    };
}
