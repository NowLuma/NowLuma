import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowRight, BookOpen, ChevronUp, Monitor, RotateCcw, X } from 'lucide-react';
import App from '@/App';
import { BRAND_LOGO_URL } from '@/brand';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/interior/modal';
import { useMediaQuery } from '@/hooks/use-media-query';
import { createApiClient } from '@/lib/api';
import { appRouter } from '@/router';
import { translator, useLocale } from '@/i18n';
import { APP_NAME } from '@/types';
import { DEMO_NEW_PASSWORD } from './constants';
import { DEMO_JOURNEY } from './journey';
import type { DemoApi, DemoScenario } from './api';
import { TutorialGuide } from './TutorialGuide';
import { TUTORIAL_LESSONS, tutorialText } from './tutorial-lessons';
import type { TutorialOptions } from './tutorial-options';
import './demo.css';

export function DemoApp({ api, options }: { api: DemoApi; options?: TutorialOptions }) {
    const { language } = useLocale();
    const t = translator(language);
    const lesson = options?.tutorial ? TUTORIAL_LESSONS[options.tutorial] : undefined;
    const embedded =
        lesson && options?.embed && typeof window !== 'undefined' && window.parent !== window;
    const [epoch, setEpoch] = useState(0);
    const compactGuide = useMediaQuery('(max-width: 680px), (max-height: 640px)');
    const [guideOverride, setGuideOverride] = useState<boolean | null>(null);
    const guideOpen = guideOverride ?? (Boolean(lesson) || !compactGuide);
    const [desktopOpen, setDesktopOpen] = useState(false);
    const [selectedStep, setSelectedStep] = useState(0);
    const [noticeKind, setNoticeKind] = useState<'blocked-link' | 'fail-next-write' | null>(null);
    const guideToggle = useRef<HTMLButtonElement>(null);
    useSyncExternalStore(api.subscribe, () => api.tutorialRevision, () => api.tutorialRevision);
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
        const blocked = () => setNoticeKind('blocked-link');
        window.addEventListener('nowluma-demo-desktop', desktop);
        window.addEventListener('nowluma-demo-blocked-link', blocked);

        return () => {
            window.removeEventListener('nowluma-demo-desktop', desktop);
            window.removeEventListener('nowluma-demo-blocked-link', blocked);
        };
    }, []);

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
        setNoticeKind(null);
        setDesktopOpen(false);
        setGuideOverride(null);
    };

    const closeGuide = () => {
        setGuideOverride(false);
        guideToggle.current?.focus();
    };

    const navigate = (route: string) => {
        appRouter.history.push(route);
        setGuideOverride(false);
        requestAnimationFrame(() => {
            const main = document.querySelector<HTMLElement>('main');
            main?.setAttribute('tabindex', '-1');
            (main ?? document.querySelector<HTMLElement>('input[type="password"]'))?.focus();
        });
    };

    const summary = api.summary;
    const step = DEMO_JOURNEY[selectedStep];
    const title = lesson ? tutorialText(lesson.title, language) : APP_NAME;
    const noticeText =
        noticeKind === 'blocked-link'
            ? t(
                  '请在模拟器中打开控制台页面。',
                  'Choose a console page in the simulator.',
              )
            : noticeKind === 'fail-next-write' && api.failNextMutation
              ? t(
                    '已安排一次保存失败。保存任一设置即可查看反馈。',
                    'Save a setting to see a simulated failure.',
                )
              : null;

    return (
        <div
            className={`demo-shell${lesson ? ' demo-tutorial' : ''}`}
            data-tutorial={lesson?.id}
            data-embed={embedded ? 'true' : undefined}
        >
            <header className="demo-banner" aria-label={APP_NAME}>
                <div className="demo-banner-inner">
                    <div className="demo-banner-title">
                        <img src={BRAND_LOGO_URL} alt="" width={28} height={28} />
                        <div>
                            <div className="demo-banner-caption">
                                {t('模拟器 · 示例数据', 'Simulator · Sample data')}
                            </div>
                            <h1 title={title}>{title}</h1>
                        </div>
                    </div>
                    <div className="demo-banner-actions">
                        <button
                            ref={guideToggle}
                            type="button"
                            className="demo-button demo-guide-toggle"
                            onClick={() => setGuideOverride(!guideOpen)}
                            data-demo-guide-toggle="true"
                            aria-expanded={guideOpen}
                            aria-controls={guideOpen ? 'demo-guide' : undefined}
                        >
                            <BookOpen aria-hidden="true" /> {t('引导', 'Guide')}
                        </button>
                        {!embedded && (
                            <button
                                type="button"
                                className="demo-button"
                                onClick={reset}
                                aria-label={t('重置', 'Reset')}
                                title={t('重置', 'Reset')}
                            >
                                <RotateCcw aria-hidden="true" />
                                <span className={lesson ? 'demo-wide-label' : undefined}>
                                    {t('重置', 'Reset')}
                                </span>
                            </button>
                        )}
                    </div>
                </div>
            </header>
            {!lesson && !guideOpen && !summary.authenticated && (
                <p className="demo-sample-password">
                    {t('示例密码', 'Sample password')} <code>{api.examplePassword}</code>
                </p>
            )}
            {lesson && (
                <TutorialGuide
                    key={epoch}
                    api={api}
                    lesson={lesson}
                    language={language}
                    open={guideOpen}
                    onNavigate={(route) => appRouter.history.push(route)}
                />
            )}
            {!lesson && guideOpen && (
                <aside
                    id="demo-guide"
                    className="demo-guide ui-glass-raised"
                    aria-label={t('练习任务', 'Practice tasks')}
                >
                    <div className="demo-guide-heading">
                        <div>
                            <h2>{t('练习任务', 'Practice tasks')}</h2>
                        </div>
                        <button
                            type="button"
                            className="demo-button demo-icon-button"
                            onClick={closeGuide}
                            aria-label={t('收起引导', 'Close guide')}
                            title={t('收起引导', 'Close guide')}
                        >
                            <ChevronUp aria-hidden="true" />
                        </button>
                    </div>
                    <nav className="demo-steps" aria-label={t('练习步骤', 'Practice steps')}>
                        {DEMO_JOURNEY.map((item, index) => (
                            <button
                                key={item.id}
                                type="button"
                                aria-current={selectedStep === index ? 'step' : undefined}
                                onClick={() => setSelectedStep(index)}
                            >
                                {index + 1} · {tutorialText(item.title, language)}
                            </button>
                        ))}
                    </nav>
                    <section key={step.id} className="demo-step-detail" aria-labelledby="demo-step-title">
                        <h3 id="demo-step-title">{tutorialText(step.title, language)}</h3>
                        <p>{tutorialText(step.description, language)}</p>
                        {step.id === 'setup' && (
                            <p>
                                {t('访问密码：', 'Access password: ')}
                                <code>{api.examplePassword}</code>
                                {t('；新密码：', '; new password: ')}
                                <code>{DEMO_NEW_PASSWORD}</code>
                            </p>
                        )}
                        <p className="demo-control-label">
                            {t('界面控件：', 'Controls: ')}
                            <strong>{tutorialText(step.control, language)}</strong>
                        </p>
                        <button
                            type="button"
                            className="demo-button demo-primary-button"
                            onClick={() => navigate(step.route)}
                        >
                            {t('打开操作页', 'Open page')} <ArrowRight aria-hidden="true" />
                        </button>
                        {step.id === 'desktop' && (
                            <button
                                type="button"
                                className="demo-button"
                                onClick={() => setDesktopOpen(true)}
                            >
                                <Monitor aria-hidden="true" />{' '}
                                {t('打开模拟桌面', 'Open mock desktop')}
                            </button>
                        )}
                    </section>
                    <div className="demo-scenarios">
                        <label htmlFor="demo-scenario">{t('练习场景', 'Practice scenario')}</label>
                        <select
                            id="demo-scenario"
                            value={api.scenario}
                            onChange={(event) =>
                                event.target.value === 'setup'
                                    ? reset()
                                    : api.setScenario(event.target.value as DemoScenario)
                            }
                        >
                            <option value="setup">{t('首次设置', 'First setup')}</option>
                            <option value="ready">{t('在线示例', 'Ready account')}</option>
                            <option value="offline">{t('离线', 'Account offline')}</option>
                            <option value="failure">{t('接口错误', 'API failure')}</option>
                        </select>
                        <button
                            type="button"
                            className="demo-button"
                            onClick={() => {
                                api.failNextMutation = true;
                                setNoticeKind('fail-next-write');
                            }}
                        >
                            {t('模拟一次保存失败', 'Simulate a failed save')}
                        </button>
                    </div>
                    <p className="demo-progress">
                        {t('会话：', 'Session: ')}
                        {summary.authenticated
                            ? t('已登录', 'Signed in')
                            : t('未登录', 'Signed out')}{' '}
                        ·{' '}
                        {summary.online
                            ? t('模拟在线', 'Simulated online')
                            : summary.stopped
                              ? t('已手动停止', 'Manually stopped')
                              : summary.scanned
                                ? t('已识别示例账号', 'Sample account detected')
                                : t('等待模拟扫码', 'Awaiting mock scan')}{' '}
                        ·{' '}
                        {t(
                            `${summary.messages} 条示例消息`,
                            `${summary.messages} sample ${summary.messages === 1 ? 'message' : 'messages'}`,
                        )}
                    </p>
                    <p className="demo-notice" role="status">
                        {noticeText ?? tutorialText(api.notice, language)}
                    </p>
                </aside>
            )}
            {(lesson || !guideOpen) && noticeText && (
                <div className="demo-link-alert">
                    <p role="alert">{noticeText}</p>
                    <button
                        type="button"
                        className="demo-button demo-icon-button"
                        onClick={() => {
                            setNoticeKind(null);
                            guideToggle.current?.focus();
                        }}
                        aria-label={t('关闭提示', 'Dismiss notice')}
                    >
                        <X aria-hidden="true" />
                    </button>
                </div>
            )}
            <div className="demo-console">
                <App key={epoch} client={client} autoFocusPassword={!embedded} />
            </div>
            <Modal
                open={desktopOpen}
                onClose={() => setDesktopOpen(false)}
                title={t('QQ 桌面示例', 'QQ desktop example')}
                description={t(
                    '选择下方操作以识别示例账号 10001。',
                    'Use the control below to detect sample account 10001.',
                )}
                maxWidth={512}
            >
                <div className="demo-desktop">
                    <Monitor size={44} aria-hidden="true" />
                    <strong>{t('QQ 桌面示例', 'QQ desktop example')}</strong>
                    <p>{t('账号识别', 'Account detection')}</p>
                    <span>{t('账号', 'Account')} 10001 · DEMO 小光</span>
                </div>
                <Button
                    onClick={() => {
                        api.scan();
                        setDesktopOpen(false);
                        navigate('/processes');
                    }}
                >
                    {t('模拟扫码', 'Simulate scan')}
                </Button>
                <p className="text-xs text-muted-foreground">
                    {t(
                        '下一步：在进程页对 4242 点「加载」，再完成此账号的内核选择。',
                        'Next: choose Load for process 4242, then confirm the kernel choice for this account.',
                    )}
                </p>
            </Modal>
        </div>
    );
}
