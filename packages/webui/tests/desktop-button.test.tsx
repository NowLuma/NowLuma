import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SystemInfo } from '../src/types';

type Deployment = NonNullable<SystemInfo['deployment']>;

const state = vi.hoisted(() => ({
    systemInfo: null as { deployment?: Deployment } | null,
}));

vi.mock('@/contexts/AppStateContext', () => ({
    useAppState: () => ({ systemInfo: state.systemInfo }),
}));

const { DesktopButton } = await import('../src/components/desktop-button');

function deployment(over: Partial<Deployment> = {}): Deployment {
    return {
        mode: 'native',
        workingDirectory: '/app',
        home: '/home/nowluma',
        uid: 1000,
        directories: {
            config: '/app/config',
            data: '/app/data',
            logs: '/app/logs',
            qq: '/home/nowluma/QQ',
        },
        writable: { config: true, data: true, logs: true, qq: true },
        vncPort: 0,
        vncUrl: '',
        ...over,
    };
}

function render(over: Partial<Deployment> = {}, browserPlatform = 'Win32'): string {
    state.systemInfo = { deployment: deployment(over) };
    vi.stubGlobal('navigator', { platform: browserPlatform });
    return renderToStaticMarkup(<DesktopButton />);
}

afterEach(() => vi.unstubAllGlobals());

describe('DesktopButton capability', () => {
    it('hides a native Windows server even with a configured external VNC URL', () => {
        for (const browserPlatform of ['Win32', 'Linux x86_64']) {
            expect(
                render(
                    { mode: 'native', vncPort: 6080, vncUrl: 'https://desk.example' },
                    browserPlatform,
                ),
            ).toBe('');
        }
    });

    it('links the same-origin gateway when the Linux server reports it applied', () => {
        const html = render({
            mode: 'docker',
            desktopAvailable: true,
            vncPort: 6080,
            vncUrl: 'https://external.invalid/vnc.html?password=secret',
        });

        expect(html).toContain('href="/desktop/"');
        expect(html).not.toContain('external.invalid');
        expect(html).not.toContain('secret');
        expect(html).not.toContain('6080');
    });

    it('stays hidden when the server gateway is disabled despite configured VNC settings', () => {
        expect(
            render({
                mode: 'docker',
                desktopAvailable: false,
                vncPort: 6080,
                vncUrl: '/desktop/',
            }),
        ).toBe('');
    });

    it('stays hidden for an older server that does not report the capability', () => {
        expect(render({ mode: 'docker', vncPort: 0, vncUrl: '/desktop/' })).toBe('');
    });
});
