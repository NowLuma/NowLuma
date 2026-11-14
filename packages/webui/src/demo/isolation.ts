import { DEMO_AVATAR } from './constants';
import type { DemoApi } from './api';

export function memoryStorage(): Storage {
    const values = new Map<string, string>();
    return {
        get length() {
            return values.size;
        },
        clear: () => values.clear(),
        getItem: (key) => values.get(key) ?? null,
        key: (index) => [...values.keys()][index] ?? null,
        removeItem: (key) => {
            values.delete(key);
        },
        setItem: (key, value) => {
            values.set(String(key), String(value));
        },
    };
}

export const DEMO_ROUTES = [
    '/',
    '/processes',
    '/config',
    '/debug',
    '/logs',
    '/settings',
    '/onboarding',
];

export function demoLinkTarget(
    href: string,
    currentUrl: string,
): 'desktop' | 'download' | string | null {
    if (href.startsWith('blob:')) {
        return 'download';
    }

    let current: URL;
    let target: URL;

    try {
        current = new URL(currentUrl);
        target = new URL(href, current);
    } catch {
        return null;
    }

    if (target.origin !== current.origin) {
        return null;
    }

    if (target.hash === '#desktop' || target.pathname.startsWith('/desktop/')) {
        return 'desktop';
    }

    const route = target.hash.startsWith('#/')
        ? target.hash.slice(1)
        : target.pathname + target.search;

    if (DEMO_ROUTES.includes(route.split('?')[0])) {
        return route;
    }

    return null;
}

// Install before importing App: production contexts also access storage/fetch directly.
export function installDemoIsolation() {
    const local = memoryStorage();
    const session = memoryStorage();
    session.setItem('nowluma_safe_mode', '1');
    Object.defineProperty(window, 'localStorage', { configurable: true, value: local });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: session });
    let api: DemoApi | null = null;
    window.fetch = (...args) =>
        api
            ? api.fetch(...args)
            : Promise.resolve(
                  new Response(JSON.stringify({ message: 'DEMO: API not ready' }), { status: 503 }),
              );
    const blockedTransport = class {
        constructor() {
            throw new Error('DEMO: Real network transport is disabled');
        }
    };
    window.XMLHttpRequest = blockedTransport as unknown as typeof XMLHttpRequest;
    window.WebSocket = blockedTransport as unknown as typeof WebSocket;
    window.EventSource = blockedTransport as unknown as typeof EventSource;
    navigator.sendBeacon = () => false;

    const openDesktop = () => window.dispatchEvent(new Event('nowluma-demo-desktop'));
    const blockedLink = () => window.dispatchEvent(new Event('nowluma-demo-blocked-link'));

    window.open = (url) => {
        if (url && demoLinkTarget(String(url), window.location.href) === 'desktop') {
            openDesktop();
        } else {
            blockedLink();
        }

        return null;
    };

    document.addEventListener(
        'click',
        (event) => {
            const anchor = event.target instanceof Element ? event.target.closest('a') : null;

            if (!anchor) {
                return;
            }

            const target = demoLinkTarget(anchor.href, window.location.href);

            if (target === 'download') {
                return;
            }

            event.preventDefault();

            if (target === 'desktop') {
                event.stopPropagation();
                openDesktop();
            } else if (target === null) {
                event.stopPropagation();
                blockedLink();
            } else {
                window.location.hash = target;
            }
        },
        true,
    );

    // React sets src via setAttribute; rewrite before the browser can request root avatars.
    const setAttribute = Element.prototype.setAttribute;

    Element.prototype.setAttribute = function (name, value) {
        if (
            this instanceof HTMLImageElement &&
            name.toLowerCase() === 'src' &&
            !value.startsWith('data:') &&
            !value.startsWith('blob:')
        ) {
            value = DEMO_AVATAR;
        }

        setAttribute.call(this, name, value);
    };

    const observer = new MutationObserver(() => {
        for (const image of document.querySelectorAll('img')) {
            if (!image.src.startsWith('data:') && !image.src.startsWith('blob:')) {
                image.src = DEMO_AVATAR;
            }
        }

        for (const element of document.querySelectorAll<HTMLElement>('[style]')) {
            if (element.style.backgroundImage.includes('/ui-asset/background')) {
                element.style.backgroundImage = api?.backgroundUrl
                    ? `url("${api.backgroundUrl}")`
                    : 'none';
            }
        }
    });
    observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['src', 'style'],
    });
    // A real password in a URL must never be forwarded, even to the fake login exercise.
    const url = new URL(window.location.href);

    if (url.search) {
        window.history.replaceState({}, '', `${url.pathname}${url.hash}`);
    }

    return {
        local,
        session,
        attach: (instance: DemoApi) => {
            api = instance;
        },
    };
}
