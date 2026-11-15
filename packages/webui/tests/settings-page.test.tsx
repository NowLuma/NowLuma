import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsNav, SettingsPage } from '../src/components/pages/settings-page';
import { SETTINGS_TABS, type SettingsTab } from '../src/router';
import { elements } from './helpers/hook-host';

const route = vi.hoisted(() => ({ tab: undefined as string | undefined, navigate: vi.fn() }));
vi.mock('@/router', async (original) => {
    const actual = await original<typeof import('../src/router')>();
    return {
        ...actual,
        settingsRoute: {
            ...actual.settingsRoute,
            useSearch: () => ({ tab: route.tab }),
            useNavigate: () => route.navigate,
        },
    };
});
afterEach(() => {
    route.tab = undefined;
    route.navigate.mockClear();
});
const panelNames: Record<SettingsTab, string> = {
    appearance: 'AppearancePanel',
    data: 'DataPanel',
    account: 'AccountPanel',
    globalConfig: 'GlobalConfigPanel',
    storage: 'StoragePanel',
    notifications: 'NotificationsPanel',
    system: 'SystemPanel',
    advanced: 'AdvancedPanel',
    developer: 'DeveloperPanel',
    about: 'AboutPanel',
};

describe('SettingsPage category routes', () => {
    it.each(SETTINGS_TABS)('keeps the %s deep link and exactly its requested panel', (tab) => {
        route.tab = tab;
        const panels = elements(SettingsPage()).filter(
            (item) => typeof item.type === 'function' && item.type.name.endsWith('Panel'),
        );
        expect(
            panels.map((item) => (typeof item.type === 'function' ? item.type.name : '')),
        ).toEqual([panelNames[tab]]);
        const nav = elements(SettingsPage()).find((item) => item.type === SettingsNav)!;
        expect(nav.props.tab).toBe(tab);
        (nav.props.onChange as (next: SettingsTab) => void)('system');
        expect(route.navigate).toHaveBeenCalledWith({
            to: '/settings',
            search: { tab: 'system' },
            replace: true,
        });
    });

    it('keeps the default category URL empty and all ten categories visible', () => {
        const nav = elements(SettingsPage()).find((item) => item.type === SettingsNav)!;
        expect(nav.props.tab).toBe('appearance');
        (nav.props.onChange as (next: SettingsTab) => void)('appearance');
        expect(route.navigate).toHaveBeenCalledWith({ to: '/settings', search: {}, replace: true });
        const html = renderToStaticMarkup(
            <SettingsNav tab="appearance" onChange={() => undefined} />,
        );
        expect(html.match(/<button /g)).toHaveLength(10);
        expect(html.match(/aria-current="page"/g)).toHaveLength(1);
        expect(html).toContain('aria-label="设置导航"');
        expect(html).toContain('cp-category-chrome');
    });
});
