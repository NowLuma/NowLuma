import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { desktopLink, normalizeVncUrl } from '@nowluma/common/desktop-url';
import { DemoApi } from '../src/demo/api';
import {
    DEMO_DESKTOP_URL,
    DEMO_NEW_PASSWORD,
    DEMO_PASSWORD,
    DEMO_PID,
    DEMO_UIN,
} from '../src/demo/constants';
import { demoSystem, demoSystemSettings } from '../src/demo/fixtures';
import { demoLinkTarget } from '../src/demo/isolation';
import { createApiClient } from '../src/lib/api/client';
import type { ApiClient } from '../src/lib/api/types';
import { persistAppearance } from '../src/appearance/persistence';

let api: DemoApi;
let client: ApiClient;
let token: string | null;

beforeEach(() => {
    api = new DemoApi();
    token = null;
    vi.stubGlobal('fetch', api.fetch);
    client = createApiClient({
        tokenStore: {
            load: () => token,
            save: (value) => {
                token = value;
            },
        },
    });
});
afterEach(() => {
    vi.restoreAllMocks();
    api.reset();
    vi.unstubAllGlobals();
});

async function setup() {
    expect(await client.login(DEMO_PASSWORD)).toEqual({ ok: true, mustChangePassword: true });
    const agreements = await client.agreements.get();
    expect(agreements.consentRequired).toBe(true);
    expect(await client.agreements.recordConsent(agreements.version)).toEqual({
        success: true,
        message: undefined,
        currentVersion: undefined,
    });
    expect(await client.changePassword(DEMO_PASSWORD, DEMO_NEW_PASSWORD)).toEqual({
        success: true,
        message: undefined,
    });
}

async function chooseCompat() {
    const catalog = await client.kernel.catalog();
    return client.kernel.save(DEMO_UIN, {
        kernel: 'compat',
        riskAccepted: true,
        riskVersion: catalog.riskVersion,
    });
}

async function ready() {
    await setup();
    api.scan();
    await chooseCompat();
    await client.processes.load(DEMO_PID);
}

describe('DEMO API guided journey using the production client', () => {
    it('exposes only the kernel catalog before login, instructions and password gates clear', async () => {
        const assertPrivateBlocked = async (status: number) => {
            expect((await client.kernel.catalog()).options).toMatchObject([
                { id: 'compat', available: true },
                { id: 'rewrite', available: false },
            ]);
            await expect(client.kernel.get(DEMO_UIN)).rejects.toMatchObject({ status });
        };

        await assertPrivateBlocked(401);
        await client.login(DEMO_PASSWORD);
        await assertPrivateBlocked(403);
        const agreements = await client.agreements.get();
        await client.agreements.recordConsent(agreements.version);
        await assertPrivateBlocked(403);
        await client.changePassword(DEMO_PASSWORD, DEMO_NEW_PASSWORD);
        expect((await client.kernel.get(DEMO_UIN)).canLoad).toBe(false);
    });

    it('never creates a kernel acknowledgment in Ready and restores only an explicit current account choice', async () => {
        api.setScenario('ready');
        await client.login(DEMO_PASSWORD);
        expect(api.summary).toMatchObject({
            consent: true,
            mustChange: false,
            scanned: true,
            online: false,
        });
        expect((await client.processes.list())[0]).toMatchObject({
            injected: false,
            status: 'available',
            account: { uin: DEMO_UIN },
        });
        expect((await client.kernel.get(DEMO_UIN)).selection).toBeNull();
        const catalog = await client.kernel.catalog();
        await expect(
            client.kernel.save(DEMO_UIN, {
                kernel: 'compat',
                riskAccepted: false,
                riskVersion: catalog.riskVersion,
            }),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            client.kernel.save(DEMO_UIN, {
                kernel: 'rewrite',
                riskAccepted: true,
                riskVersion: catalog.riskVersion,
            }),
        ).rejects.toMatchObject({ status: 409 });
        await expect(
            client.kernel.save(DEMO_UIN, {
                kernel: 'compat',
                riskAccepted: true,
                riskVersion: 'old',
            }),
        ).rejects.toMatchObject({ status: 409 });
        await expect(client.kernel.get('20002')).rejects.toMatchObject({ status: 400 });
        expect((await client.kernel.get(DEMO_UIN)).selection).toBeNull();
        await expect(client.processes.refresh(DEMO_PID)).rejects.toMatchObject({ status: 409 });
        expect((await client.processes.unload(DEMO_PID)).success).toBe(true);
        api.failNextMutation = true;
        await expect(chooseCompat()).rejects.toMatchObject({ status: 500 });
        expect((await client.kernel.get(DEMO_UIN)).selection).toBeNull();
        await chooseCompat();
        expect(api.summary.online).toBe(false);
        api.setScenario('ready');
        expect(api.summary.online).toBe(true);
        api.reset();
        api.setScenario('ready');
        await client.login(DEMO_PASSWORD);
        expect(api.summary.online).toBe(false);
        expect((await client.kernel.get(DEMO_UIN)).selection).toBeNull();
    });

    it('reset and abort discard kernel saves that are still parsing', async () => {
        await setup();
        const catalog = await client.kernel.catalog();
        const body = JSON.stringify({
            kernel: 'compat',
            riskAccepted: true,
            riskVersion: catalog.riskVersion,
        });
        const pending = api.fetch(`/api/kernel/accounts/${DEMO_UIN}`, {
            method: 'POST',
            body,
            headers: { 'X-Nowluma-Token': token! },
        });
        api.reset();
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        await setup();
        expect((await client.kernel.get(DEMO_UIN)).selection).toBeNull();
        const abort = new AbortController();
        const cancelled = api.fetch(`/api/kernel/accounts/${DEMO_UIN}`, {
            method: 'POST',
            body,
            signal: abort.signal,
            headers: { 'X-Nowluma-Token': token! },
        });
        abort.abort();
        await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
        expect((await client.kernel.get(DEMO_UIN)).selection).toBeNull();
    });

    it('requires example login, consent, password rotation, mock scan, kernel confirmation and explicit load', async () => {
        expect(await client.status()).toBe(false);
        expect(await client.login('not-a-demo-password')).toMatchObject({
            ok: false,
            message: expect.stringContaining('Never enter a real password'),
        });
        await setup();
        await expect(client.processes.load(DEMO_PID)).rejects.toThrow('simulate a scan first');
        api.scan();
        expect(api.summary.online).toBe(false);
        expect((await client.kernel.get(DEMO_UIN)).selection).toBeNull();
        await expect(client.processes.load(DEMO_PID)).rejects.toMatchObject({ status: 409 });
        await chooseCompat();
        expect(api.summary.online).toBe(false);
        expect((await client.processes.load(DEMO_PID)).process?.status).toBe('online');
        expect(await client.qqList()).toEqual([{ uin: DEMO_UIN, nickname: 'DEMO 小光' }]);
        expect((await client.connections())[0].adapters[0]).toMatchObject({
            status: 'ok',
            detail: expect.stringContaining('no socket'),
        });
    });

    it('keeps an explicit unload manually stopped until an explicit load', async () => {
        await ready();
        const stopped = await client.processes.unload(DEMO_PID);
        expect(stopped.process).toMatchObject({
            injected: false,
            connected: false,
            loggedIn: false,
            status: 'available',
            manualStopped: true,
        });
        expect(api.summary).toMatchObject({ online: false, stopped: true });
        expect((await client.processes.list())[0]).toMatchObject({ manualStopped: true });
        expect((await client.processes.refresh(DEMO_PID)).process).toMatchObject({
            status: 'available',
            manualStopped: true,
        });
        expect((await client.processes.load(DEMO_PID)).process).toMatchObject({
            status: 'online',
            manualStopped: false,
        });
        expect(api.summary).toMatchObject({ online: true, stopped: false });
        api.setScenario('ready');
        expect((await client.processes.list())[0]).toMatchObject({
            status: 'online',
            manualStopped: false,
        });
    });

    it('settles the real first-run appearance save without changing layout and preserves a rejected later write', async () => {
        await setup();
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => (key === 'nowluma_token' ? token : null),
        });
        const before = await client.ui.get();
        const selected = {
            ...before.appearance,
            disableMotion: true,
            performanceMode: 'low' as const,
        };
        await persistAppearance(selected);
        const saved = await client.ui.get();
        expect(saved.appearance).toEqual(selected);
        expect(saved.layout).toEqual(before.layout);

        api.failNextMutation = true;
        await expect(persistAppearance({ ...selected, disableMotion: false })).rejects.toThrow(
            'Simulated write failure',
        );
        expect((await client.ui.get()).appearance).toEqual(selected);
    });

    it('does not apply config while offline, but preserves the desired in-memory save', async () => {
        await ready();
        api.setScenario('offline');
        const config = await client.config.get(DEMO_UIN);
        config.statusCommand.trigger = '#demo';
        const result = await client.config.save(DEMO_UIN, config);
        expect(result).toMatchObject({ saved: true, applied: false, online: false, errors: [] });
        expect((await client.config.get(DEMO_UIN)).statusCommand.trigger).toBe('#demo');
        await expect(client.debug.invoke(DEMO_UIN, 'get_login_info', {})).rejects.toThrow(
            'Account offline',
        );
    });

    it('has real read-only actions and mutates messages only in memory, including #nl', async () => {
        await ready();
        const catalog = await client.debug.actions();
        expect(catalog.actions).toHaveLength(9);
        expect(catalog.actions.filter((action) => action.readOnly).length).toBe(5);
        expect((await client.debug.invoke(DEMO_UIN, 'get_login_info', {})).data).toEqual({
            user_id: 10001,
            nickname: 'DEMO 小光',
        });
        expect((await client.debug.invoke(DEMO_UIN, 'get_friend_list', {})).data).toEqual([
            { user_id: 10002, nickname: 'DEMO friend', remark: 'DEMO contact' },
        ]);
        expect((await client.debug.invoke(DEMO_UIN, 'get_group_list', {})).status).toBe('ok');
        const sent = await client.debug.invoke(DEMO_UIN, 'send_private_msg', {
            user_id: 10002,
            message: '#nl',
        });
        expect(sent.data).toEqual({ message_id: 101 });
        expect(
            (await client.debug.invoke(DEMO_UIN, 'get_msg', { message_id: 101 })).data,
        ).toMatchObject({ message: '#nl' });
        expect((await client.logs.list()).at(-1)?.message).toContain('not proof of QQ delivery');
        expect(await client.debug.invoke(DEMO_UIN, 'unknown-action', {})).toMatchObject({
            status: 'failed',
            retcode: 1404,
        });
        expect(
            await client.debug.invoke(DEMO_UIN, 'send_private_msg', { user_id: 99, message: '' }),
        ).toMatchObject({ status: 'failed' });
        expect(api.summary.messages).toBe(2);
    });

    it('supports the actual visual composer group/forward routes and text-segment #nl', async () => {
        await ready();

        for (const action of [
            'send_group_msg',
            'send_group_forward_msg',
            'send_private_forward_msg',
        ]) {
            const params = action.includes('group') ? { group_id: 20001 } : { user_id: 10002 };
            const result = await client.debug.invoke(DEMO_UIN, action, {
                ...params,
                [action.includes('forward') ? 'messages' : 'message']: [
                    { type: 'text', data: { text: '#nl' } },
                ],
            });
            expect(result.status).toBe('ok');
            const message = await client.debug.invoke(DEMO_UIN, 'get_msg', {
                message_id: (result.data as { message_id: number }).message_id,
            });
            expect(message.data).toMatchObject({
                message: [{ type: 'text', data: { text: '#nl' } }],
            });
        }

        expect((await client.logs.list()).at(-1)?.message).toContain('#nl DEMO reply');
    });

    it('surfaces a failed write without mutation, allows retry, and exposes API failure', async () => {
        await ready();
        const original = await client.config.get(DEMO_UIN);
        const changed = structuredClone(original);
        changed.statusCommand.enabled = false;
        api.failNextMutation = true;
        await expect(client.config.save(DEMO_UIN, changed)).rejects.toThrow('nothing changed');
        expect(await client.config.get(DEMO_UIN)).toEqual(original);
        expect((await client.config.save(DEMO_UIN, changed)).saved).toBe(true);
        api.setScenario('failure');
        await expect(client.system()).rejects.toThrow('Simulated API failure');
        api.setScenario('ready');
        expect((await client.system()).hostname).toContain('DEMO');
    });

    it('reuses appearance/layout/page defaults and retains other sections on save', async () => {
        await ready();
        const original = await client.ui.get();
        expect(original.version).toBe(1);
        const next = await client.ui.save({
            appearance: {
                ...original.appearance,
                mode: 'dark',
                customCss: '@import url(https://external.invalid);',
            },
        });
        expect(next.appearance.mode).toBe('dark');
        expect(next.appearance.customCss).toBe('');
        expect(next.layout).toEqual(original.layout);
        expect(next.pages).toEqual(original.pages);
        expect((await client.ui.getPublic()).mode).toBe('dark');
    });

    it('serves desktop URLs accepted by the production validator and demo isolation', async () => {
        await ready();
        const page = 'https://example.invalid/Nowluma/demo/';

        const accepts = (vncUrl: string) => {
            const href = desktopLink(0, vncUrl, page);
            expect(href).toBe('https://example.invalid/desktop/');
            expect(demoLinkTarget(href!, page)).toBe('desktop');
        };

        const before = await client.systemSettings.get();
        expect((await client.system()).deployment?.desktopAvailable).toBe(true);
        expect(before.effective?.vncUrl).toBe(DEMO_DESKTOP_URL);

        for (const vncUrl of [
            demoSystemSettings().vncUrl,
            demoSystem().deployment.vncUrl,
            before.settings.vncUrl,
            before.effective!.vncUrl,
        ]) {
            accepts(vncUrl);
        }

        expect(() => normalizeVncUrl('#desktop')).toThrow();
        await client.systemSettings.save({ vncUrl: DEMO_DESKTOP_URL });
        const after = await client.systemSettings.get();

        for (const vncUrl of [after.settings.vncUrl, after.effective!.vncUrl]) {
            accepts(vncUrl);
        }
    });

    it('exercises all settings surfaces without real probes, credentials, downloads or restart', async () => {
        await ready();
        const settings = await client.systemSettings.get();
        expect(settings.effective?.vncUrl).toBe(DEMO_DESKTOP_URL);
        expect(await client.systemSettings.save({ webuiPort: 6000 })).toMatchObject({
            restartRequiredToApply: true,
        });
        await expect(
            client.systemSettings.uploadCert('actual certificate', 'actual key'),
        ).rejects.toThrow('never upload real keys');
        await client.systemSettings.uploadCert('DEMO CERTIFICATE', 'DEMO PRIVATE KEY');
        expect((await client.systemSettings.get()).hasCert).toBe(true);
        await client.systemSettings.deleteCert();
        const notifications = await client.notifications.getConfig();
        expect((await client.notifications.saveConfig(notifications)).channels[0].name).toContain(
            'DEMO',
        );
        expect((await client.notifications.test('demo-webhook')).message).toContain(
            'no email or webhook',
        );
        expect(await client.notifications.recent()).toHaveLength(1);
        const global = await client.globalConfig.get();
        global.videoUploadConcurrency = 3;
        expect((await client.globalConfig.save(global)).videoUploadConcurrency).toBe(3);
        const sources = await client.update.sources();
        expect((await client.update.saveSources(sources.config)).saved).toBe(true);
        expect((await client.update.testSources(sources.config)).results[0].error).toContain(
            'no network',
        );
        expect((await client.update.check()).notes).toContain('DEMO');
        expect(await client.update.download('99.0.0-demo')).toMatchObject({ phase: 'ready' });
        expect(await client.update.restart()).toMatchObject({ phase: 'restarting' });
        expect((await client.logs.setLevel('trace')).level).toBe('trace');
        expect((await client.logs.getLevel()).level).toBe('trace');
        expect((await client.logs.exportTrace()).filename).toBe('DEMO-trace.log');
    });

    it('requires explicit all-account cleanup confirmation and updates fake totals', async () => {
        await ready();
        const initial = await client.storage.get();
        await expect(
            client
                .request('/api/system/storage/cleanup', {
                    method: 'POST',
                    body: JSON.stringify({
                        scope: 'allAccounts',
                        category: 'messages',
                        confirmation: 'wrong',
                    }),
                })
                .then((response) => response.status),
        ).resolves.toBe(400);
        expect(await client.storage.get()).toEqual(initial);
        expect(
            (await client.storage.saveSettings({ logRetainDays: 3 })).settings.effective
                .logRetainDays,
        ).toBe(3);
        const cleaned = await client.storage.cleanup({
            scope: 'account',
            category: 'media',
            uin: DEMO_UIN,
        });
        expect(cleaned.success).toBe(true);
        expect(cleaned.snapshot?.accounts[0].mediaBytes).toBe(0);
        expect(cleaned.snapshot?.totals.managedBytes).toBe(
            initial.snapshot.totals.managedBytes - 131072,
        );
        const temp = await client.storage.cleanup({ scope: 'temporary' });
        expect(temp.cleanup).toMatchObject({ skippedActiveItems: 1 });
        expect(temp.snapshot?.temporary.totalBytes).toBe(16384);
        const logs = await client.storage.cleanup({ scope: 'logs' });
        expect(logs.cleanup).toMatchObject({
            deletedFiles: initial.snapshot.logs.fileCount,
            freedBytes: initial.snapshot.logs.totalBytes,
            status: {
                totalBytes: 0,
                fileCount: initial.snapshot.logs.activeFileCount,
            },
        });
        expect(logs.snapshot?.logs.totalBytes).toBe(0);
    });

    it('restores only DEMO backups atomically and never restores credentials', async () => {
        await ready();
        const backup = await client.systemSettings.exportBackup(true);
        expect(backup.demo).toBe(true);
        expect(JSON.stringify(backup)).not.toContain(DEMO_NEW_PASSWORD);
        await expect(client.systemSettings.importBackup(backup, true)).rejects.toThrow(
            'without credential restoration',
        );
        await expect(
            client.systemSettings.importBackup({ version: 1, app: 'nowluma' }, false),
        ).rejects.toThrow('Only simulator backups');
        await expect(
            client.systemSettings.importBackup({ ...backup, ui: {} }, false),
        ).rejects.toThrow('Incomplete backup');
        expect((await client.systemSettings.importBackup(backup, false)).skipped).toContain(
            'credentials',
        );
    });

    it('exercises example 2FA enrollment, invalid code, recovery use, disable and reset', async () => {
        await ready();
        expect(await client.totp.status()).toEqual({ enabled: false });
        expect(await client.totp.begin()).toMatchObject({
            success: true,
            issuer: expect.stringContaining('DEMO'),
        });
        expect(await client.totp.confirm(DEMO_NEW_PASSWORD, '999999')).toMatchObject({
            success: false,
        });
        expect(await client.totp.confirm(DEMO_NEW_PASSWORD, '123456')).toMatchObject({
            success: true,
            recoveryCodes: ['DEMO-RECOVERY-0001', 'DEMO-RECOVERY-0002'],
        });
        await client.logout();
        expect(await client.login(DEMO_NEW_PASSWORD)).toEqual({ ok: false, needsTotp: true });
        expect(
            await client.login(DEMO_NEW_PASSWORD, { recoveryCode: 'DEMO-RECOVERY-0001' }),
        ).toMatchObject({ ok: true });
        expect(await client.totp.status()).toMatchObject({
            enabled: true,
            remainingRecoveryCodes: 1,
        });
        expect(
            await client.totp.regenerateRecoveryCodes(DEMO_NEW_PASSWORD, '123456'),
        ).toMatchObject({ success: true });
        expect(await client.totp.disable(DEMO_NEW_PASSWORD, { totp: '123456' })).toMatchObject({
            success: true,
        });
        api.reset();
        expect(await client.status()).toBe(false);
        expect(await client.login(DEMO_NEW_PASSWORD)).toMatchObject({ ok: false });
        expect(await client.login(DEMO_PASSWORD)).toMatchObject({
            ok: true,
            mustChangePassword: true,
        });
    });

    it('discards requests still parsing when reset replaces the state', async () => {
        const resetNotice = 'DEMO reset: all practice writes, files and sessions cleared.';

        const assertDiscarded = async (send: () => Promise<Response>) => {
            const listener = vi.fn();
            const unsubscribe = api.subscribe(listener);
            const pending = send();
            api.reset();
            await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
            expect(api.summary.authenticated).toBe(false);
            expect(api.notice).toBe(resetNotice);
            expect(listener).toHaveBeenCalledTimes(1);
            unsubscribe();
        };

        const body = JSON.stringify({ password: api.examplePassword });
        const origin = typeof location === 'undefined' ? 'https://demo.invalid' : location.origin;
        await assertDiscarded(() => api.fetch('/api/login', { method: 'POST', body }));
        await assertDiscarded(() =>
            api.fetch(
                new Request(new URL('/api/login', origin), {
                    method: 'POST',
                    body,
                }),
            ),
        );
    });

    it('reset replaces the state factory without leaking session, blob, subscription or write data', async () => {
        await ready();
        const listener = vi.fn();
        const unsubscribe = api.subscribe(listener);
        const revoke = vi.spyOn(URL, 'revokeObjectURL');
        await client.ui.uploadBackground(new File(['DEMO'], 'demo.png', { type: 'image/png' }));
        const oldBackground = api.backgroundUrl;
        expect(oldBackground).toMatch(/^blob:/);
        const config = await client.config.get(DEMO_UIN);
        config.statusCommand.trigger = '#leak';
        await client.config.save(DEMO_UIN, config);
        await client.debug.invoke(DEMO_UIN, 'send_private_msg', {
            user_id: 10002,
            message: 'leak',
        });
        expect(api.summary.messages).toBe(2);
        api.setScenario('offline');
        api.failNextMutation = true;

        api.reset();

        expect(revoke).toHaveBeenCalledWith(oldBackground);
        expect(revoke).toHaveBeenCalledTimes(1);
        expect(api.backgroundUrl).toBeNull();
        expect(api.failNextMutation).toBe(false);
        expect(api.scenario).toBe('setup');
        expect(api.summary).toEqual({
            authenticated: false,
            consent: false,
            mustChange: true,
            scanned: false,
            online: false,
            stopped: false,
            messages: 1,
        });
        expect(listener).toHaveBeenCalled();
        expect(await client.status()).toBe(false);

        unsubscribe();
        listener.mockClear();
        api.scan();
        expect(listener).not.toHaveBeenCalled();
        await setup();
        expect((await client.kernel.get(DEMO_UIN)).selection).toBeNull();
        expect((await client.config.get(DEMO_UIN)).statusCommand.trigger).toBe('#nl');
        revoke.mockRestore();
    });

    it('reset clears writes, sessions, scenarios and returns immutable response snapshots', async () => {
        await ready();
        const config = await client.config.get(DEMO_UIN);
        config.statusCommand.enabled = false;
        expect((await client.config.get(DEMO_UIN)).statusCommand.enabled).toBe(true);
        await client.config.save(DEMO_UIN, config);
        await client.debug.invoke(DEMO_UIN, 'send_private_msg', {
            user_id: 10002,
            message: 'practice',
        });
        api.failNextMutation = true;
        api.reset();
        expect(api.summary).toEqual({
            authenticated: false,
            consent: false,
            mustChange: true,
            scanned: false,
            online: false,
            stopped: false,
            messages: 1,
        });
        expect(api.failNextMutation).toBe(false);
        await setup();
        expect((await client.config.get(DEMO_UIN)).statusCommand.enabled).toBe(true);
    });
});

describe('DEMO strict API boundary', () => {
    it('rejects unauthenticated, pre-consent and wrong-account requests', async () => {
        expect((await api.fetch('/api/system')).status).toBe(401);
        await client.login(DEMO_PASSWORD);
        await expect(client.system()).rejects.toThrow('Finish practice');
        await client.agreements.recordConsent('demo-v1');
        expect(await client.changePassword(DEMO_PASSWORD, 'real secret')).toMatchObject({
            success: false,
        });
        await client.changePassword(DEMO_PASSWORD, DEMO_NEW_PASSWORD);
        await expect(client.config.get('99999')).rejects.toThrow('Unknown account');
        await expect(client.processes.load(9999)).rejects.toThrow('Unknown process');
        await expect(client.debug.invoke('99999', 'get_login_info', {})).rejects.toThrow(
            'Unknown account',
        );
    });

    it('blocks every external/root/unknown URL instead of returning empty success or using real fetch', async () => {
        await ready();

        for (const url of [
            'https://external.invalid/api/system',
            '//external.invalid/api/login',
            'http://127.0.0.1:5099/api/system',
            'https://demo.invalid.evil/api/ui',
        ]) {
            expect((await api.fetch(url)).status).toBe(403);
        }

        for (const url of ['/desktop/vnc.html', '/avatar/10001', '/api/not-implemented']) {
            const response = await api.fetch(url, { headers: { 'X-Nowluma-Token': token! } });
            expect(response.status).toBe(404);
            expect((await response.json()).message).toContain('DEMO');
        }

        expect((await client.request('/api/system', { method: 'DELETE' })).status).toBe(404);
    });

    it('rejects malformed/oversized JSON, invalid settings, missing file and aborts', async () => {
        await ready();

        for (const body of ['[1]', 'null', '{broken']) {
            expect((await client.request('/api/ui', { method: 'POST', body })).status).toBe(400);
        }

        expect(
            (await client.request('/api/ui', { method: 'POST', body: 'x'.repeat(2_000_001) }))
                .status,
        ).toBe(413);
        await expect(client.systemSettings.save({ webuiPort: -1 })).rejects.toThrow('Invalid port');
        await expect(
            client.ui.uploadBackground(new File(['not image'], 'demo.txt', { type: 'text/plain' })),
        ).rejects.toThrow('Choose PNG');
        expect((await client.request('/api/debug/upload', { method: 'POST' })).status).toBe(400);
        await expect(
            api.fetch('/api/ui/public', { signal: AbortSignal.abort() }),
        ).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('rejects malformed config/backup/UI/settings without damaging sample state', async () => {
        await ready();
        const initialUi = await client.ui.get();
        const initialConfig = await client.config.get(DEMO_UIN);
        const backup = await client.systemSettings.exportBackup(false);

        for (const config of [
            { networks: 'invalid' },
            { networks: { httpServers: [null] } },
            { networks: { httpServers: [{ name: 'DEMO', port: -1 }] } },
        ]) {
            expect(
                (
                    await client.request(`/api/config/${DEMO_UIN}`, {
                        method: 'POST',
                        body: JSON.stringify(config),
                    })
                ).status,
            ).toBe(400);
        }

        for (const patch of [
            { appearance: { background: null } },
            { pages: { logs: null } },
            { layout: { navItems: ['invalid'] } },
        ]) {
            expect(
                (await client.request('/api/ui', { method: 'POST', body: JSON.stringify(patch) }))
                    .status,
            ).toBe(400);
        }

        await expect(
            client.systemSettings.importBackup(
                { ...backup, ui: { appearance: {}, layout: {}, pages: {} } },
                false,
            ),
        ).rejects.toThrow('Invalid field type');
        expect(
            (
                await client.request('/api/system/settings', {
                    method: 'POST',
                    body: JSON.stringify({ vncUrl: 1 }),
                })
            ).status,
        ).toBe(400);
        expect(await client.ui.get()).toEqual(initialUi);
        expect(await client.config.get(DEMO_UIN)).toEqual(initialConfig);
    });

    it('accepts fake upload metadata without reading files and rejects untrusted images', async () => {
        await ready();
        const form = new FormData();
        form.append('file', new File(['DEMO'], 'demo.txt'));
        const uploaded = await client.request('/api/debug/upload', { method: 'POST', body: form });
        expect(await uploaded.json()).toMatchObject({
            status: 'ok',
            path: '/DEMO/memory/upload',
            size: 4,
        });
        const background = await client.ui.uploadBackground(
            new File(['DEMO'], 'demo.png', { type: 'image/png' }),
        );
        expect(background.appearance.background.hasImage).toBe(true);
        expect(api.backgroundUrl).toMatch(/^blob:/);
        await client.ui.deleteBackground();
        expect(api.backgroundUrl).toBeNull();
    });

    it('provides finite invoke streams with an explicit failed terminal for unknown actions', async () => {
        await ready();
        const frames: unknown[] = [];
        await client.debug.invokeStream(DEMO_UIN, 'get_login_info', {}, (frame) =>
            frames.push(frame),
        );
        expect(frames).toEqual([
            expect.objectContaining({
                status: 'ok',
                data: { user_id: 10001, nickname: 'DEMO 小光' },
            }),
        ]);
        frames.length = 0;
        await client.debug.invokeStream(DEMO_UIN, 'unknown', {}, (frame) => frames.push(frame));
        expect(frames).toEqual([expect.objectContaining({ status: 'failed', retcode: 1404 })]);
    });

    it('isolates stream cancellation and fails bounded buffers instead of growing forever', async () => {
        await ready();
        const headers = { 'X-Nowluma-Token': token! };
        const first = (await api.fetch('/api/debug/stream', { headers })).body!.getReader();
        const second = (await api.fetch('/api/debug/stream', { headers })).body!.getReader();
        await first.read();
        await second.read();
        await first.cancel();
        await client.debug.invoke(DEMO_UIN, 'get_login_info', {});
        expect(new TextDecoder().decode((await second.read()).value)).toContain('get_login_info');
        await second.cancel();
        const state = (await api.fetch('/api/state/stream', { headers })).body!.getReader();

        for (let i = 0; i < 500; i++) {
            api.scan();
        }

        await expect(state.read()).rejects.toThrow('Stream buffer limit');
    });

    it('pushes scoped state snapshots, closes streams on abort and resets without stale output', async () => {
        await ready();
        const abort = new AbortController();
        const response = await api.fetch('/api/state/stream', {
            signal: abort.signal,
            headers: { 'X-Nowluma-Token': token! },
        });
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        const frames = [];

        for (let i = 0; i < 4; i++) {
            frames.push(decoder.decode((await reader.read()).value));
        }

        expect(frames.join('')).toContain('DEMO 小光');
        api.setScenario('offline');
        expect(decoder.decode((await reader.read()).value)).toContain('disconnected');
        abort.abort();

        for (let i = 0; i < 2; i++) {
            await reader.read();
        }

        expect((await reader.read()).done).toBe(true);
        const another = await client.request('/api/debug/stream');
        const debug = another.body!.getReader();
        await debug.read();
        api.reset();
        expect((await debug.read()).done).toBe(true);
    });
});
