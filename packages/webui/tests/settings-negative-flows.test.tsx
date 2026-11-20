import * as React from 'react';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import type * as Motion from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AboutPanel } from '../src/components/settings/about-panel';
import { NotificationChannelDialog } from '../src/components/settings/notification-channel-dialog';
import { NotificationsPanel } from '../src/components/settings/notifications-panel';
import { StoragePanel } from '../src/components/settings/storage-panel';
import { SystemPanel } from '../src/components/settings/system-panel';
import { TotpPanel } from '../src/components/settings/totp-panel';
import { TotpRecoveryCodes } from '../src/components/settings/totp-recovery-codes';
import { ConfirmDialog } from '../src/components/confirm-dialog';
import { Button } from '../src/components/ui/button';
import { ActionFeedbackProvider } from '../src/contexts/ActionFeedbackContext';
import type { ActionFeedbackValue } from '../src/contexts/ActionFeedbackContext';
import type {
    NotificationChannel,
    NotificationsConfig,
    StorageCleanupResponse,
    StorageOverviewResponse,
    SystemSettingsResponse,
    UpdateInfo,
} from '../src/types';
import { elements, hookHost } from './helpers/hook-host';

const state = vi.hoisted(() => ({
    api: {
        systemSettings: {
            get: vi.fn(),
            save: vi.fn(),
            uploadCert: vi.fn(),
            deleteCert: vi.fn(),
        },
        storage: { get: vi.fn(), cleanup: vi.fn(), saveSettings: vi.fn() },
        notifications: { getConfig: vi.fn(), saveConfig: vi.fn(), test: vi.fn() },
        totp: {
            status: vi.fn(),
            begin: vi.fn(),
            confirm: vi.fn(),
            disable: vi.fn(),
            regenerateRecoveryCodes: vi.fn(),
        },
    },
    updateInfo: null as UpdateInfo | null,
    updateError: null as string | null,
    refreshUpdate: vi.fn(),
}));
vi.mock('react', async (original) => ({ ...(await original<typeof React>()) }));
vi.mock('motion/react', async (original) => ({
    ...(await original<typeof Motion>()),
    useReducedMotionConfig: () => true,
}));
vi.mock('@/lib/api', () => ({ useApi: () => state.api }));
vi.mock('@/contexts/AppStateContext', () => ({
    useAppState: () => ({
        updateInfo: state.updateInfo,
        refreshUpdate: state.refreshUpdate,
        resources: { updateInfo: { ready: true, error: state.updateError } },
    }),
}));

type ChildRenderer = (props: Record<string, unknown>) => ReactElement;
let panelHost = hookHost();
let dialogHost = hookHost();
let recoveryHost = hookHost();
let feedbackHost = hookHost();

function feedback(): ActionFeedbackValue {
    return feedbackHost.render(() => ActionFeedbackProvider({ children: null })).props.value;
}

function render(component: () => ReactElement) {
    vi.spyOn(React, 'useContext').mockReturnValue(feedback());
    return panelHost.render(component);
}

function find(tree: ReactNode, predicate: (node: ReactElement<Record<string, unknown>>) => boolean) {
    const node = elements(tree).find(predicate);
    expect(node).toBeDefined();
    return node!;
}

function child(tree: ReactNode, name: string) {
    return find(tree, (node) => typeof node.type === 'function' && node.type.name === name);
}

function text(node: ReactNode): string {
    if (typeof node === 'string' || typeof node === 'number') {
        return String(node);
    }
    if (Array.isArray(node)) {
        return node.map(text).join('');
    }
    return React.isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : '';
}

function action(tree: ReactNode, label: string) {
    return find(tree, (node) => node.type === Button && text(node.props.children as ReactNode).trim() === label);
}

function alertText(tree: ReactNode) {
    return elements(tree)
        .filter((node) => node.props.role === 'alert')
        .map((node) => text(node.props.children as ReactNode))
        .join('\n');
}

function setField(tree: ReactNode, label: string, value: string) {
    const field = find(tree, (node) => node.props['aria-label'] === label);
    (field.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
}

async function flush() {
    for (let i = 0; i < 16; i++) {
        await Promise.resolve();
    }
}

async function submit(tree: ReactNode) {
    const form = find(tree, (node) => node.type === 'form');
    (form.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: vi.fn() });
    await flush();
}

function totpDialog(name: string) {
    const node = child(render(TotpPanel), name);
    return dialogHost.render(() => (node.type as ChildRenderer)(node.props));
}

function updateGroup() {
    const node = child(AboutPanel(), 'UpdateGroup');
    return render(() => (node.type as ChildRenderer)(node.props));
}

const system = (hasCert = false): SystemSettingsResponse => ({
    settings: {
        webuiPort: 5099,
        webuiHost: '127.0.0.1',
        trustProxy: '',
        tlsEnabled: false,
        vncPort: 0,
        vncUrl: '',
        hookAutoLoad: false,
    },
    hasCert,
    envOverrides: [],
    listeningPort: 5099,
    restartRequiredToApply: false,
});
const update = (patch: Partial<UpdateInfo> = {}): UpdateInfo => ({
    current: '2.5.0',
    latest: '2.5.0',
    hasUpdate: false,
    htmlUrl: null,
    notes: null,
    publishedAt: null,
    checkedAt: 1,
    ...patch,
});
const channel = (id: string): NotificationChannel => ({
    id,
    name: id,
    type: 'webhook',
    url: 'https://example.invalid/notify',
    bodyTemplate: '{uin}: {event}',
    enabled: true,
});
const notifications = (): NotificationsConfig => ({
    debounceSeconds: 10,
    channels: [channel('channel-a'), channel('channel-b')],
});
const storage = (): StorageOverviewResponse => ({
    settings: {
        saved: { logMaxTotalMb: 10, logRetainDays: 7, logPerUin: false },
        effective: { logMaxTotalMb: 10, logRetainDays: 7, logPerUin: false },
        envOverrides: [],
    },
    snapshot: {
        logs: {
            state: 'healthy',
            totalBytes: 1024,
            maxTotalBytes: 10 * 1024 * 1024,
            retainDays: 7,
            perUinEnabled: false,
            fileCount: 6,
            activeFileCount: 1,
            droppedLines: 0,
        },
        temporary: { totalBytes: 0, fileCount: 0, activeItemCount: 0 },
        accounts: [],
        totals: { logsBytes: 1024, temporaryBytes: 0, accountDataBytes: 0, managedBytes: 1024 },
    },
    lastCleanup: null,
});
const enrollment = {
    success: true,
    secret: 'JBSWY3DPEHPK3PXP',
    otpauthUrl: 'otpauth://totp/Nowluma:fixture?secret=JBSWY3DPEHPK3PXP&issuer=Nowluma',
    issuer: 'Nowluma',
    accountName: 'fixture',
};
const recoveryCodes = ['AB3D-K7MQ', 'C45E-R6TU', 'D67F-S8VW', 'E89G-T2XY', 'F23H-U4ZA', 'G45J-V6BC', 'H67K-W8DE', 'J89L-X2FG'];

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout, clearTimeout, location: { href: 'http://localhost:5099/settings' } });
    vi.stubGlobal('sessionStorage', { getItem: () => null, removeItem: vi.fn() });
    panelHost = hookHost();
    dialogHost = hookHost();
    recoveryHost = hookHost();
    feedbackHost = hookHost();
    state.updateInfo = update();
    state.updateError = null;
    state.refreshUpdate.mockReset();
    state.api.systemSettings.get.mockReset().mockResolvedValue(system());
    state.api.systemSettings.save.mockReset().mockResolvedValue({ settings: system().settings, restartRequiredToApply: true });
    state.api.systemSettings.uploadCert.mockReset().mockResolvedValue(undefined);
    state.api.systemSettings.deleteCert.mockReset().mockResolvedValue(undefined);
    state.api.storage.get.mockReset().mockResolvedValue(storage());
    state.api.storage.cleanup.mockReset();
    state.api.storage.saveSettings.mockReset();
    state.api.notifications.getConfig.mockReset().mockResolvedValue(notifications());
    state.api.notifications.saveConfig.mockReset().mockResolvedValue(notifications());
    state.api.notifications.test.mockReset();
    state.api.totp.status.mockReset().mockResolvedValue({ enabled: false });
    state.api.totp.begin.mockReset().mockResolvedValue(enrollment);
    state.api.totp.confirm.mockReset();
    state.api.totp.disable.mockReset();
    state.api.totp.regenerateRecoveryCodes.mockReset();
});
afterEach(() => {
    [panelHost, dialogHost, recoveryHost, feedbackHost].forEach((host) => host.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('settings read and mutation failures', () => {
    it('keeps a saved service setting distinct from a failed refresh, beyond the result countdown', async () => {
        render(SystemPanel);
        await flush();
        state.api.systemSettings.get.mockRejectedValue(new Error('刷新连接已断开'));
        await (action(render(SystemPanel), '保存服务设置').props.onClick as () => Promise<void>)();
        expect(alertText(render(SystemPanel))).toContain('已保存，但状态刷新失败');
        expect(elements(render(SystemPanel)).some((node) => node.props.role === 'status')).toBe(false);
        vi.advanceTimersByTime(5000);
        expect(alertText(render(SystemPanel))).toContain('状态刷新失败');
        expect(state.api.systemSettings.get).toHaveBeenCalledTimes(2);
        expect(state.api.systemSettings.save).toHaveBeenCalledTimes(1);
    });

    it.each(['upload', 'delete'])('does not overwrite a certificate %s refresh failure with success', async (operation) => {
        state.api.systemSettings.get.mockResolvedValue(system(operation === 'delete'));
        render(SystemPanel);
        await flush();
        if (operation === 'upload') {
            for (const suffix of ['cert', 'key']) {
                const field = find(render(SystemPanel), (node) => String(node.props.id).endsWith(`-${suffix}`));
                (field.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: `fixture-${suffix}` } });
            }
            state.api.systemSettings.get.mockRejectedValue(new Error('刷新证书状态失败'));
            await (action(render(SystemPanel), '保存证书').props.onClick as () => Promise<void>)();
        } else {
            (action(render(SystemPanel), '删除证书').props.onClick as () => void)();
            state.api.systemSettings.get.mockRejectedValue(new Error('刷新证书状态失败'));
            const confirmation = find(render(SystemPanel), (node) => node.type === ConfirmDialog && node.props.open === true);
            await (confirmation.props.onConfirm as () => Promise<void>)();
        }
        expect(elements(render(SystemPanel)).some((node) =>
            node.type === Button && text(node.props.children as ReactNode).trim() === '更改证书',
        )).toBe(operation === 'upload');
        expect(alertText(render(SystemPanel))).toContain('状态刷新失败');
        expect(elements(render(SystemPanel)).some((node) => node.props.role === 'status')).toBe(false);
        vi.advanceTimersByTime(5000);
        expect(alertText(render(SystemPanel))).toContain('状态刷新失败');
        expect(state.api.systemSettings.get).toHaveBeenCalledTimes(2);
    });

    it('retains the initial service read error instead of replacing it with an empty form', async () => {
        state.api.systemSettings.get.mockRejectedValue(new Error('服务配置目录不可读'));
        render(SystemPanel);
        await flush();
        expect(alertText(render(SystemPanel))).toContain('服务配置目录不可读');
        expect(elements(render(SystemPanel)).some((node) => node.props['aria-label'] === '端口')).toBe(false);
        expect(state.api.systemSettings.get).toHaveBeenCalledTimes(1);
    });

    it.each([
        update(),
        update({ hasUpdate: true, latest: '9.0.0', notes: 'stale release notes' }),
        update({ error: 'disabled' }),
    ])('lets the current update read failure override stale update data %#', (stale) => {
        state.updateInfo = stale;
        state.updateError = '更新来源读取失败';
        const tree = updateGroup();
        expect(alertText(tree)).toContain('更新来源读取失败');
        expect(text(tree)).toContain('无法检查');
        expect(text(tree)).not.toContain('已是最新');
        expect(text(tree)).not.toContain('发现新版本');
        expect(text(tree)).not.toContain('stale release notes');
        expect(action(tree, '重新检查').props.disabled).toBe(false);
    });

    it('publishes a failed update result rather than a latest-version success notice', async () => {
        state.refreshUpdate.mockResolvedValue(update({ latest: null, error: 'GitHub 连接超时' }));
        await (action(updateGroup(), '重新检查').props.onClick as () => Promise<void>)();
        expect(feedback().notices).toEqual(expect.arrayContaining([expect.objectContaining({ tone: 'error', detail: 'GitHub 连接超时' })]));
        expect(feedback().notices.some((notice) => notice.tone === 'success')).toBe(false);
    });

    it('keeps notification testing exclusive and preserves a resolved delivery failure', async () => {
        const delivery = Promise.withResolvers<{ success: boolean; message: string }>();
        state.api.notifications.test.mockReturnValue(delivery.promise);
        render(NotificationsPanel);
        await flush();
        const row = child(render(NotificationsPanel), 'ChannelRow');
        const rowTree = (row.type as ChildRenderer)(row.props);
        (action(rowTree, '测试').props.onClick as () => void)();
        await flush();
        const pending = render(NotificationsPanel);
        expect(find(pending, (node) => node.props['aria-label'] === '去抖窗口（秒）').props.disabled).toBe(true);
        for (const channelRow of elements(pending).filter((node) => typeof node.type === 'function' && node.type.name === 'ChannelRow')) {
            const controls = (channelRow.type as ChildRenderer)(channelRow.props);
            expect(elements(controls).filter((node) => node.type === Button).every((node) => node.props.disabled === true)).toBe(true);
        }
        delivery.resolve({ success: false, message: '通知服务器拒绝请求' });
        await flush();
        expect(alertText(render(NotificationsPanel))).toContain('通知服务器拒绝请求');
        vi.advanceTimersByTime(5000);
        expect(alertText(render(NotificationsPanel))).toContain('通知服务器拒绝请求');
        expect(feedback().notices.some((notice) => notice.tone === 'success')).toBe(false);
        expect(feedback().notices).toEqual(expect.arrayContaining([expect.objectContaining({ tone: 'error', detail: '通知服务器拒绝请求' })]));
    });

    it('retains a partial cleanup in its confirmation and reveals every returned failure', async () => {
        const overview = storage();
        const failures = [1, 2, 3, 4].map((index) => ({ file: `logs/failed-${index}.log`, message: `删除被拒绝 ${index}` }));
        const result: StorageCleanupResponse = {
            success: false,
            message: '部分日志无法删除',
            scope: 'logs',
            cleanup: { deletedFiles: 2, freedBytes: 512, failures, status: overview.snapshot.logs },
            snapshot: overview.snapshot,
            lastCleanup: { at: '2026-01-01T00:00:00.000Z', scope: 'logs', accountScope: 'global', deletedFiles: 2, freedBytes: 512, failureCount: 4, failures },
        };
        state.api.storage.cleanup.mockResolvedValue(result);
        render(StoragePanel);
        await flush();
        const row = child(render(StoragePanel), 'CleanupRow');
        (action((row.type as ChildRenderer)(row.props), '清理').props.onClick as () => void)();
        const dialog = () => {
            const node = find(render(StoragePanel), (item) => item.type === ConfirmDialog && item.props.open === true);
            return dialogHost.render(() => ConfirmDialog(node.props as ComponentProps<typeof ConfirmDialog>));
        };
        (action(dialog().props.footer, '确认清理').props.onClick as () => void)();
        await flush();
        expect(alertText(dialog())).toContain('部分日志无法删除');
        expect(find(render(StoragePanel), (node) => node.type === ConfirmDialog && node.props.open === true)).toBeDefined();
        const summary = child(render(StoragePanel), 'LastCleanupSummary');
        expect(text((summary.type as ChildRenderer)(summary.props))).toContain('logs/failed-4.log');
        expect(text((summary.type as ChildRenderer)(summary.props))).toContain('删除被拒绝 4');
        expect(feedback().notices.some((notice) => notice.tone === 'success')).toBe(false);
        expect(state.api.storage.get).toHaveBeenCalledTimes(1);
    });

    it('does not erase a cleanup refresh failure with a successful deletion summary', async () => {
        const overview = storage();
        state.api.storage.cleanup.mockResolvedValue({ success: true, scope: 'logs', cleanup: { deletedFiles: 1, freedBytes: 512, failures: [], status: overview.snapshot.logs } });
        render(StoragePanel);
        await flush();
        const row = child(render(StoragePanel), 'CleanupRow');
        (action((row.type as ChildRenderer)(row.props), '清理').props.onClick as () => void)();
        state.api.storage.get.mockRejectedValue(new Error('存储读取连接断开'));
        const confirmation = find(render(StoragePanel), (node) => node.type === ConfirmDialog && node.props.open === true);
        await (confirmation.props.onConfirm as () => Promise<void>)();
        expect(alertText(render(StoragePanel))).toContain('存储状态刷新失败');
        expect(elements(render(StoragePanel)).some((node) => node.props.role === 'status')).toBe(false);
        vi.advanceTimersByTime(5000);
        expect(alertText(render(StoragePanel))).toContain('存储状态刷新失败');
        expect(state.api.storage.get).toHaveBeenCalledTimes(2);
    });
});

describe('two-factor safety and keyboard submission', () => {
    it('shows an unknown security state and the real status read error instead of hiding 2FA', async () => {
        state.api.totp.status.mockRejectedValue(new Error('验证状态读取被拒绝'));
        render(TotpPanel);
        await flush();
        const tree = render(TotpPanel);
        expect(alertText(tree)).toContain('验证状态读取被拒绝');
        expect(text(tree)).toContain('当前状态未知');
        expect(elements(tree).some((node) => node.props.children === '已开启')).toBe(false);
        expect(elements(tree).some((node) => node.type === Button)).toBe(false);
    });

    it('shows a failed enrollment read without a fake QR or enabled confirmation', async () => {
        state.api.totp.begin.mockResolvedValue({ success: false, message: '无法创建验证器密钥' });
        render(TotpPanel);
        await flush();
        (action(render(TotpPanel), '开启 2FA').props.onClick as () => void)();
        totpDialog('TotpSetupDialog');
        await flush();
        const dialog = totpDialog('TotpSetupDialog');
        expect(alertText(dialog)).toContain('无法创建验证器密钥');
        expect(action(dialog.props.footer, '确认开启').props.disabled).toBe(true);
        expect(elements(dialog).some((node) => typeof node.type === 'function' && node.type.name === 'TotpQr')).toBe(false);
        expect(state.api.totp.confirm).not.toHaveBeenCalled();
    });

    it('stops keyboard confirmation if the enrollment update failed', async () => {
        state.api.totp.begin.mockResolvedValueOnce(enrollment).mockResolvedValue({ success: false, message: '验证器密钥更新失败' });
        render(TotpPanel);
        await flush();
        (action(render(TotpPanel), '开启 2FA').props.onClick as () => void)();
        totpDialog('TotpSetupDialog');
        await flush();
        setField(totpDialog('TotpSetupDialog'), '当前访问密码', 'fixture-password');
        setField(totpDialog('TotpSetupDialog'), '6 位验证码', '123456');
        await submit(totpDialog('TotpSetupDialog'));
        expect(alertText(totpDialog('TotpSetupDialog'))).toContain('验证器密钥更新失败');
        expect(state.api.totp.confirm).not.toHaveBeenCalled();
    });

    it('cannot fake cancellation while disabling 2FA and keeps a rejected challenge open', async () => {
        state.api.totp.status.mockResolvedValue({ enabled: true, remainingRecoveryCodes: 8, label: 'fixture' });
        const disable = Promise.withResolvers<{ success: boolean; message: string }>();
        state.api.totp.disable.mockReturnValue(disable.promise);
        render(TotpPanel);
        await flush();
        (action(render(TotpPanel), '关闭').props.onClick as () => void)();
        setField(totpDialog('TotpChallengeDialog'), '当前访问密码', 'fixture-password');
        setField(totpDialog('TotpChallengeDialog'), '6 位验证码或恢复码', '123456');
        await submit(totpDialog('TotpChallengeDialog'));
        const pending = totpDialog('TotpChallengeDialog');
        expect(pending.props.closeOnEscape).toBe(false);
        expect(pending.props.closeOnBackdrop).toBe(false);
        (pending.props.onClose as () => void)();
        expect(child(render(TotpPanel), 'TotpChallengeDialog').props.open).toBe(true);
        disable.resolve({ success: false, message: '验证码已失效' });
        await flush();
        expect(alertText(totpDialog('TotpChallengeDialog'))).toContain('验证码已失效');
        expect(child(render(TotpPanel), 'TotpChallengeDialog').props.open).toBe(true);
    });

    it('requires recovery-code acknowledgement before regeneration can close', async () => {
        state.api.totp.status.mockResolvedValue({ enabled: true, remainingRecoveryCodes: 8, label: 'fixture' });
        state.api.totp.regenerateRecoveryCodes.mockResolvedValue({ success: true, recoveryCodes });
        render(TotpPanel);
        await flush();
        (action(render(TotpPanel), '重新生成').props.onClick as () => void)();
        setField(totpDialog('TotpRegenDialog'), '当前访问密码', 'fixture-password');
        setField(totpDialog('TotpRegenDialog'), '6 位验证码', '123456');
        await submit(totpDialog('TotpRegenDialog'));
        const dialog = totpDialog('TotpRegenDialog');
        expect(dialog.props.closeOnEscape).toBe(false);
        expect(dialog.props.closeOnBackdrop).toBe(false);
        (dialog.props.onClose as () => void)();
        expect(child(render(TotpPanel), 'TotpRegenDialog').props.open).toBe(true);
        const codes = find(dialog, (node) => node.type === TotpRecoveryCodes);
        const renderCodes = () => recoveryHost.render(() => TotpRecoveryCodes(codes.props as ComponentProps<typeof TotpRecoveryCodes>));
        expect(action(renderCodes(), '完成').props.disabled).toBe(true);
        expect(find(renderCodes(), (node) => node.props.type === 'checkbox').props.checked).toBe(false);
        (find(renderCodes(), (node) => node.props.type === 'checkbox').props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
        expect(action(renderCodes(), '完成').props.disabled).toBe(false);
        (action(renderCodes(), '完成').props.onClick as () => void)();
        expect(child(render(TotpPanel), 'TotpRegenDialog').props.open).toBe(false);
    });

    it('blocks an invalid channel ID even when Enter submits the dialog form', async () => {
        const onSubmit = vi.fn();
        const onOpenChange = vi.fn();
        const dialog = render(() => NotificationChannelDialog({ open: true, isEdit: false, initial: channel('duplicate'), otherIds: ['duplicate'], onSubmit, onOpenChange }));
        expect(action(dialog.props.footer, '创建渠道').props.disabled).toBe(true);
        await submit(dialog);
        expect(onSubmit).not.toHaveBeenCalled();
        expect(onOpenChange).not.toHaveBeenCalled();
    });
});
