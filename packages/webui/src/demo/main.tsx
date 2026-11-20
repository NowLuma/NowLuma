import '../index.css';
import { installDemoIsolation } from './isolation';

const isolation = installDemoIsolation();
const root = document.getElementById('root')!;

void (async () => {
    const { DemoApi } = await import('./api');
    const api = new DemoApi();
    isolation.attach(api);
    const [{ createRoot }, { DemoApp }, { prepareTargetAppearance }] = await Promise.all([
        import('react-dom/client'),
        import('./DemoApp'),
        import('@/appearance/runtime'),
    ]);
    await prepareTargetAppearance();
    createRoot(root).render(<DemoApp api={api} />);
})().catch((error: unknown) => {
    console.error('[Nowluma DEMO] Startup failed', error);
    root.textContent =
        'DEMO startup failed. No real API was contacted. Please refresh or inspect the console.';
});
