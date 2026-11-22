import type { DemoApi, TutorialBaseline } from './api';
import type { TutorialId, TutorialLanguage } from './tutorial-options';

export type TutorialText = Readonly<{ zh: string; en: string }>;
export type TutorialTarget = Readonly<{ selector: string }>;
export type TutorialProof =
    | 'reading'
    | 'login'
    | 'consent'
    | 'password'
    | 'appearance'
    | 'console'
    | 'process'
    | 'kernel'
    | 'online'
    | 'stopped'
    | 'account-config'
    | 'http-config'
    | 'config-saved'
    | 'logs'
    | 'log-filter'
    | 'trace-export'
    | 'debug'
    | 'message-sent'
    | 'message-inspected'
    | 'appearance-panel'
    | 'service-panel'
    | 'service-saved'
    | 'storage-panel'
    | 'storage-saved'
    | 'logs-cleaned'
    | 'backup-export'
    | 'diagnostics'
    | 'offline';
export type TutorialStep = Readonly<{
    id: string;
    title: TutorialText;
    hint: TutorialText;
    route: string;
    proof: TutorialProof;
    target: TutorialTarget;
}>;
export type TutorialLesson = Readonly<{
    id: TutorialId;
    title: TutorialText;
    baseline: TutorialBaseline;
    steps: readonly TutorialStep[];
}>;

// Selectors identify the same real controls in both console languages.
export const tutorialControl = (id: string, container = '.demo-console') =>
    `${container} [data-tutorial-control="${id}"]`;
const processTarget = { selector: tutorialControl('process-detail') };
const consoleTarget = { selector: '.demo-console main' };
const serviceTarget = { selector: '[data-settings-tab="system"]' };
const diagnosticsTarget = { selector: tutorialControl('copy-diagnostics') };
const actionTarget = { selector: `${tutorialControl('debug-action')} button` };

const overview: TutorialStep = {
    id: 'overview',
    title: { zh: '检查会话与运行状态', en: 'Inspect session and runtime status' },
    hint: {
        zh: '在工作台查看示例账号、进程和机器人连接。',
        en: 'On the dashboard, find the sample account, process and bot connection.',
    },
    route: '/',
    proof: 'console',
    target: consoleTarget,
};
const process: TutorialStep = {
    id: 'process',
    title: { zh: '选择 PID 4242 的示例进程', en: 'Inspect sample process PID 4242' },
    hint: {
        zh: '在进程列表选择 4242，查看右侧账号和接入状态。本机识别 · 登录待确认。',
        en: 'Select PID 4242 and inspect its account and attachment status. Detected locally · sign-in unconfirmed.',
    },
    route: '/processes',
    proof: 'process',
    target: processTarget,
};
const config: TutorialStep = {
    id: 'account',
    title: { zh: '确认账号 10001 的配置上下文', en: 'Inspect account 10001 configuration' },
    hint: {
        zh: '选择 DEMO 小光 / 10001，打开「消息行为」。',
        en: 'Select DEMO 小光 / 10001 and open Message behavior.',
    },
    route: '/config',
    proof: 'account-config',
    target: { selector: '#config-panel-general' },
};
const http: TutorialStep = {
    id: 'http',
    title: { zh: '打开 HTTP 接口配置', en: 'Open the HTTP adapter configuration' },
    hint: {
        zh: '点「HTTP 接口」，查看 DEMO HTTP 的监听地址和开关。',
        en: 'Under HTTP API, find DEMO HTTP’s listen address and switch.',
    },
    route: '/config',
    proof: 'http-config',
    target: { selector: '#config-tab-httpServers' },
};
const saveConfig: TutorialStep = {
    id: 'save-config',
    title: { zh: '保存一次示例账号配置', en: 'Save the sample account configuration' },
    hint: {
        zh: '编辑 DEMO HTTP，然后点「立即保存」。',
        en: 'Edit DEMO HTTP and choose Save now.',
    },
    route: '/config',
    proof: 'config-saved',
    target: { selector: tutorialControl('config-save') },
};
const logs: TutorialStep = {
    id: 'logs',
    title: { zh: '查看示例日志工作区', en: 'Inspect the sample log workspace' },
    hint: {
        zh: '查看带 DEMO 标记的运行记录。下一步用搜索筛选。',
        en: 'Find entries marked DEMO. You’ll filter them in the next step.',
    },
    route: '/logs',
    proof: 'logs',
    target: { selector: tutorialControl('log-workspace') },
};
const filterLogs: TutorialStep = {
    id: 'filter',
    title: { zh: '搜索 DEMO 日志', en: 'Filter logs for DEMO' },
    hint: {
        zh: '在「搜索消息 / 模块 / 级别」输入 DEMO，确认仍有匹配样本。清除搜索可以恢复视图。',
        en: 'Type DEMO in Search message / module / level and inspect the matching sample entries. Clear the search to restore the view.',
    },
    route: '/logs',
    proof: 'log-filter',
    target: { selector: tutorialControl('log-search') },
};
const service: TutorialStep = {
    id: 'service',
    title: { zh: '打开服务设置', en: 'Inspect service settings' },
    hint: {
        zh: '在「服务」查看控制台的端口 5099、绑定地址和代理设置。',
        en: 'In Service, check console port 5099, the bind address, and proxy settings.',
    },
    route: '/settings?tab=system',
    proof: 'service-panel',
    target: serviceTarget,
};
const diagnostics: TutorialStep = {
    id: 'diagnostics',
    title: { zh: '核对部署诊断中的目录', en: 'Inspect deployment directories' },
    hint: {
        zh: '在「运行目录」查看当前工作目录、HOME 和各目录的写入状态。',
        en: 'In Runtime directories, check the working directory, HOME, and which folders are writable.',
    },
    route: '/settings?tab=system',
    proof: 'diagnostics',
    target: diagnosticsTarget,
};
const storage: TutorialStep = {
    id: 'storage',
    title: { zh: '查看存储分类与保留策略', en: 'Inspect storage categories and retention' },
    hint: {
        zh: '查看日志、临时数据和账号数据库各占多少空间，再找到日志保留天数。',
        en: 'Check the space used by logs, temporary files, and account databases, then find the log retention period.',
    },
    route: '/settings?tab=storage',
    proof: 'storage-panel',
    target: { selector: '[data-settings-tab="storage"]' },
};

function reading(id: string, title: TutorialText, hint: TutorialText, route = '/'): TutorialStep {
    return { id, title, hint, route, proof: 'reading', target: consoleTarget };
}

const firstRun: readonly TutorialStep[] = [
    {
        id: 'login',
        title: { zh: '用示例密码登录', en: 'Sign in with the sample password' },
        hint: {
            zh: '访问密码填 DemoOnly!2026，再点「打开工作台」。',
            en: 'Enter DemoOnly!2026, then choose Open workspace.',
        },
        route: '/',
        proof: 'login',
        target: { selector: '#login-password' },
    },
    {
        id: 'consent',
        title: {
            zh: '阅读并确认说明',
            en: 'Read and acknowledge the notices',
        },
        hint: {
            zh: '阅读使用和隐私说明，勾选「我已阅读」，然后点「确认并继续」。',
            en: 'Read the usage and privacy notices, select I have read, then choose Confirm and continue.',
        },
        route: '/',
        proof: 'consent',
        target: { selector: tutorialControl('agreement-ack') },
    },
    {
        id: 'password',
        title: { zh: '设置示例新密码', en: 'Set the sample password' },
        hint: {
            zh: '两个密码框都填 DemoChanged!2026，然后点「保存并继续」。',
            en: 'Enter DemoChanged!2026 in both fields and choose Save and continue.',
        },
        route: '/',
        proof: 'password',
        target: { selector: '#onboarding-cpw-new' },
    },
    {
        id: 'effects',
        title: { zh: '选择显示效果', en: 'Choose display effects' },
        hint: {
            zh: '选择动效和玻璃材质，然后点「保存并继续」。',
            en: 'Choose motion and glass material, then select Save and continue.',
        },
        route: '/',
        proof: 'appearance',
        target: { selector: tutorialControl('effect-preview') },
    },
    {
        id: 'finish',
        title: { zh: '查看内核选项', en: 'Review kernel options' },
        hint: {
            zh: '查看内核选项，然后点「继续」进入工作台。',
            en: 'Review the kernel options, then choose Continue to open the dashboard.',
        },
        route: '/',
        proof: 'console',
        target: consoleTarget,
    },
];
const qq: readonly TutorialStep[] = [
    process,
    {
        id: 'kernel',
        title: {
            zh: '加载并确认此账号的接入内核',
            en: 'Load and confirm this account’s kernel',
        },
        hint: {
            zh: '在 PID 4242 详情点「加载」，选择兼容内核。阅读并确认风险后，点「确认并接入」。',
            en: 'Choose Load for PID 4242 and select the compatible kernel. Read and acknowledge the risks, then choose Confirm and attach.',
        },
        route: '/processes',
        proof: 'kernel',
        target: { selector: tutorialControl('process-load') },
    },
    {
        id: 'online',
        title: { zh: '查看示例会话状态', en: 'Check the sample session' },
        hint: {
            zh: '在 PID 4242 的详情中等待状态变为「在线」。',
            en: 'Wait for PID 4242 to show Online in the process details.',
        },
        route: '/processes',
        proof: 'online',
        target: processTarget,
    },
    {
        id: 'stop',
        title: { zh: '卸载会话', en: 'Unload the session' },
        hint: {
            zh: '点「卸载」并查看会话状态。要再次接入，请点「加载」。',
            en: 'Choose Unload and check the session status. To reconnect, choose Load.',
        },
        route: '/processes',
        proof: 'stopped',
        target: { selector: tutorialControl('process-unload') },
    },
];

function lesson(
    id: TutorialId,
    title: TutorialText,
    steps: readonly TutorialStep[],
    baseline: TutorialBaseline = 'ready',
): TutorialLesson {
    return { id, title, steps, baseline };
}

export const TUTORIAL_LESSONS: Record<TutorialId, TutorialLesson> = {
    index: lesson('index', { zh: '文档入门', en: 'Documentation start' }, [
        reading(
            'boundary',
            { zh: '认识本章控制台操作', en: 'Start with the chapter console' },
            {
                zh: '先在工作台查看示例会话，再到「QQ 会话」查看进程详情。',
                en: 'Start with the sample session on the dashboard, then open its process details in QQ sessions.',
            },
        ),
        overview,
        process,
    ]),
    introduction: lesson('introduction', { zh: '认识控制台', en: 'Explore the console' }, [
        overview,
        config,
        reading(
            'layers',
            { zh: '查看会话和端点状态', en: 'Check session and endpoint status' },
            {
                zh: '在工作台查看 QQ 会话状态，在「机器人连接」查看各端点的地址和状态。',
                en: 'Check the QQ session on the dashboard, then find endpoint addresses and status in Bot connections.',
            },
            '/config',
        ),
    ]),
    'install-docker': lesson(
        'install-docker',
        { zh: 'Docker 安装后的控制台检查', en: 'Post-Docker-install console checks' },
        [
            reading(
                'post-install',
                { zh: '查看 Docker 安装步骤', en: 'Find the Docker setup steps' },
                {
                    zh: '本章给出安装命令。安装后，依次检查控制台端口、运行目录和 QQ 桌面入口。',
                    en: 'Follow the installation commands in this chapter. Then check the console port, runtime directories, and QQ desktop.',
                },
            ),
            service,
            diagnostics,
            process,
        ],
    ),
    'install-native': lesson(
        'install-native',
        { zh: '原生安装后的控制台检查', en: 'Post-native-install console checks' },
        [
            reading(
                'post-install',
                { zh: '查看原生安装步骤', en: 'Find the native setup steps' },
                {
                    zh: '按本章选择对应系统的安装包。启动后，检查控制台端口、HOME 和数据目录。',
                    en: 'Use this chapter to choose the package for your system. After startup, check the console port, HOME, and data directory.',
                },
            ),
            service,
            diagnostics,
            process,
        ],
    ),
    'first-run': lesson(
        'first-run',
        { zh: '首次登录与设置', en: 'First login and setup' },
        firstRun,
        'clean',
    ),
    overview: lesson('overview', { zh: '认识概览', en: 'Explore Overview' }, [
        overview,
        process,
        config,
    ]),
    'qq-connection': lesson(
        'qq-connection',
        { zh: '账号接入与手动停止', en: 'Account attachment and manual stop' },
        qq,
        'detected',
    ),
    'onebot-config': lesson(
        'onebot-config',
        { zh: '账号与适配器配置', en: 'Account and adapter configuration' },
        [
            config,
            http,
            saveConfig,
            reading(
                'availability',
                { zh: '保存后验证连接', en: 'Verify the connection after saving' },
                {
                    zh: '保存后查看端点状态；连接失败时，检查监听地址、令牌、防火墙和客户端日志。',
                    en: 'Check the endpoint status after saving. If the connection fails, check the listen address, token, firewall, and client logs.',
                },
                '/config',
            ),
        ],
    ),
    logs: lesson('logs', { zh: '日志搜索与导出', en: 'Log filtering and export' }, [
        logs,
        filterLogs,
        {
            id: 'trace-export',
            title: { zh: '导出完整示例 TRACE', en: 'Export the full sample TRACE' },
            hint: {
                zh: '在日志工具栏点「导出完整 TRACE」，然后打开导出的文件。',
                en: 'Choose Export full TRACE in the log toolbar, then open the exported file.',
            },
            route: '/logs',
            proof: 'trace-export',
            target: { selector: tutorialControl('log-export-trace') },
        },
    ]),
    debug: lesson('debug', { zh: '示例发送与查询', en: 'Sample send and lookup' }, [
        {
            id: 'debug',
            title: { zh: '打开接口调用', en: 'Open the action tester' },
            hint: {
                zh: '在开发者工具选择「接口调用」，账号选择 10001。所有返回值均为 DEMO。',
                en: 'Open the action tester in Developer Tools and select account 10001. Every result is simulated.',
            },
            route: '/debug',
            proof: 'debug',
            target: actionTarget,
        },
        {
            id: 'send',
            title: { zh: '发送一条示例消息', en: 'Send a sample message' },
            hint: {
                zh: '选择 send_private_msg，填入 user_id 10002 和消息 #nl，再点「运行调用」。JSON 模式可输入 {"user_id":10002,"message":"#nl"}。',
                en: 'Choose send_private_msg, enter user_id 10002 and message #nl, then choose Run action. In JSON mode, enter {"user_id":10002,"message":"#nl"}.',
            },
            route: '/debug',
            proof: 'message-sent',
            target: { selector: tutorialControl('debug-run') },
        },
        {
            id: 'get',
            title: { zh: '用返回的 message_id 查询样本', en: 'Look up the returned message_id' },
            hint: {
                zh: '复制上一步返回的 message_id，选择 get_msg，填入该 ID 后点「运行调用」。',
                en: 'Copy the message_id from the previous result. Choose get_msg, enter the ID, and select Run action.',
            },
            route: '/debug',
            proof: 'message-inspected',
            target: actionTarget,
        },
    ]),
    'settings-console': lesson(
        'settings-console',
        { zh: '控制台显示设置', en: 'Console appearance settings' },
        [
            {
                id: 'appearance',
                title: { zh: '打开外观设置', en: 'Open appearance settings' },
                hint: {
                    zh: '在「偏好设置 → 外观」找到主题、动效和玻璃材质。',
                    en: 'Find theme, motion and glass under Settings → Appearance.',
                },
                route: '/settings?tab=appearance',
                proof: 'appearance-panel',
                target: { selector: '[data-settings-tab="appearance"]' },
            },
            {
                id: 'save-appearance',
                title: { zh: '改变并保存一项显示选择', en: 'Change and save a display choice' },
                hint: {
                    zh: '切换动效或选择另一种玻璃材质，等待界面提示已保存。',
                    en: 'Toggle motion or select a different glass material. Wait for the saved confirmation.',
                },
                route: '/settings?tab=appearance',
                proof: 'appearance',
                target: { selector: tutorialControl('motion-setting') },
            },
        ],
    ),
    'settings-runtime': lesson(
        'settings-runtime',
        { zh: '保存服务设置', en: 'Save service settings' },
        [
            service,
            {
                id: 'save-service',
                title: { zh: '保存示例端口 5100', en: 'Save sample port 5100' },
                hint: {
                    zh: '把端口改为 5100，点「保存服务设置」，查看「重启后生效」提示。',
                    en: 'Change the port to 5100, choose Save service settings, and look for the restart notice.',
                },
                route: '/settings?tab=system',
                proof: 'service-saved',
                target: { selector: tutorialControl('service-port') },
            },
            diagnostics,
        ],
    ),
    'access-network': lesson(
        'access-network',
        { zh: '控制台网络访问', en: 'Console network access' },
        [
            service,
            reading(
                'proxy',
                { zh: '设置监听地址和代理', en: 'Set the bind address and proxy' },
                {
                    zh: '本机访问使用 127.0.0.1。对外访问时配置 HTTPS、强密码和可信代理。',
                    en: 'Use 127.0.0.1 for local access. Configure HTTPS, a strong password, and a trusted proxy for public access.',
                },
                '/settings?tab=system',
            ),
            http,
            saveConfig,
        ],
    ),
    'data-backup': lesson(
        'data-backup',
        { zh: '存储保留、清理与备份', en: 'Retention, cleanup and backup' },
        [
            storage,
            {
                id: 'retention',
                title: { zh: '保存 14 天日志保留', en: 'Save 14-day log retention' },
                hint: {
                    zh: '将「保留天数」改为 14，点「保存并应用」，等待保存结果。',
                    en: 'Set retention days to 14, choose Save and apply, and wait for the result.',
                },
                route: '/settings?tab=storage',
                proof: 'storage-saved',
                target: { selector: tutorialControl('storage-retention') },
            },
            {
                id: 'cleanup',
                title: { zh: '确认清理示例日志', en: 'Confirm sample log cleanup' },
                hint: {
                    zh: '在「清理临时数据」区域找到「日志」一行，点该行「清理」；阅读「清理全部日志？」对话框，再点「确认清理」。日志字节数归零后完成本步。',
                    en: 'Under temporary data cleanup, find the Logs row and choose its cleanup button. Read the confirmation and confirm. The step completes when log bytes reach zero.',
                },
                route: '/settings?tab=storage',
                proof: 'logs-cleaned',
                target: { selector: tutorialControl('storage-clean-logs') },
            },
            {
                id: 'backup',
                title: { zh: '导出 DEMO 配置备份', en: 'Export a DEMO configuration backup' },
                hint: {
                    zh: '打开服务页底部的「服务配置备份」，保留默认导出范围，再点「导出备份」。',
                    en: 'At the bottom of Service, open the service configuration backup. Keep the default export options and choose Export backup.',
                },
                route: '/settings?tab=system',
                proof: 'backup-export',
                target: { selector: tutorialControl('service-backup') },
            },
        ],
    ),
    troubleshooting: lesson(
        'troubleshooting',
        { zh: '排查连接问题', en: 'Troubleshoot a connection' },
        [
            {
                ...process,
                id: 'offline',
                title: {
                    zh: '查看离线会话的错误',
                    en: 'Check the offline session error',
                },
                hint: {
                    zh: '选择离线进程，查看会话状态和错误，再到「运行记录」查找对应条目。',
                    en: 'Select the offline process, read its status and error, then find the matching entry in Run log.',
                },
                proof: 'offline',
            },
            logs,
            filterLogs,
            diagnostics,
        ],
        'offline',
    ),
    demo: lesson('demo', { zh: '控制台操作', en: 'Console walkthrough' }, [
        reading(
            'limits',
            { zh: '认识引导、定位与重置', en: 'Use guidance, control focus and restart' },
            {
                zh: '用「定位控件」跳到当前操作。你也可以返回上一步、收起引导或重新开始。',
                en: 'Use Find control to jump to the current task. You can also go back, close the guide, or restart the lesson.',
            },
        ),
        overview,
        config,
        http,
        saveConfig,
    ]),
    planned: lesson('planned', { zh: '路线图', en: 'Roadmap' }, [
        process,
        reading(
            'unavailable',
            { zh: '重写内核', en: 'Rewrite kernel' },
            {
                zh: '在进程详情点「加载」，选择兼容内核并确认风险。',
                en: 'In the process details, choose Load, select the compatible kernel, and acknowledge the risks.',
            },
            '/processes',
        ),
        diagnostics,
    ]),
    developing: lesson(
        'developing',
        { zh: '开发检查', en: 'Development checks' },
        [
            diagnostics,
            reading(
                'evidence',
                { zh: '检查配置保存结果', en: 'Check the configuration save result' },
                {
                    zh: '打开「机器人连接」，选择一个账号。修改配置并保存，查看反馈和端点状态。',
                    en: 'Open Bot connections and select an account. Edit and save its configuration, then check the feedback and endpoint status.',
                },
                '/settings?tab=system',
            ),
            config,
            saveConfig,
        ],
    ),
};

export type TutorialSnapshot = DemoApi['tutorialSnapshot'];
export type TutorialSurface = Readonly<{
    console: boolean;
    process: boolean;
    accountConfig: boolean;
    httpConfig: boolean;
    logs: boolean;
    logFiltered: boolean;
    debug: boolean;
    appearance: boolean;
    service: boolean;
    storage: boolean;
    diagnostics: boolean;
}>;

// Pure proof gate: rendered outcomes or accepted domain state, never click delivery.
export function tutorialStepComplete(
    proof: TutorialProof,
    state: TutorialSnapshot,
    surface: TutorialSurface,
): boolean {
    switch (proof) {
        case 'reading':
            return false;
        case 'login':
            return state.authenticated;
        case 'consent':
            return state.consent;
        case 'password':
            return !state.mustChange;
        case 'appearance':
            return state.appearanceSaved;
        case 'console':
            return surface.console;
        case 'process':
            return surface.process;
        case 'kernel':
            return state.kernelAccepted;
        case 'online':
            return state.online && surface.process;
        case 'stopped':
            return state.stopped && !state.online;
        case 'account-config':
            return surface.accountConfig;
        case 'http-config':
            return surface.httpConfig;
        case 'config-saved':
            return state.configSaved;
        case 'logs':
            return surface.logs;
        case 'log-filter':
            return surface.logFiltered;
        case 'trace-export':
            return state.traceExported;
        case 'debug':
            return surface.debug;
        case 'message-sent':
            return state.sentMessageId !== null;
        case 'message-inspected':
            return state.sentMessageId !== null && state.inspectedMessageId === state.sentMessageId;
        case 'appearance-panel':
            return surface.appearance;
        case 'service-panel':
            return surface.service;
        case 'service-saved':
            return state.serviceSaved && state.webuiPort === 5100;
        case 'storage-panel':
            return surface.storage;
        case 'storage-saved':
            return state.storageSaved && state.logRetainDays === 14;
        case 'logs-cleaned':
            return state.cleanupScope === 'logs' && state.logsBytes === 0;
        case 'backup-export':
            return state.backupExported;
        case 'diagnostics':
            return surface.diagnostics;
        case 'offline':
            return !state.online && surface.process;
    }
}

export function tutorialText(text: TutorialText, language: TutorialLanguage): string {
    return text[language];
}
