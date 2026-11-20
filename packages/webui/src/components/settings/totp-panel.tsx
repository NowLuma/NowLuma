import { useCallback, useEffect, useId, useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Group, SettingRow } from '@/components/settings/settings-controls';
import { Modal } from '@/components/interior/modal';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApi } from '@/lib/api';
import type { TotpEnrollment, TotpStatus } from '@/lib/api/types';
import { parseSecondFactor } from '@/lib/totp-second-factor';
import { TotpQr } from '@/components/settings/totp-qr';
import { TotpRecoveryCodes } from '@/components/settings/totp-recovery-codes';
import { copyText } from '@/lib/utils';

export function TotpPanel() {
    const api = useApi();
    const [status, setStatus] = useState<TotpStatus | 'loading' | { error: string }>('loading');
    const [setupOpen, setSetupOpen] = useState(false);
    const [disableOpen, setDisableOpen] = useState(false);
    const [regenOpen, setRegenOpen] = useState(false);

    const refresh = useCallback(async (isCurrent: () => boolean = () => true) => {
        try {
            const next = await api.totp.status();
            if (isCurrent()) {
                setStatus(next);
            }
        } catch (error) {
            if (isCurrent()) {
                setStatus({ error: error instanceof Error ? error.message : '读取双重验证状态失败' });
            }
        }
    }, [api]);

    useEffect(() => {
        let disposed = false;
        void refresh(() => !disposed);
        return () => {
            disposed = true;
        };
    }, [refresh]);

    return (
        <Group
            title="双重验证"
            icon={ShieldCheck}
        >
            {status === 'loading' ? (
                <SettingRow label="2FA">
                    <SkeletonSwap ready={false} reserve={24} lines={1} label="双重验证状态" children={null} />
                </SettingRow>
            ) : 'error' in status ? (
                <div role="alert" className="flex min-w-0 flex-col gap-1.5 py-3 text-xs text-destructive">
                    <p className="font-medium">无法读取双重验证状态</p>
                    <p className="break-words">{status.error}</p>
                    <p className="text-muted-foreground">当前状态未知；请重新载入页面后确认，不能据此判断是否已开启。</p>
                </div>
            ) : status.enabled ? (
                <>
                    <SettingRow
                        label="状态"
                        hint={`已绑定 ${status.label} · 剩余 ${status.remainingRecoveryCodes} 个恢复码`}
                    >
                        <span className="text-sm text-success">已开启</span>
                    </SettingRow>
                    <SettingRow label="恢复码" hint="重新生成后旧码立即作废。">
                        <Button variant="glass" size="sm" onClick={() => setRegenOpen(true)}>
                            重新生成
                        </Button>
                    </SettingRow>
                    <SettingRow
                        label="关闭 2FA"
                        hint="需要当前密码，以及验证码或恢复码。其他设备的会话将失效。"
                    >
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDisableOpen(true)}
                        >
                            关闭
                        </Button>
                    </SettingRow>
                </>
            ) : (
                <SettingRow
                    label="Authenticator"
                    hint="未开启；绑定验证器后用 6 位验证码确认。"
                >
                    <Button variant="glass" size="sm" onClick={() => setSetupOpen(true)}>
                        <KeyRound className="size-4" /> 开启 2FA
                    </Button>
                </SettingRow>
            )}

            <TotpSetupDialog
                open={setupOpen}
                onOpenChange={setSetupOpen}
                onEnabled={async () => {
                    await refresh();
                }}
            />
            <TotpChallengeDialog
                open={disableOpen}
                onOpenChange={setDisableOpen}
                title="关闭双重验证"
                description="关闭后，只需访问密码即可登录。其他已登录会话会立即失效。"
                confirmText="关闭 2FA"
                destructive
                onSubmit={async (password, second) => api.totp.disable(password, second)}
                onDone={refresh}
            />
            <TotpRegenDialog open={regenOpen} onOpenChange={setRegenOpen} onDone={refresh} />
        </Group>
    );
}

function TotpSetupDialog({
    open,
    onOpenChange,
    onEnabled,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEnabled: () => void | Promise<void>;
}) {
    const api = useApi();
    const formId = useId();
    const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
    const [issuer, setIssuer] = useState('');
    const [accountName, setAccountName] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

    const loadEnrollment = useCallback(
        async (
            nextIssuer?: string,
            nextAccount?: string,
            isCurrent: () => boolean = () => true,
        ): Promise<boolean> => {
            const result = await api.totp.begin({
                ...(nextIssuer ? { issuer: nextIssuer } : {}),
                ...(nextAccount ? { accountName: nextAccount } : {}),
            });
            if (!isCurrent()) {
                return false;
            }

            if (!result.success) {
                setError(result.message);
                return false;
            }

            setEnrollment(result);
            setIssuer(result.issuer);
            setAccountName(result.accountName);
            setError('');
            return true;
        },
        [api],
    );

    useEffect(() => {
        if (!open) {
            setEnrollment(null);
            setPassword('');
            setCode('');
            setError('');
            setRecoveryCodes(null);
            setBusy(false);
            return;
        }

        let disposed = false;
        setBusy(true);
        void loadEnrollment(undefined, undefined, () => !disposed)
            .catch((caught) => {
                if (!disposed) {
                    setError(caught instanceof Error ? caught.message : '无法读取 2FA 绑定信息');
                }
            })
            .finally(() => {
                if (!disposed) {
                    setBusy(false);
                }
            });
        return () => {
            disposed = true;
        };
    }, [open, loadEnrollment]);

    const refreshLabels = async () => {
        if (!enrollment || busy) {
            return;
        }

        setBusy(true);
        try {
            await loadEnrollment(issuer, accountName);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : '更新验证器显示名称失败');
        } finally {
            setBusy(false);
        }
    };

    const confirm = async () => {
        if (busy || !enrollment || !password || !/^\d{6}$/.test(code)) {
            return;
        }

        setBusy(true);
        setError('');
        try {
            if (!(await loadEnrollment(issuer, accountName))) {
                return;
            }
            const result = await api.totp.confirm(password, code);
            if (!result.success) {
                setError(result.message);
                return;
            }

            setPassword('');
            setCode('');
            setRecoveryCodes(result.recoveryCodes);
            await onEnabled();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : '开启双重验证失败');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={() => {
                if (!busy && !recoveryCodes) {
                    onOpenChange(false);
                }
            }}
            title={recoveryCodes ? '保存恢复码' : '开启双重验证'}
            description={
                recoveryCodes
                    ? '这些恢复码只显示一次。丢失 Authenticator 时用它们登录。'
                    : '用 Authenticator 扫描二维码，或手动输入密钥，然后输入当前访问密码和 6 位验证码。'
            }
            closeLabel="关闭 2FA 绑定"
            className="cp-dialog"
            maxWidth={440}
            showClose={!busy && !recoveryCodes}
            closeOnEscape={!busy && !recoveryCodes}
            closeOnBackdrop={!busy && !recoveryCodes}
            footer={!recoveryCodes && (
                <Button
                    type="submit"
                    form={formId}
                    variant="glass"
                    disabled={busy || !enrollment || !password || !/^\d{6}$/.test(code)}
                >
                    {busy ? '处理中…' : '确认开启'}
                </Button>
            )}
        >
            {recoveryCodes ? (
                <TotpRecoveryCodes codes={recoveryCodes} onConfirm={() => onOpenChange(false)} />
            ) : (
                <form
                    id={formId}
                    className="flex min-w-0 flex-col gap-4"
                    aria-busy={busy}
                    onSubmit={(event) => {
                        event.preventDefault();
                        void confirm();
                    }}
                >
                    {busy && !enrollment && <p role="status" className="text-xs text-muted-foreground">正在读取绑定信息…</p>}
                    {enrollment && (
                        <div className="flex flex-col items-center gap-3">
                            <TotpQr value={enrollment.otpauthUrl} label="2FA 绑定二维码" />
                            <p className="break-all text-center font-mono text-xs text-muted-foreground">
                                {enrollment.secret}
                            </p>
                            <div className="flex flex-wrap justify-center gap-2">
                                <Button
                                    type="button"
                                    variant="glass"
                                    disabled={busy}
                                    size="sm"
                                    onClick={async () => {
                                        if (!(await copyText(enrollment.secret))) {
                                            setError('复制密钥失败，请选择上方密钥手动复制。');
                                        }
                                    }}
                                >
                                    复制密钥
                                </Button>
                                <Button asChild variant="glass" size="sm" disabled={busy}>
                                    <a href={enrollment.otpauthUrl}>在验证器中打开</a>
                                </Button>
                            </div>
                        </div>
                    )}
                    <details className="text-xs">
                        <summary className="min-h-11 cursor-pointer py-3 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            验证器显示名称
                        </summary>
                        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                            服务名
                            <Input
                                value={issuer}
                                disabled={busy || !enrollment}
                                onChange={(e) => setIssuer(e.target.value)}
                                onBlur={() => {
                                    void refreshLabels();
                                }}
                            />
                        </label>
                        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                            账号名
                            <Input
                                value={accountName}
                                disabled={busy || !enrollment}
                                onChange={(e) => setAccountName(e.target.value)}
                                onBlur={() => {
                                    void refreshLabels();
                                }}
                            />
                        </label>
                        </div>
                    </details>
                    <label className="flex min-w-0 flex-col gap-1.5">
                        <span className="text-xs font-medium">当前访问密码</span>
                    <Input
                        type="password"
                        aria-label="当前访问密码"
                        placeholder="当前访问密码"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                        disabled={busy || !enrollment}
                    />
                    </label>
                    <label className="flex min-w-0 flex-col gap-1.5">
                        <span className="text-xs font-medium">6 位验证码</span>
                    <Input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        pattern="[0-9]{6}"
                        aria-label="6 位验证码"
                        placeholder="6 位验证码"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        required
                        disabled={busy || !enrollment}
                    />
                    </label>
                    {error && (
                        <p role="alert" className="text-xs text-destructive">
                            {error}
                        </p>
                    )}
                </form>
            )}
        </Modal>
    );
}

function TotpChallengeDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmText,
    destructive,
    onSubmit,
    onDone,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    confirmText: string;
    destructive?: boolean;
    onSubmit: (
        password: string,
        second: { totp?: string; recoveryCode?: string },
    ) => Promise<{ success: boolean; message?: string }>;
    onDone: () => void | Promise<void>;
}) {
    const formId = useId();
    const [password, setPassword] = useState('');
    const [second, setSecond] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) {
            setPassword('');
            setSecond('');
            setError('');
        }
    }, [open]);

    const submit = async () => {
        if (busy || !password || !second.trim()) {
            return;
        }

        setBusy(true);
        setError('');
        try {
            const result = await onSubmit(password, parseSecondFactor(second));
            if (!result.success) {
                setError(result.message ?? '操作失败');
                return;
            }

            await onDone();
            onOpenChange(false);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : '双重验证操作失败');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={() => {
                if (!busy) {
                    onOpenChange(false);
                }
            }}
            title={title}
            description={description}
            closeLabel={`关闭${title}`}
            className="cp-dialog"
            maxWidth={400}
            showClose={!busy}
            closeOnEscape={!busy}
            closeOnBackdrop={!busy}
            footer={
                <Button
                    type="submit"
                    form={formId}
                    variant={destructive ? 'destructive' : 'glass'}
                    disabled={busy || !password || !second.trim()}
                >
                    {busy ? '处理中…' : confirmText}
                </Button>
            }
        >
            <form
                id={formId}
                className="flex min-w-0 flex-col gap-3"
                aria-busy={busy}
                onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                }}
            >
                <label className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-xs font-medium">当前访问密码</span>
                <Input
                    type="password"
                    aria-label="当前访问密码"
                    placeholder="当前访问密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={busy}
                />
                </label>
                <label className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-xs font-medium">6 位验证码或恢复码</span>
                <Input
                    aria-label="6 位验证码或恢复码"
                    placeholder="6 位验证码或恢复码"
                    value={second}
                    onChange={(e) => setSecond(e.target.value)}
                    autoComplete="one-time-code"
                    required
                    disabled={busy}
                />
                </label>
                {error && (
                    <p role="alert" className="text-xs text-destructive">
                        {error}
                    </p>
                )}
            </form>
        </Modal>
    );
}

function TotpRegenDialog({
    open,
    onOpenChange,
    onDone,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onDone: () => void | Promise<void>;
}) {
    const api = useApi();
    const formId = useId();
    const [password, setPassword] = useState('');
    const [totp, setTotp] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [codes, setCodes] = useState<string[] | null>(null);

    useEffect(() => {
        if (!open) {
            setPassword('');
            setTotp('');
            setError('');
            setCodes(null);
        }
    }, [open]);

    const submit = async () => {
        if (busy || !password || !/^\d{6}$/.test(totp)) {
            return;
        }

        setBusy(true);
        setError('');
        try {
            const result = await api.totp.regenerateRecoveryCodes(password, totp);
            if (!result.success) {
                setError(result.message);
                return;
            }

            setPassword('');
            setTotp('');
            setCodes(result.recoveryCodes);
            await onDone();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : '重新生成恢复码失败');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={() => {
                if (!busy && !codes) {
                    onOpenChange(false);
                }
            }}
            title={codes ? '新的恢复码' : '重新生成恢复码'}
            description={
                codes
                    ? '旧恢复码已作废。请保存下面的新码。'
                    : '需要当前密码和 Authenticator 验证码。旧恢复码会立即作废。'
            }
            closeLabel="关闭恢复码"
            className="cp-dialog"
            maxWidth={440}
            showClose={!busy && !codes}
            closeOnEscape={!busy && !codes}
            closeOnBackdrop={!busy && !codes}
            footer={!codes && (
                <Button
                    type="submit"
                    form={formId}
                    variant="glass"
                    disabled={busy || !password || !/^\d{6}$/.test(totp)}
                >
                    {busy ? '正在生成…' : '生成新恢复码'}
                </Button>
            )}
        >
            {codes ? (
                <TotpRecoveryCodes codes={codes} onConfirm={() => onOpenChange(false)} />
            ) : (
                <form
                    id={formId}
                    className="flex min-w-0 flex-col gap-3"
                    aria-busy={busy}
                    onSubmit={(event) => {
                        event.preventDefault();
                        void submit();
                    }}
                >
                    <label className="flex min-w-0 flex-col gap-1.5">
                        <span className="text-xs font-medium">当前访问密码</span>
                    <Input
                        type="password"
                        aria-label="当前访问密码"
                        placeholder="当前访问密码"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                        disabled={busy}
                    />
                    </label>
                    <label className="flex min-w-0 flex-col gap-1.5">
                        <span className="text-xs font-medium">6 位验证码</span>
                    <Input
                        inputMode="numeric"
                        aria-label="6 位验证码"
                        placeholder="6 位验证码"
                        value={totp}
                        onChange={(e) => setTotp(e.target.value)}
                        autoComplete="one-time-code"
                        maxLength={6}
                        pattern="[0-9]{6}"
                        required
                        disabled={busy}
                    />
                    </label>
                    {error && (
                        <p role="alert" className="text-xs text-destructive">
                            {error}
                        </p>
                    )}
                </form>
            )}
        </Modal>
    );
}
