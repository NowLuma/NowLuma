import { createBrowserHistory } from '@tanstack/react-router';

// Tutorial options belong to the document URL, never the console's route query.
// createHashHistory appends location.search to the hash before parsing it.
export function createDemoHistory(host: Window = window) {
    return createBrowserHistory({
        window: host,
        parseLocation: () => {
            const route = new URL(host.location.hash.slice(1) || '/', host.location.origin);
            return {
                href: `${route.pathname}${route.search}${route.hash}`,
                pathname: route.pathname,
                search: route.search,
                hash: route.hash,
                state: host.history.state,
            };
        },
        createHref: (href) => `${host.location.pathname}${host.location.search}#${href}`,
    });
}
