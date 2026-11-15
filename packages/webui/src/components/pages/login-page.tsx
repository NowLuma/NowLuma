import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotionConfig } from 'motion/react';
import { ArrowRight, Check, KeyRound, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useDropdown } from '@/components/interior/dropdown';
import { GlassMaterial } from '@/components/ui/glass-material';
import { OtpInput, type OtpInputHandle } from '@/components/interior/otp-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

// Device-local login effects; existing 0/1 choices never alter server appearance.
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
    const [fxOn, setFxOn] = useState(readLoginFx);
    const [fxSaveError, setFxSaveError] = useState('');

    const toggleFx = (v: boolean) => {
        setFxOn(v);

        try {
            localStorage.setItem(LOGIN_FX_KEY, v ? '1' : '0');
            setFxSaveError('');
        } catch (error) {
            setFxSaveError(
                `本次已生效，无法保存：${error instanceof Error ? error.message : String(error)}`,
            );
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
            fxSaveError={fxSaveError}
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
    fxOn,
    fxSaveError,
    onToggleFx,
    wide = false,
    children,
}: {
    customBg: boolean;
    reduce: boolean;
    fxOn: boolean;
    fxSaveError: string;
    onToggleFx: (value: boolean) => void;
    wide?: boolean;
    children: ReactNode;
}) {
    const { managedBy, performance } = useTheme();
    const lowCost = performance?.low ?? false;
    const effectsStatus = !fxOn
        ? '简洁'
        : reduce
          ? '细腻 · 静态'
          : lowCost
            ? '细腻 · 磨砂'
            : '细腻';
    return (
        <div className={cn('workspace-auth-shell', customBg ? 'bg-transparent' : 'bg-background')}>
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
                    <div
                        className="workspace-auth-artwork"
                        data-login-effects={fxOn ? 'full' : 'simple'}
                    >
                        <svg
                            className="workspace-auth-diagram"
                            aria-hidden="true"
                            focusable="false"
                            data-ui-decoration=""
                            data-line-motion={
                                fxOn && !reduce && !lowCost && !managedBy ? 'true' : undefined
                            }
                            width="352"
                            height="240"
                            viewBox="0 0 352 240"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <rect
                                x="30"
                                y="48"
                                width="74"
                                height="116"
                                rx="14"
                                strokeWidth="1"
                                opacity="0.28"
                            />
                            <circle cx="55" cy="73" r="9" strokeWidth="2" opacity="0.64" />
                            <path
                                d="M74 73h13M44 103h42M44 115h31M44 137h42"
                                strokeWidth="1"
                                opacity="0.38"
                            />
                            <rect
                                x="248"
                                y="72"
                                width="70"
                                height="96"
                                rx="14"
                                strokeWidth="1"
                                opacity="0.28"
                            />
                            <path d="M264 92h36M264 148h21" strokeWidth="1" opacity="0.42" />
                            <path d="M264 108h26" strokeWidth="2" opacity="0.55" />
                            <path d="M264 124h36" strokeWidth="3" opacity="0.64" />
                            <g className="workspace-auth-stream">
                                <path
                                    d="M91 120c39 0 31-48 83-48s49 55 82 55"
                                    strokeWidth="4"
                                    opacity="0.78"
                                />
                                <path
                                    d="M92 133c38 0 46-42 80-42s44 48 81 48"
                                    strokeWidth="2"
                                    opacity="0.4"
                                />
                                <path
                                    d="M89 147c41 0 49-36 84-36s44 39 79 39"
                                    strokeWidth="1"
                                    opacity="0.28"
                                />
                            </g>
                            <path d="M180 174v14M173 181h14" strokeWidth="1" opacity="0.3" />
                        </svg>
                        <div className="workspace-auth-signature">
                            <LineField animated={false} />
                        </div>
                        {fxOn && !managedBy && (
                            <div
                                className="ui-glass workspace-auth-lens"
                                aria-hidden="true"
                                data-ui-decoration=""
                            >
                                <GlassMaterial />
                            </div>
                        )}
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
                    {!managedBy && (
                        <LoginEffects
                            fxOn={fxOn}
                            status={effectsStatus}
                            reduce={reduce}
                            lowCost={lowCost}
                            onChange={onToggleFx}
                        />
                    )}
                    {fxSaveError && (
                        <p role="alert" className="mt-2 break-words text-xs text-destructive">
                            {fxSaveError}
                        </p>
                    )}
                </motion.div>
            </div>
            <footer className="workspace-auth-footer">{APP_NAME} · QQ 连接控制台</footer>
        </div>
    );
}

const LOGIN_EFFECTS = [
    { value: '1', label: '细腻', icon: Sparkles },
    { value: '0', label: '简洁', icon: SlidersHorizontal },
];

function LoginEffects({
    fxOn,
    status,
    reduce,
    lowCost,
    onChange,
}: {
    fxOn: boolean;
    status: string;
    reduce: boolean;
    lowCost: boolean;
    onChange: (value: boolean) => void;
}) {
    const { open, activeIndex, rootRef, triggerProps, listProps, getItemProps } = useDropdown({
        items: LOGIN_EFFECTS,
        value: fxOn ? '1' : '0',
        onChange: (value) => onChange(value === '1'),
    });
    const transition = reduce
        ? { duration: 0 }
        : lowCost
          ? { duration: 0.18, ease: 'easeOut' as const }
          : { type: 'spring' as const, duration: 0.42, bounce: 0.12 };

    return (
        <div className="workspace-auth-effects" ref={rootRef}>
            <button {...triggerProps} aria-label="显示效果" className="workspace-text-button">
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                显示效果
            </button>
            <span role="status" aria-live="polite" className="workspace-effects-status">
                {status}
            </span>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={reduce ? false : { opacity: 0, y: 6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        transition={transition}
                        className="ui-glass ui-glass-menu workspace-effects-menu"
                    >
                        <GlassMaterial />
                        <ul
                            {...listProps}
                            aria-label="显示效果"
                            className="workspace-theme-options"
                        >
                            <motion.li
                                role="presentation"
                                aria-hidden="true"
                                initial={false}
                                animate={{
                                    y: Math.max(0, activeIndex) * 44,
                                    opacity: activeIndex < 0 ? 0 : 1,
                                }}
                                transition={transition}
                                className="workspace-theme-active"
                            />
                            {LOGIN_EFFECTS.map(({ value, label, icon: Icon }, index) => (
                                <li
                                    key={value}
                                    {...getItemProps(index)}
                                    data-active={index === activeIndex}
                                    className="workspace-theme-option"
                                >
                                    <Icon className="size-4" aria-hidden="true" />
                                    <span className="flex-1">{label}</span>
                                    {value === (fxOn ? '1' : '0') && (
                                        <Check className="size-4" aria-hidden="true" />
                                    )}
                                </li>
                            ))}
                        </ul>
                        <p className="workspace-effects-note">仅此设备 · 系统偏好优先</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
