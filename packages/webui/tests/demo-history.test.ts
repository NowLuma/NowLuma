import { describe, expect, it } from 'vitest';
import { createDemoHistory } from '../src/demo/history';

function browserWindow(href: string): Window {
    const host = Object.assign(new EventTarget(), { location: new URL(href) });
    const history = {
        length: 1,
        state: null as unknown,
        replaceState(state: unknown, _title: string, url?: string | URL | null) {
            this.state = state;

            if (url != null) {
                host.location = new URL(url, host.location);
            }
        },
        pushState(state: unknown, title: string, url?: string | URL | null) {
            this.length += 1;
            this.replaceState(state, title, url);
        },
        back() {},
        forward() {},
        go() {},
    };
    return Object.assign(host, { history }) as unknown as Window;
}

describe('tutorial route history', () => {
    it.each(['storage', 'system', 'developer'])(
        'keeps %s separate from tutorial options across initial load and history events',
        (tab) => {
            const options = '?tutorial=data-backup&lang=en&embed=1';
            const host = browserWindow(
                `https://docs.example.invalid/Nowluma/demo/${options}#/settings?tab=${tab}`,
            );
            const history = createDemoHistory(host);

            try {
                expect(history.location.pathname).toBe('/settings');
                expect(history.location.search).toBe(`?tab=${tab}`);
                history.replace('/settings?tab=about');
                history.flush();
                expect(host.location.search).toBe(options);
                expect(host.location.hash).toBe('#/settings?tab=about');
                host.dispatchEvent(new Event('popstate'));
                expect(history.location.search).toBe('?tab=about');
                history.push('/logs');
                history.flush();
                host.dispatchEvent(new Event('popstate'));
                expect(history.location.pathname).toBe('/logs');
                expect(history.location.search).toBe('');
                expect(host.location.search).toBe(options);
            } finally {
                history.destroy();
            }
        },
    );
});
