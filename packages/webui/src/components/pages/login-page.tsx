import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { motion, useReducedMotionConfig } from 'motion/react';
import { ArrowRight, KeyRound, Sparkles } from 'lucide-react';
import { Modal } from '@/components/interior/modal';
import { OtpInput, type OtpInputHandle } from '@/components/interior/otp-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { PasswordVisibilityIcon } from '@/components/ui/password-visibility-icon';
import { ThemeToggle } from '@/components/theme-toggle';
import { LineField } from '@/components/ui/line-field';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { BRAND_LOGO_URL } from '@/brand';
import { APP_NAME, APP_VERSION } from '@/types';
import { parseSecondFactor } from '@/lib/totp-second-factor';
import '@/styles/workspace.css';

interface LoginPageProps {
    onLogin: (
        password: string,
        secondFactor?: { totp?: string; recoveryCode?: string },
    ) => Promise<{ success: boolean; error?: string; needsTotp?: boolean }>;
    initialPassword?: string;
    initialNeedsTotp?: boolean;
    initialUseRecovery?: boolean;
}

// Device-local preference for the login chrome's slow line-field motion. It
// remains usable pre-auth and never overwrites the server appearance settings.
const LOGIN_FX_KEY = 'nowluma_login_fx';

function readLoginFx(): boolean {
    try {
        const v = localStorage.getItem(LOGIN_FX_KEY);

        if (v === '0') {
            return false;
        }

        if (v === '1') {
            return true;
        }
    } catch {
        /* ignore */
    }

    // A new device starts without drift when the OS asks for reduced motion.
    // Accessibility settings still take precedence over an explicit local choice.
    try {
        return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return true;
    }
}

export function LoginPage({
    onLogin,
    initialPassword = '',
    initialNeedsTotp = false,
    initialUseRecovery = false,
}: LoginPageProps) {
    const { appearance } = useTheme();
    const customBg = appearance.background.type !== 'none';
    const reduce = useReducedMotionConfig() || appearance.reduceMotion || appearance.disableMotion;

    // The login page must never carry operator custom CSS. applyAppearance gates
    // it on a token, but an in-session logout / 401 expiry won't re-run it, so
    // clear any lingering custom-CSS <style> whenever the login page shows.
    useEffect(() => {
        document.getElementById('nowluma-custom-css')?.remove();
    }, []);

    const [password, setPassword] = useState(initialPassword);
    const [useRecovery, setUseRecovery] = useState(initialUseRecovery);
    const [needsTotp, setNeedsTotp] = useState(initialNeedsTotp);
    const [otpStatus, setOtpStatus] = useState<'idle' | 'checking' | 'rejected'>('idle');
    const otpRef = useRef<OtpInputHandle>(null);
    const [showPwd, setShowPwd] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [shake, setShake] = useState(0);
    const [fxOn, setFxOn] = useState(readLoginFx);
    const [helpOpen, setHelpOpen] = useState(false);

    const toggleFx = (v: boolean) => {
        setFxOn(v);

        try {
            localStorage.setItem(LOGIN_FX_KEY, v ? '1' : '0');
        } catch {
            /* ignore */
        }
    };

    useEffect(() => {
        if (otpStatus !== 'rejected') {
            return;
        }

        const id = window.setTimeout(() => {
            otpRef.current?.clear();
            setOtpStatus('idle');
            setError('');
        }, 1600);
        return () => window.clearTimeout(id);
    }, [otpStatus]);

    const goBackToPassword = () => {
        setNeedsTotp(false);
        setUseRecovery(false);
        setOtpStatus('idle');
        setError('');
    };

    const handlePasswordSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        const result = await onLogin(password);
        setLoading(false);

        if (result.needsTotp) {
            setNeedsTotp(true);
            setUseRecovery(false);
            setOtpStatus('idle');
            setError('');
            return;
        }

        if (!result.success) {
            setError(result.error || '登录失败');
            setShake((k) => k + 1);
        }
    };

    const submitTotp = async (code: string) => {
        setOtpStatus('checking');
        const result = await onLogin(password, parseSecondFactor(code));

        if (result.success) {
            return;
        }

        if (result.needsTotp) {
            setOtpStatus('idle');
            return;
        }

        setError(
            result.error ||
                (useRecovery
                    ? '恢复码不正确，改错的那一位即可。'
                    : '验证码不正确，改错的那一位即可。'),
        );
        setOtpStatus('rejected');
    };

    const handleTotpSubmit = (e: FormEvent) => {
        e.preventDefault();
    };

    return (
        <LoginShell
            customBg={customBg}
            reduce={reduce}
            fxOn={fxOn}
            helpOpen={helpOpen}
            onHelpOpen={setHelpOpen}
            onToggleFx={toggleFx}
            wide={useRecovery}
        >
            {needsTotp ? (
                <>
                    <LoginBrand
                        title={useRecovery ? '使用恢复码' : '验证身份'}
                        subtitle={
                            useRecovery
                                ? '输入保存的一次性恢复码'
                                : '输入 Authenticator 中的 6 位验证码'
                        }
                    />
                    <form onSubmit={handleTotpSubmit} className="mt-8 flex flex-col gap-3.5">
                        <OtpInput
                            key={useRecovery ? 'recovery' : 'totp'}
                            ref={otpRef}
                            autoFocus
                            className="w-full"
                            length={useRecovery ? 8 : 6}
                            mode={useRecovery ? 'alphanumeric' : 'numeric'}
                            groupEvery={useRecovery ? 4 : 3}
                            groupSeparator={useRecovery}
                            label={useRecovery ? '恢复码' : '验证码'}
                            disabled={otpStatus === 'checking'}
                            error={otpStatus === 'rejected'}
                            errorMessage={
                                error ||
                                (useRecovery
                                    ? '恢复码不正确，改错的那一位即可。'
                                    : '验证码不正确，改错的那一位即可。')
                            }
                            hint={
                                useRecovery
                                    ? '可以把完整恢复码粘贴到任意一格，连字符会自动忽略。'
                                    : '可以把完整验证码粘贴到任意一格。'
                            }
                            onChange={() => setOtpStatus((s) => (s === 'rejected' ? 'idle' : s))}
                            onComplete={(code) => {
                                void submitTotp(code);
                            }}
                        />
                        {!useRecovery && (
                            <input
                                type="text"
                                name="one-time-code"
                                autoComplete="one-time-code"
                                inputMode="numeric"
                                className="sr-only"
                                tabIndex={-1}
                                aria-hidden="true"
                                onChange={(e) => {
                                    const digits = e.currentTarget.value
                                        .replace(/\D/g, '')
                                        .slice(0, 6);

                                    if (digits.length === 6) {
                                        void submitTotp(digits);
                                    }
                                }}
                            />
                        )}

                        <div className="flex items-center justify-between text-[12px]">
                            <button
                                type="button"
                                onClick={goBackToPassword}
                                className="text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                            >
                                返回
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setUseRecovery((v) => !v);
                                    setOtpStatus('idle');
                                    setError('');
                                }}
                                className="text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                            >
                                {useRecovery ? '改用验证码' : '使用恢复码'}
                            </button>
                        </div>
                    </form>
                </>
            ) : (
                <>
                    <LoginBrand title="登录控制台" subtitle="输入访问密码，继续管理你的连接。" />
                    <form onSubmit={handlePasswordSubmit} className="mt-8 flex flex-col gap-3.5">
                        <label htmlFor="login-password" className="text-sm font-medium">
                            访问密码
                        </label>
                        <motion.div
                            key={shake}
                            animate={!reduce && shake > 0 ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : {}}
                            transition={{ duration: 0.4 }}
                            className="relative"
                        >
                            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="login-password"
                                name="password"
                                type={showPwd ? 'text' : 'password'}
                                placeholder="输入访问令牌"
                                aria-label="访问密码"
                                aria-invalid={!!error}
                                aria-describedby={error ? 'login-error' : undefined}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoFocus
                                autoComplete="current-password"
                                className="h-12 bg-background pl-10 pr-12 text-base"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPwd((v) => !v)}
                                className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label={showPwd ? '隐藏密码' : '显示密码'}
                            >
                                <PasswordVisibilityIcon visible={showPwd} reduceMotion={reduce} />
                            </button>
                        </motion.div>

                        {error && (
                            <motion.p
                                id="login-error"
                                role="alert"
                                initial={reduce ? false : { opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-xs text-destructive"
                            >
                                {error}
                            </motion.p>
                        )}

                        <Button
                            type="submit"
                            disabled={loading || !password}
                            className="h-12 text-[15px]"
                        >
                            {loading ? (
                                '验证中…'
                            ) : (
                                <>
                                    进入控制台 <ArrowRight className="optical-forward size-4" />
                                </>
                            )}
                        </Button>
                    </form>
                </>
            )}
        </LoginShell>
    );
}

function LoginBrand({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className="workspace-auth-heading">
            <p className="workspace-eyebrow">安全访问</p>
            <h1>{title}</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>
    );
}

function LoginShell({
    customBg,
    reduce,
    fxOn,
    helpOpen,
    onHelpOpen,
    onToggleFx,
    wide = false,
    children,
}: {
    customBg: boolean;
    reduce: boolean;
    fxOn: boolean;
    helpOpen: boolean;
    onHelpOpen: (open: boolean) => void;
    onToggleFx: (value: boolean) => void;
    wide?: boolean;
    children: ReactNode;
}) {
    const { managedBy } = useTheme();
    return (
        <div className={cn('workspace-auth-shell', customBg ? 'bg-transparent' : 'bg-background')}>
            <header className="workspace-auth-masthead">
                <div className="workspace-auth-wordmark">
                    <img src={BRAND_LOGO_URL} alt="" className="size-7 rounded-md" />
                    <span>{APP_NAME}</span>
                    <span className="workspace-auth-version">v{APP_VERSION}</span>
                </div>
                <ThemeToggle />
            </header>
            <div className={cn('workspace-auth-content', wide && 'workspace-auth-content-wide')}>
                <aside className="workspace-auth-identity" aria-label="Nowluma QQ 连接控制台">
                    <div className="workspace-auth-artwork">
                        <LineField animated={fxOn && !reduce} />
                        <div className="workspace-auth-artwork-caption">
                            <span>{APP_NAME}</span>
                            <span>QQ 连接控制台</span>
                        </div>
                    </div>
                    <div className="workspace-auth-introduction">
                        <p className="workspace-eyebrow">你的连接，井然有序</p>
                        <p className="workspace-auth-statement">从一次连接开始。</p>
                    </div>
                </aside>
                <motion.div
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.2 }}
                    className={cn('workspace-auth-document', wide ? 'max-w-2xl' : 'max-w-md')}
                >
                    <section className="workspace-auth-form" aria-label="登录">
                        {children}
                    </section>
                    <Button
                        style={{ display: managedBy ? 'none' : undefined }}
                        type="button"
                        variant="ghost"
                        onClick={() => onHelpOpen(true)}
                        className="workspace-auth-help text-xs text-muted-foreground hover:text-foreground"
                    >
                        <Sparkles className="size-3.5" />
                        我觉得这个界面很卡怎么办？
                    </Button>
                </motion.div>
            </div>
            <footer className="workspace-auth-footer">{APP_NAME} · QQ 连接控制台</footer>

            <Modal
                open={helpOpen}
                onClose={() => onHelpOpen(false)}
                title="界面有点卡顿？"
                description="暂停登录页的动态背景。这个选择仅保存在本设备，系统动效设置始终优先。"
                closeLabel="关闭性能设置弹窗"
                maxWidth={384}
            >
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/30 px-4 py-3">
                        <div className="min-w-0">
                            <p className="text-sm font-medium">登录页动态背景</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {reduce
                                    ? '系统动效设置优先 · 当前为静态'
                                    : fxOn
                                      ? '已开启 · 关闭后背景为静态'
                                      : '已关闭 · 背景为静态'}
                            </p>
                        </div>
                        <ToggleSwitch
                            value={fxOn}
                            onChange={onToggleFx}
                            ariaLabel="登录页动态背景"
                        />
                    </div>

                    <p className="text-xs leading-relaxed text-muted-foreground">
                        登录后，你还可以在「系统设置 →
                        无障碍」里进一步「减弱动效」或「关闭全部动效」。
                    </p>
                </div>
            </Modal>
        </div>
    );
}
