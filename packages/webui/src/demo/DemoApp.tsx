import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { BookOpen, FlaskConical, Monitor, RotateCcw, X } from 'lucide-react';
import App from '@/App';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/interior/modal';
import { createApiClient } from '@/lib/api';
import { appRouter } from '@/router';
import { DEMO_NEW_PASSWORD, DEMO_TOTP } from './constants';
import { DEMO_JOURNEY } from './journey';
import type { DemoApi, DemoScenario } from './api';
import './demo.css';

export function DemoApp({ api }: { api: DemoApi }) {
    const [epoch, setEpoch] = useState(0);
    const [guideOpen, setGuideOpen] = useState(true);
    const [desktopOpen, setDesktopOpen] = useState(false);
    const [selectedStep, setSelectedStep] = useState(0);
    const [linkError, setLinkError] = useState('');
    const notice = useSyncExternalStore(
        api.subscribe,
        () => api.notice,
        () => api.notice,
    );
    const client = useMemo(() => {
        // The production API client/parser runs unchanged over the fake transport.
        const client = createApiClient({ onUnauthorized: () => setEpoch((value) => value + 1) });

        client.debug.upload = async (file, options) => {
            const form = new FormData();
            form.append('file', file);
            options?.onProgress?.(0);
            const response = await client.request('/api/debug/upload', {
                method: 'POST',
                body: form,
                signal: options?.signal,
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message ?? 'DEMO upload failed');
            }

            options?.onProgress?.(1);
            return result;
        };

        return client;
        // A reset needs a fresh client with no stale token/stream subscriptions.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [epoch]);

    useEffect(() => {
        const desktop = () => setDesktopOpen(true);
        const blocked = () =>
            setLinkError('DEMO: External/unsupported links are blocked. Nothing was opened.');
        window.addEventListener('nowluma-demo-desktop', desktop);
        window.addEventListener('nowluma-demo-blocked-link', blocked);

        return () => {
            window.removeEventListener('nowluma-demo-desktop', desktop);
            window.removeEventListener('nowluma-demo-blocked-link', blocked);
        };
    }, []);

    const reset = () => {
        api.reset();
        localStorage.clear();
        sessionStorage.clear();
        sessionStorage.setItem('nowluma_safe_mode', '1');
        appRouter.history.replace('/');
        setEpoch((value) => value + 1);
        setSelectedStep(0);
        setLinkError('');
        setDesktopOpen(false);
        setGuideOpen(true);
    };

    const navigate = (route: string) => {
        appRouter.history.push(route);
        setGuideOpen(false);
        requestAnimationFrame(() => {
            const main = document.querySelector<HTMLElement>('main');
            main?.setAttribute('tabindex', '-1');
            (main ?? document.querySelector<HTMLElement>('input[type="password"]'))?.focus();
        });
    };

    const summary = api.summary;
    const step = DEMO_JOURNEY[selectedStep];

    return (
        <div className="demo-shell">
            <header className="demo-banner" aria-label="Practice simulator / 安全模拟器">
                <div className="demo-banner-label">
                    <FlaskConical aria-hidden="true" size={19} />
                    <strong>DEMO · 安全练习</strong>
                    <span>Real console · memory only · no QQ</span>
                </div>
                <div className="demo-banner-actions">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setGuideOpen((open) => !open)}
                        aria-expanded={guideOpen}
                        aria-controls="demo-guide"
                    >
                        <BookOpen size={15} /> Guide / 引导
                    </Button>
                    <Button variant="outline" size="sm" onClick={reset}>
                        <RotateCcw size={15} /> Reset / 重置
                    </Button>
                </div>
            </header>
            <div className="demo-console">
                <App key={epoch} client={client} />
            </div>
            {guideOpen && (
                <aside
                    id="demo-guide"
                    className="demo-guide"
                    aria-label="English practice guide / 操作引导"
                >
                    <div className="demo-guide-heading">
                        <div>
                            <span className="demo-eyebrow">INTERACTIVE PRACTICE</span>
                            <h2>Try the actual console</h2>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Close guide / 收起引导"
                            onClick={() => setGuideOpen(false)}
                        >
                            <X size={16} />
                        </Button>
                    </div>
                    <p>
                        All controls below belong to the real React console. Every result is a
                        labelled simulation. Refresh or Reset clears all writes.
                    </p>
                    <div className="demo-credentials">
                        <strong>Public examples only — never real secrets</strong>
                        <dl>
                            <dt>Login / 登录</dt>
                            <dd>
                                <code>{api.examplePassword}</code>
                            </dd>
                            <dt>New password / 新密码</dt>
                            <dd>
                                <code>{DEMO_NEW_PASSWORD}</code>
                            </dd>
                            <dt>2FA code / 验证码</dt>
                            <dd>
                                <code>{DEMO_TOTP}</code> · example only
                            </dd>
                        </dl>
                    </div>
                    <nav className="demo-steps" aria-label="Practice steps">
                        {DEMO_JOURNEY.map((item, index) => (
                            <button
                                key={item.id}
                                type="button"
                                aria-current={selectedStep === index ? 'step' : undefined}
                                onClick={() => setSelectedStep(index)}
                            >
                                {item.title}
                            </button>
                        ))}
                    </nav>
                    <section className="demo-step-detail" aria-labelledby="demo-step-title">
                        <h3 id="demo-step-title">{step.title}</h3>
                        <p>{step.description}</p>
                        <p className="demo-control-label">
                            Actual control: <strong>{step.control}</strong>
                        </p>
                        <Button size="sm" onClick={() => navigate(step.route)}>
                            Open this console page / 前往
                        </Button>
                        {step.id === 'desktop' && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDesktopOpen(true)}
                            >
                                <Monitor size={15} /> Open mock desktop
                            </Button>
                        )}
                    </section>
                    <div className="demo-scenarios">
                        <label htmlFor="demo-scenario">Scenario / 情景</label>
                        <select
                            id="demo-scenario"
                            value={api.scenario}
                            onChange={(event) =>
                                event.target.value === 'setup'
                                    ? reset()
                                    : api.setScenario(event.target.value as DemoScenario)
                            }
                        >
                            <option value="setup">First setup / 首次设置</option>
                            <option value="ready">Ready account / 在线示例</option>
                            <option value="offline">Account offline / 离线</option>
                            <option value="failure">API failure / 接口错误</option>
                        </select>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                api.failNextMutation = true;
                                setLinkError(
                                    'DEMO: The next non-auth write will fail without changing memory.',
                                );
                            }}
                        >
                            Fail next write / 下次写入失败
                        </Button>
                    </div>
                    <p className="demo-progress">
                        Session: {summary.authenticated ? 'example login' : 'signed out'} ·{' '}
                        {summary.online
                            ? 'simulated online'
                            : summary.scanned
                              ? 'scan detected'
                              : 'awaiting mock scan'}{' '}
                        · {summary.messages} sample messages
                    </p>
                    <p className="demo-notice" role="status">
                        {linkError || notice}
                    </p>
                    <p className="demo-limits">
                        No real login, delivery, rendering, notification, download or ban-risk
                        claim. Custom CSS is disabled. Backup imports accept only DEMO exports;
                        credential restoration is rejected.
                    </p>
                </aside>
            )}
            <Modal
                open={desktopOpen}
                onClose={() => setDesktopOpen(false)}
                title="DEMO QQ 桌面 / Mock desktop"
                description="No VNC, QR login, cookies or real QQ process. This is a practice control, not a physical desktop."
                maxWidth={512}
            >
                <div className="demo-desktop">
                    <Monitor size={44} aria-hidden="true" />
                    <strong>DEMO — NOT A QR CODE</strong>
                    <p>QQ 扫码练习 / Simulated scan</p>
                    <span>Account 10001 · DEMO 小光</span>
                </div>
                <Button
                    onClick={() => {
                        api.scan();
                        setDesktopOpen(false);
                        navigate('/processes');
                    }}
                >
                    Simulate scan / 模拟扫码
                </Button>
                <p className="text-xs text-muted-foreground">
                    Next: use 加载 on DEMO process 4242 in the real 进程 page. Local detection alone
                    is not a completed QQ login.
                </p>
            </Modal>
            {!guideOpen && linkError && (
                <div className="demo-link-alert" role="alert">
                    {linkError}
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setLinkError('')}
                        aria-label="Dismiss link warning"
                    >
                        ×
                    </Button>
                </div>
            )}
        </div>
    );
}
