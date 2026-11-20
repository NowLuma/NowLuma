import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { motion, useReducedMotionConfig } from 'motion/react';
import { ArrowRight, KeyRound } from 'lucide-react';
import { OtpInput, type OtpInputHandle } from '@/components/interior/otp-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordVisibilityIcon } from '@/components/ui/password-visibility-icon';
import { ThemeToggle } from '@/components/theme-toggle';
import { LineField } from '@/components/ui/line-field';
import { PaperBackdrop } from '@/components/layout/paper-backdrop';
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

export function LoginPage({
    onLogin,
    initialPassword = '',
    initialNeedsTotp = false,
    initialUseRecovery = false,
}: LoginPageProps) {
    const { appearance, performance } = useTheme();
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
        <LoginShell customBg={customBg} reduce={reduce} wide={useRecovery}>
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
                            className={cn('w-full', useRecovery && 'workspace-recovery-code')}
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
                    <LoginBrand title="进入工作台" subtitle="管理 QQ 会话与机器人连接。" />
                    <form onSubmit={handlePasswordSubmit} className="mt-8 flex flex-col gap-3.5">
                        <label htmlFor="login-password" className="text-sm font-medium">
                            访问密码
                        </label>
                        <motion.div
                            key={shake}
                            animate={!reduce && shake > 0 ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : {}}
                            transition={{ duration: reduce ? 0 : performance?.low ? 0.18 : 0.4 }}
                            className="relative"
                        >
                            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="login-password"
                                name="password"
                                type={showPwd ? 'text' : 'password'}
                                placeholder="输入访问密码"
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
                                className="absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                            variant="glass"
                            className="h-12 text-[15px]"
                        >
                            {loading ? (
                                '验证中…'
                            ) : (
                                <>
                                    打开工作台 <ArrowRight className="optical-forward size-4" />
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
    wide = false,
    children,
}: {
    customBg: boolean;
    reduce: boolean;
    wide?: boolean;
    children: ReactNode;
}) {
    const { managedBy, performance } = useTheme();
    const lowCost = performance?.low ?? false;
    return (
        <div className={cn('workspace-auth-shell', customBg ? 'bg-transparent' : 'bg-background')}>
            {!customBg && <PaperBackdrop />}
            <header className="workspace-auth-masthead">
                <div className="workspace-auth-wordmark">
                    <img src={BRAND_LOGO_URL} alt="" className="size-7 rounded-md" />
                    <span>{APP_NAME}</span>
                    <span className="workspace-auth-version">v{APP_VERSION}</span>
                </div>
                <div className="workspace-toolbar-scene">
                    <ThemeToggle />
                </div>
            </header>
            <div className={cn('workspace-auth-content', wide && 'workspace-auth-content-wide')}>
                <aside className="workspace-auth-identity" aria-label="Nowluma QQ 连接控制台">
                    <div className="workspace-auth-artwork">
                        <LineField animated={!reduce && !lowCost && !managedBy} />
                        <div className="workspace-auth-artwork-caption">
                            <span>01 — 连接，从这里开始</span>
                            <span aria-hidden="true" className="workspace-line-key">
                                <i />
                                <i />
                                <i />
                                <i />
                            </span>
                        </div>
                    </div>
                    <div className="workspace-auth-introduction">
                        <p className="workspace-eyebrow">QQ 连接控制台</p>
                        <p className="workspace-auth-statement">
                            连接有序，
                            <br />
                            结果清晰。
                        </p>
                    </div>
                </aside>
                <motion.div
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={
                        reduce
                            ? { duration: 0 }
                            : lowCost
                              ? { duration: 0.18 }
                              : { type: 'spring', duration: 0.42, bounce: 0.1 }
                    }
                    className={cn('workspace-auth-document', wide ? 'max-w-2xl' : 'max-w-md')}
                >
                    <section className="workspace-auth-form" aria-label="登录">
                        {children}
                    </section>
                </motion.div>
            </div>
            <footer className="workspace-auth-footer">{APP_NAME} · QQ 连接控制台</footer>
        </div>
    );
}
