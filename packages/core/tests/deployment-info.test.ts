import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { RuntimeConfig } from '@nowluma/common/runtime';
import { deploymentInfo } from '../src/webui/deployment-info';
import { registerSystemRoutes } from '../src/webui/system-routes';

/** process.platform is a configurable data property; always restore the host value. */
async function onPlatform<T>(platform: NodeJS.Platform, run: () => T | Promise<T>): Promise<T> {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { ...original, value: platform });

    try {
        return await run();
    } finally {
        Object.defineProperty(process, 'platform', original);
    }
}

function systemRoute(desktopEnabled: boolean) {
    const app = new Hono();
    registerSystemRoutes(app, { getBoundPort: () => 5099, desktopEnabled });
    return app;
}

async function systemBody(app: Hono) {
    return (await (await app.request('/api/system')).json()) as {
        deployment: { desktopAvailable: boolean };
    };
}

describe('deployment desktop capability', () => {
    it('never reports the integrated gateway on a Windows server, even when enabled', async () => {
        const configured = { vncPort: 6080, vncUrl: 'https://desk.example' } as RuntimeConfig;
        expect(
            (await onPlatform('win32', () => deploymentInfo(configured, true))).desktopAvailable,
        ).toBe(false);
        expect(
            (await onPlatform('win32', () => deploymentInfo(configured, false))).desktopAvailable,
        ).toBe(false);
    });

    it('reports the gateway only when the Linux server applied it, not from persisted settings', async () => {
        const configured = { vncPort: 6080, vncUrl: 'https://desk.example' } as RuntimeConfig;
        expect((await onPlatform('linux', () => deploymentInfo({}, true))).desktopAvailable).toBe(
            true,
        );
        expect(
            (await onPlatform('linux', () => deploymentInfo(configured, false))).desktopAvailable,
        ).toBe(false);
    });

    it('does not turn malformed settings into an available desktop', async () => {
        const malformed = {
            vncPort: 0,
            vncUrl: 'https://user:pass@example.test/?access_token=secret',
        } as RuntimeConfig;
        const info = await onPlatform('win32', () => deploymentInfo(malformed, false));
        expect(info.desktopAvailable).toBe(false);
        expect(info.desktopAvailable).toBeTypeOf('boolean');
    });
});

describe('GET /api/system deployment capability', () => {
    it('serves the applied gateway fact supplied by the server', async () => {
        expect(
            (await onPlatform('linux', async () => systemBody(systemRoute(true)))).deployment
                .desktopAvailable,
        ).toBe(true);
    });

    it('keeps the desktop unavailable when the server did not enable the gateway', async () => {
        expect(
            (await onPlatform('linux', async () => systemBody(systemRoute(false)))).deployment
                .desktopAvailable,
        ).toBe(false);
    });
});
