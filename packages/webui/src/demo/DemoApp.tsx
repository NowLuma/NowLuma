import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { BookOpen, Monitor, RotateCcw, X } from 'lucide-react';
import App from '@/App';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/interior/modal';
import { createApiClient } from '@/lib/api';
import { appRouter } from '@/router';
import { DEMO_JOURNEY } from './journey';
import type { DemoApi, DemoScenario } from './api';
import { TutorialGuide } from './TutorialGuide';
import { TUTORIAL_LESSONS, tutorialText } from './tutorial-lessons';
import type { TutorialOptions } from './tutorial-options';
import './demo.css';

export function DemoApp({ api, options }: { api: DemoApi; options?: TutorialOptions }) {
    const lesson = options?.tutorial ? TUTORIAL_LESSONS[options.tutorial] : undefined;
    const embedded =
        lesson && options?.embed && typeof window !== 'undefined' && window.parent !== window;
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

    useEffect(() => {
        const console = document.querySelector<HTMLElement>('.demo-console');

        if (!console || !lesson) {
            return;
        }

        const observer = new ResizeObserver(([entry]) => {
            console.style.setProperty(
                '--workspace-viewport-height',
                `${entry.contentRect.height}px`,
            );
        });
        observer.observe(console);
        return () => observer.disconnect();
    }, [lesson]);

    const reset = () => {
        if (!lesson) {
            api.reset();
        }

        localStorage.clear();
        sessionStorage.clear();
        sessionStorage.setItem('nowluma_safe_mode', '1');

        if (lesson) {
            const token = api.resetTutorial(lesson.baseline);

            if (token) {
                localStorage.setItem('nowluma_token', token);
            }
        }

        appRouter.history.replace(lesson?.steps[0].route ?? '/');
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
        <div
            className={`demo-shell${lesson ? ' demo-tutorial' : ''}`}
            data-tutorial={lesson?.id}
            data-embed={embedded ? 'true' : undefined}
        >
            <header className="demo-banner" aria-label="Nowluma">
                <div className="demo-banner-label">
                    <strong>
                        {lesson ? tutorialText(lesson.title, options?.lang ?? 'zh') : 'Nowluma'}
                    </strong>
                    <span>{options?.lang === 'en' ? 'Sample data' : '示例数据'}</span>
                </div>
                <div className="demo-banner-actions">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setGuideOpen((open) => !open)}
                        data-demo-guide-toggle="true"
                        aria-expanded={guideOpen}
                        aria-controls="demo-guide"
                    >
                        <BookOpen size={15} />{' '}
                        {embedded ? (options?.lang === 'en' ? 'Guide' : '引导') : 'Guide / 引导'}
                    </Button>
                    {!embedded && (
                        <Button variant="outline" size="sm" onClick={reset}>
                            <RotateCcw size={15} /> Reset / 重置
                        </Button>
                    )}
                </div>
            </header>
            {lesson && (
                <TutorialGuide
                    key={epoch}
                    api={api}
                    lesson={lesson}
                    language={options?.lang ?? 'zh'}
                    open={guideOpen}
                    onClose={() => {
                        setGuideOpen(false);
                        document.querySelector<HTMLElement>('[data-demo-guide-toggle]')?.focus();
                    }}
                    onRestart={reset}
                    onNavigate={(route) => appRouter.history.push(route)}
                />
            )}
            <div className="demo-console">
                <App key={epoch} client={client} />
            </div>
            {!lesson && guideOpen && (
                <aside id="demo-guide" className="demo-guide" aria-label="Console guide / 操作引导">
                    <div className="demo-guide-heading">
                        <div>
                            <h2>操作引导 / Console guide</h2>
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
                        {step.id === 'setup' && (
                            <p>
                                访问密码 <code>{api.examplePassword}</code>；新密码{' '}
                                <code>DemoChanged!2026</code>。
                            </p>
                        )}
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
                                    'DEMO: 下一次非认证写入会失败且不改变内存；检查后可重试。Next non-auth write fails without changing memory.',
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
                            : summary.stopped
                              ? 'manual stop / 已停止'
                              : summary.scanned
                                ? 'scan detected'
                                : 'awaiting mock scan'}{' '}
                        · {summary.messages} sample messages
                    </p>
                    <p className="demo-notice" role="status">
                        {linkError || notice}
                    </p>
                </aside>
            )}
            <Modal
                open={desktopOpen}
                onClose={() => setDesktopOpen(false)}
                title="QQ 桌面示例 / Desktop example"
                description="选择下方操作以识别示例账号 10001。"
                maxWidth={512}
            >
                <div className="demo-desktop">
                    <Monitor size={44} aria-hidden="true" />
                    <strong>QQ 桌面示例 / Desktop example</strong>
                    <p>账号识别 / Account detection</p>
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
                    下一步：在进程页对 4242 点「加载」，再完成此账号的内核选择。
                </p>
            </Modal>
            {(lesson || !guideOpen) && linkError && (
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
