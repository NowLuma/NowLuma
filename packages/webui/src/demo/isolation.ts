import { DEMO_AVATAR } from './constants';
import type { DemoApi } from './api';
import { parseTutorialOptions, tutorialSearch, type TutorialOptions } from './tutorial-options';

// Storage is isolated to this page's memory; reset and reload discard every
// simulated preference rather than reading credentials from real site storage.
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
export function installDemoIsolation(options: TutorialOptions = parseTutorialOptions(new URL(window.location.href).search)) {
    const local = memoryStorage();
    const session = memoryStorage();
    session.setItem('nowluma_safe_mode', '1');
    Object.defineProperty(window, 'localStorage', { configurable: true, value: local });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: session });
    let api: DemoApi | null = null;
    let navigate: ((route: string) => void) | undefined;
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

    const linkTarget = (event: MouseEvent) => {
        const anchor = event.target instanceof Element ? event.target.closest('a') : null;
        return anchor ? demoLinkTarget(anchor.href, window.location.href) : undefined;
    };

    // Block out-of-demo destinations before the app can handle the click.
    document.addEventListener(
        'click',
        (event) => {
            const target = linkTarget(event);

            if (target === 'desktop' || target === null) {
                event.preventDefault();
                event.stopPropagation();
                (target === 'desktop' ? openDesktop : blockedLink)();
            }
        },
        true,
    );

    // Router links handle navigation (and account selection) in React first.
    // Route unhandled console links through the same history, not location.hash.
    document.addEventListener('click', (event) => {
        if (event.defaultPrevented) {
            return;
        }

        const target = linkTarget(event);

        if (typeof target === 'string' && target !== 'desktop' && target !== 'download') {
            event.preventDefault();
            navigate?.(target);
        }
    });

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
    // Never forward secrets, selectors or arbitrary URLs into production boot.
    // Canonical safe chapter options survive refresh; unknown hash/search data does not.
    const url = new URL(window.location.href);
    const route = url.hash.startsWith('#/') ? url.hash.slice(1).split('?')[0] : '';
    let hash = DEMO_ROUTES.includes(route) ? `#${route}` : '';
    if (route === '/settings') {
        const tab = new URLSearchParams(url.hash.split('?')[1] ?? '').get('tab');
        if (tab && ['appearance', 'data', 'account', 'globalConfig', 'storage', 'notifications', 'system', 'advanced', 'developer', 'about'].includes(tab)) {
            hash += `?tab=${tab}`;
        }
    }
    const canonical = `${url.pathname}${tutorialSearch(options)}${hash}`;
    if (`${url.pathname}${url.search}${url.hash}` !== canonical) {
        window.history.replaceState({}, '', canonical);
    }

    return {
        local,
        session,
        attach: (instance: DemoApi) => {
            api = instance;
        },
        setNavigate: (handler: (route: string) => void) => {
            navigate = handler;
        },
    };
}
