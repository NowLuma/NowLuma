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
        title: '正在检查 QQ，请稍等。',
        hint: '',
        action: null,
        actionLabel: '检查中…',
    },
    readError: {
        title: '当前状态没有读到，重新检查一下。',
        hint: '',
        action: 'refresh-all' as const,
        actionLabel: '重新检查',
    },
    noQq: {
        title: '在运行程序的设备上打开 QQ，或者点击“打开 QQ 桌面”。',
        hint: '如果 QQ 已经开着，可能是它还没登录完成。',
        action: 'refresh-all' as const,
        actionLabel: '我已打开 QQ',
    },
    chooseQq: {
        title: '找到了多个 QQ，请选择你想使用的那个。',
        hint: '一次只接一个，避免接错账号。',
        action: 'choose-qq' as const,
        actionLabel: '选一个 QQ',
    },
    selectionLost: {
        title: '刚才选的 QQ 找不到了，请重新选择。',
        hint: '可能是 QQ 被关掉或重启了。',
        action: 'refresh-all' as const,
        actionLabel: '重新检查',
    },
    mismatch: {
        title: '找到了账号记录，但还没确认它对应哪个 QQ。',
        hint: '重新检查一次；如果一直这样，请确认 QQ 是否完全登录。',
        action: 'refresh-all' as const,
        actionLabel: '重新检查',
    },
    busy: {
        title: '正在处理这个 QQ，请不要重复点击。',
        hint: '',
        action: null,
        actionLabel: '处理中…',
    },
    connecting: {
        title: '正在把 QQ 接上，请稍等。',
        hint: '',
        action: null,
        actionLabel: '连接中…',
    },
    loadFailed: {
        title: '这个 QQ 暂时没接好，请再试一次。',
        hint: '如果反复失败，请查看日志里的原因。',
        action: 'load' as const,
        actionLabel: '再试一次',
    },
    disconnected: {
        title: 'QQ 和它的连接断了，重新检查一下。',
        hint: '',
        action: 'refresh' as const,
        actionLabel: '重新连接',
    },
    needLoad: {
        title: '找到 QQ 了，点一下把它接上。',
        hint: '',
        action: 'load' as const,
        actionLabel: '连接这个 QQ',
    },
    waitingOnline: {
        title: '正在等 QQ 接好；一直没变化可以再检查一次。',
        hint: '',
        action: 'refresh' as const,
        actionLabel: '检查一下',
    },
    needLogin: {
        title: '请在 QQ 窗口里完成登录，然后点下面这个按钮。',
        hint: '扫码或密码登录都行，在 QQ 自己里完成。',
        action: 'refresh' as const,
        actionLabel: '我已登录，检查一下',
    },
    accountPreparing: {
        title: '正在准备账号数据，现在先不用操作。',
        hint: '',
        action: null,
        actionLabel: '准备中…',
    },
    accountFailed: {
        title: '账号准备失败了，先看原因再继续。',
        hint: '',
        action: 'details' as const,
        actionLabel: '查看原因',
    },
    noNetwork: {
        title: 'QQ 已接好，接下来还要设置你用的机器人程序。',
        hint: '在「配置」里加一个连接，让机器人程序能连上来。',
        action: 'open-config' as const,
        actionLabel: '去设置',
    },
    networkOff: {
        title: 'QQ 已接好，但连接设置还没有启用。',
        hint: '把要用的那个连接打开。',
        action: 'open-config' as const,
        actionLabel: '去设置',
    },
    networkBroken: {
        title: '有一项连接设置没有正常工作，先看原因。',
        hint: '',
        action: 'details' as const,
        actionLabel: '查看原因',
    },
    networkWarn: {
        title: 'QQ 已接好，但机器人程序那边还需要检查。',
        hint: '常见原因是它还没连上来，或者访问令牌不一致。',
        action: 'details' as const,
        actionLabel: '查看原因',
    },
    ready: {
        title: 'QQ 已经接好了。',
        hint: '是否会自动回复，取决于你在机器人程序里怎么写的。',
        action: 'details' as const,
        actionLabel: '看看说明',
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
                actionLabel: target.injected ? '重新连接' : '再试一次',
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
