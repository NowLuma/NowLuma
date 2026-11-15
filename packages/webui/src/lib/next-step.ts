// 「接下来做什么」的判定逻辑。
//
// 只做纯计算：输入是首页已经拿到的资源快照，输出是当前该显示的一步。
// 不读 DOM、不请求接口、不保存状态，这样表驱动测试可以直接覆盖全部状态。
//
// 关键约束（见 packages/webui/README.md 的账号检测说明）：
// - account !== null 只表示「本地认出了身份」，不等于登录完成；
// - 资源 ready 才代表「读到了空」，未 ready 的空数组不能当成「没打开 QQ」；
// - 任一侧读取失败时不能说成功，即使还留着上次的数据。
import type { AccountConnections, AdapterStatus, HookProcessInfo, QQInfo } from '@/types';

export type StepId =
    | 'reading'
    | 'read-error'
    | 'no-qq'
    | 'choose-qq'
    | 'selection-lost'
    | 'mismatch'
    | 'busy'
    | 'connecting'
    | 'load-failed'
    | 'disconnected'
    | 'need-load'
    | 'waiting-online'
    | 'need-login'
    | 'account-preparing'
    | 'account-failed'
    | 'no-network'
    | 'network-off'
    | 'network-broken'
    | 'network-warn'
    | 'ready';

export type StepAction =
    'refresh-all' | 'choose-qq' | 'load' | 'refresh' | 'open-config' | 'details';

export interface StepView {
    id: StepId;
    /** 一句话人话。不要出现「注入」「管道」「OneBot」这类术语。 */
    title: string;
    /** 补充说明；没有就给空串。 */
    hint: string;
    action: StepAction | null;
    actionLabel: string;
    /** 这一步是否算「已经做完了」。 */
    done: boolean;
    /** 该显示的原始错误，非空时必须以 role="alert" 展示。 */
    error: string;
}

export interface StepInput {
    ready: { processList: boolean; qqList: boolean; connections: boolean };
    errors: { processList: string; qqList: string; connections: string };
    processList: HookProcessInfo[];
    qqList: QQInfo[];
    connections: AccountConnections[];
    /** 面板自己选定的 PID；未选为 null。 */
    selectedPid: number | null;
    /** 正在进行的操作（load/unload/refresh）。 */
    pendingOp: 'load' | 'unload' | 'refresh' | null;
}

const T = {
    reading: {
        title: '正在读取连接状态',
        hint: '',
        action: null,
        actionLabel: '检查中…',
    },
    readError: {
        title: '连接状态读取失败',
        hint: '重试后再继续，下面保留了失败原因。',
        action: 'refresh-all' as const,
        actionLabel: '重新检查',
    },
    noQq: {
        title: '先打开并登录 QQ',
        hint: '在运行 Nowluma 的设备上完成，也可以打开 QQ 桌面。',
        action: 'refresh-all' as const,
        actionLabel: '我已打开 QQ',
    },
    chooseQq: {
        title: '选择要接入的 QQ 会话',
        hint: '检测到多个 QQ，一次选择一个账号。',
        action: 'choose-qq' as const,
        actionLabel: '选择 QQ',
    },
    selectionLost: {
        title: '所选 QQ 已不在列表中',
        hint: '重新检查后选择，可能是 QQ 已退出或重启。',
        action: 'refresh-all' as const,
        actionLabel: '重新检查',
    },
    mismatch: {
        title: 'QQ 会话身份待确认',
        hint: '请确认 QQ 已完成登录，再重新检查。',
        action: 'refresh-all' as const,
        actionLabel: '重新检查',
    },
    busy: {
        title: '正在处理 QQ 会话',
        hint: '',
        action: null,
        actionLabel: '处理中…',
    },
    connecting: {
        title: '正在接入 QQ 会话',
        hint: '',
        action: null,
        actionLabel: '连接中…',
    },
    loadFailed: {
        title: 'QQ 会话接入失败',
        hint: '可以重试；持续失败时请查看运行记录。',
        action: 'load' as const,
        actionLabel: '重试接入',
    },
    disconnected: {
        title: 'QQ 会话连接已断开',
        hint: '',
        action: 'refresh' as const,
        actionLabel: '重新连接',
    },
    needLoad: {
        title: 'QQ 已找到，接入这个会话',
        hint: '',
        action: 'load' as const,
        actionLabel: '接入会话',
    },
    waitingOnline: {
        title: '等待 QQ 会话连接',
        hint: '如果状态没有变化，可以重新检查。',
        action: 'refresh' as const,
        actionLabel: '检查一下',
    },
    needLogin: {
        title: '请在 QQ 中完成登录',
        hint: '扫码或密码登录完成后，再回来检查。',
        action: 'refresh' as const,
        actionLabel: '已登录，检查状态',
    },
    accountPreparing: {
        title: '正在准备会话数据',
        hint: '',
        action: null,
        actionLabel: '准备中…',
    },
    accountFailed: {
        title: '会话数据准备失败',
        hint: '',
        action: 'details' as const,
        actionLabel: '查看原因',
    },
    noNetwork: {
        title: 'QQ 已接入，连接你的机器人',
        hint: '添加连接后，将地址填入机器人程序。',
        action: 'open-config' as const,
        actionLabel: '配置机器人连接',
    },
    networkOff: {
        title: '启用一个机器人连接',
        hint: 'QQ 已接入，连接设置尚未启用。',
        action: 'open-config' as const,
        actionLabel: '配置机器人连接',
    },
    networkBroken: {
        title: '机器人连接出现异常',
        hint: '',
        action: 'details' as const,
        actionLabel: '查看原因',
    },
    networkWarn: {
        title: '机器人连接需要检查',
        hint: '检查程序是否已连接，以及访问令牌是否一致。',
        action: 'details' as const,
        actionLabel: '查看原因',
    },
    ready: {
        title: 'QQ 与机器人连接已就绪',
        hint: '回复行为由你的机器人程序决定。',
        action: 'details' as const,
        actionLabel: '连接说明',
    },
};

function view(key: keyof typeof T, id: StepId, extra: Partial<StepView> = {}): StepView {
    const base = T[key];
    return {
        id,
        title: base.title,
        hint: base.hint,
        action: base.action,
        actionLabel: base.actionLabel,
        done: false,
        error: '',
        ...extra,
    };
}

function hasProblems(adapters: AdapterStatus[]): {
    broken: AdapterStatus[];
    warn: AdapterStatus[];
    ok: AdapterStatus[];
} {
    const broken = adapters.filter((a) => a.status === 'down' || a.status === 'degraded');
    const warn = adapters.filter((a) => a.status === 'warn');
    const ok = adapters.filter((a) => a.status === 'ok');
    return { broken, warn, ok };
}

function describeAdapters(list: AdapterStatus[]): string {
    return list
        .map((a) => `${a.name}: ${a.lastError || a.detail}`)
        .filter((s) => s.trim().length > 0)
        .join('\n');
}

/**
 * 选定正在引导的那个 QQ。
 * 规则依次为：保留面板自己的选择 → 复用已选中账号 → 只有一个就走它 → 否则要求选择。
 */
export function pickTargetProcess(
    processList: HookProcessInfo[],
    selectedPid: number | null,
    selectedUin: string | null,
): { target: HookProcessInfo | null; needsChoice: boolean; lostSelection: boolean } {
    if (selectedPid != null) {
        const kept = processList.find((p) => p.pid === selectedPid);

        if (kept) {
            return { target: kept, needsChoice: false, lostSelection: false };
        }

        return { target: null, needsChoice: false, lostSelection: true };
    }

    if (processList.length === 1) {
        return { target: processList[0], needsChoice: false, lostSelection: false };
    }

    if (selectedUin) {
        const byUin = processList.filter((p) => p.uin === selectedUin && p.loggedIn);

        if (byUin.length === 1) {
            return { target: byUin[0], needsChoice: false, lostSelection: false };
        }
    }

    if (processList.length > 1) {
        return { target: null, needsChoice: true, lostSelection: false };
    }

    return { target: null, needsChoice: false, lostSelection: false };
}

export function nextStep(input: StepInput, selectedUin: string | null = null): StepView {
    const { ready, errors, processList, qqList, connections, selectedPid, pendingOp } = input;

    // 1. 读取失败优先：有旧数据也不能宣布正常。
    const firstError = [errors.processList, errors.qqList, errors.connections].find(
        (e) => e.trim().length > 0,
    );

    if (firstError) {
        return view('readError', 'read-error', { error: firstError });
    }

    // 2. 还没读全 → 不能把空数组当成「没开 QQ」。
    if (!ready.processList || !ready.qqList || !ready.connections) {
        return view('reading', 'reading');
    }

    // 3. 完全没东西。
    if (processList.length === 0 && qqList.length === 0 && connections.length === 0) {
        return view('noQq', 'no-qq');
    }

    // 4. 选目标。
    const { target, needsChoice, lostSelection } = pickTargetProcess(
        processList,
        selectedPid,
        selectedUin,
    );

    if (lostSelection) {
        return view('selectionLost', 'selection-lost');
    }

    if (needsChoice) {
        return view('chooseQq', 'choose-qq');
    }

    if (!target) {
        // 有账号或连接记录，但没有任何可对应的进程。
        return view('mismatch', 'mismatch');
    }

    // 5. 进程自身的推进。
    if (pendingOp !== null) {
        return view('busy', 'busy');
    }

    switch (target.status) {
        case 'loading':
            return view('connecting', 'connecting');

        case 'error':
            return view('loadFailed', 'load-failed', {
                action: target.injected ? 'refresh' : 'load',
                actionLabel: target.injected ? '重新连接' : '重试接入',
                error: target.error || '',
            });

        case 'disconnected':
            return view('disconnected', 'disconnected');

        case 'available':
            return view('needLoad', 'need-load', { error: target.error || '' });

        case 'connecting':
            return view('waitingOnline', 'waiting-online', { error: target.error || '' });

        case 'loaded':
            return view('needLogin', 'need-login', { error: target.error || '' });

        case 'online':
            break;

        default:
            // 状态与标志对不上时不要猜。
            return view('mismatch', 'mismatch');
    }

    if (!target.injected || !target.connected || !target.loggedIn) {
        return view('mismatch', 'mismatch');
    }

    // 6. 账号准备。
    const matched = connections.filter((c) => c.uin === target.uin);

    if (matched.length > 1) {
        // 同一账号可能同时存在已退出的旧实例，不能取第一条报正常。
        return view('mismatch', 'mismatch');
    }

    const account = matched[0];
    const qqEntry = qqList.find((q) => q.uin === target.uin);

    if (!account) {
        return view('mismatch', 'mismatch');
    }

    const migration = account.databaseMigration;

    if (migration && migration.usable === false) {
        if (migration.phase === 'failed') {
            return view('accountFailed', 'account-failed', {
                error: migration.error || '',
            });
        }

        return view('accountPreparing', 'account-preparing');
    }

    if (!qqEntry) {
        return view('mismatch', 'mismatch');
    }

    // 历史消息整理失败但账号可用：不阻塞，但要把说明挂出来。
    const migrationNote =
        migration?.phase === 'failed' && migration.usable
            ? '历史消息整理没完成，但不影响 QQ 使用。'
            : '';

    // 7. 连接设置。
    if (account.adapters.length === 0) {
        return view('noNetwork', 'no-network');
    }

    const { broken, warn, ok } = hasProblems(account.adapters);

    if (broken.length > 0) {
        return view('networkBroken', 'network-broken', {
            error: describeAdapters(broken),
        });
    }

    if (warn.length > 0) {
        return view('networkWarn', 'network-warn', {
            error: describeAdapters(warn),
        });
    }

    if (ok.length === 0) {
        // 全是 disabled。
        return view('networkOff', 'network-off');
    }

    // 服务端 ok 只证明「监听着」或「连着」，不证明机器人会自动回复。
    return view('ready', 'ready', {
        done: true,
        hint: migrationNote || T.ready.hint,
    });
}
