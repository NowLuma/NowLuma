import '../index.css';
import { installDemoIsolation } from './isolation';
import { parseTutorialOptions } from './tutorial-options';
import { TUTORIAL_LESSONS, tutorialText } from './tutorial-lessons';

const options = parseTutorialOptions(window.location.search);
const isolation = installDemoIsolation(options);
const lesson = options.tutorial ? TUTORIAL_LESSONS[options.tutorial] : undefined;
document.documentElement.lang = options.lang === 'en' ? 'en' : 'zh-CN';

if (lesson) {
    document.title = `${tutorialText(lesson.title, options.lang)} · Nowluma`;
}

const root = document.getElementById('root')!;

void (async () => {
    const { DemoApi } = await import('./api');
    const api = new DemoApi();
    isolation.attach(api);

    if (lesson) {
        const token = api.resetTutorial(lesson.baseline);

        if (token) {
            isolation.local.setItem('nowluma_token', token);
        }

        window.history.replaceState(
            {},
            '',
            `${window.location.pathname}${window.location.search}#${lesson.steps[0].route}`,
        );
    }

    const [{ createRoot }, { DemoApp }, { prepareTargetAppearance }] = await Promise.all([
        import('react-dom/client'),
        import('./DemoApp'),
        import('@/appearance/runtime'),
    ]);
    await prepareTargetAppearance();
    createRoot(root).render(<DemoApp api={api} options={options} />);
})().catch((error: unknown) => {
    console.error('[Nowluma DEMO] Startup failed', error);
    root.textContent =
        'DEMO startup failed. No real API was contacted. Please refresh or inspect the console.';
});
