import type { ComponentProps, FunctionComponent, ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigPage } from '../src/components/pages/config-page';
import { AdapterRow } from '../src/components/config/adapter-row';
import { GeneralSettingsTab } from '../src/components/config/general-settings-tab';
import { ConfirmDialog } from '../src/components/confirm-dialog';
import { Button } from '../src/components/ui/button';
import { normalizeOneBotConfig } from '../src/lib/onebot-config';
import type { ConfigSaveResult } from '../src/lib/api/types';
import type { OneBotConfig } from '../src/types';
import { elements, hookHost } from './helpers/hook-host';

const state = vi.hoisted(() => ({
    selectedUin: '10001',
    configTab: 'httpServers',
    api: { config: { get: vi.fn(), save: vi.fn() } },
}));
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));
vi.mock('@/lib/api', () => ({ useApi: () => state.api }));
vi.mock('@/contexts/ActionFeedbackContext', async (original) => ({
    ...(await original<typeof import('../src/contexts/ActionFeedbackContext')>()),
    useActionFeedback: () => ({
        runAction: (_options: unknown, action: () => unknown) => action(),
    }),
}));
vi.mock('@/contexts/AppStateContext', () => ({
    useAppState: () => ({
        selectedUin: state.selectedUin,
        qqList: [
            { uin: '10001', nickname: 'Account A' },
            { uin: '20002', nickname: 'Account B' },
        ],
        connections: [],
        setSelectedUin: vi.fn(),
        refreshQqList: vi.fn(),
        resources: { qqList: { ready: true, error: '' } },
    }),
}));
vi.mock('@/contexts/LayoutContext', () => ({
    useLayout: () => ({ pages: { configTab: state.configTab }, setPages: vi.fn() }),
}));

const original = normalizeOneBotConfig({
    networks: { httpServers: [{ name: 'server-a', port: 3000, accessToken: 'fixture' }] },
});
let pageHost: ReturnType<typeof hookHost>;
let viewHost: ReturnType<typeof hookHost>;
let rowHost: ReturnType<typeof hookHost>;
let dialogHost: ReturnType<typeof hookHost>;
const page = () => pageHost.render(ConfigPage);

const flush = async () => {
    for (let i = 0; i < 12; i++) {
        await Promise.resolve();
    }
};

const find = (
    tree: ReactNode,
    predicate: (element: ReactElement<Record<string, unknown>>) => boolean,
) => {
    const result = elements(tree).find(predicate);
    expect(result).toBeDefined();
    return result!;
};

function view() {
    const element = find(
        page(),
        (item) => typeof item.type === 'function' && item.type.name === 'NetworkTabView',
    );
    return viewHost.render(() => (element.type as FunctionComponent)(element.props));
}

function rowProps() {
    return find(view(), (item) => item.type === AdapterRow).props as ComponentProps<
        typeof AdapterRow
    >;
}

function openDelete() {
    const props = rowProps();
    const row = rowHost.render(() => AdapterRow(props));
    (
        find(row, (item) => item.props['aria-label'] === '删除 server-a').props
            .onClick as () => void
    )();
    return () =>
        find(
            rowHost.render(() => AdapterRow(props)),
            (item) => item.type === ConfirmDialog,
        ).props as ComponentProps<typeof ConfirmDialog>;
}

function confirmButton(tree: ReactNode) {
    const modal = tree as ReactElement<{ footer: ReactNode }>;
    return find(
        modal.props.footer,
        (item) => item.type === Button && item.props.variant === 'destructive',
    );
}

const response = (
    config: OneBotConfig,
    patch: Partial<ConfigSaveResult> = {},
): ConfigSaveResult => ({
    config,
    saved: true,
    applied: true,
    online: true,
    errors: [],
    message: '',
    ...patch,
});

beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    pageHost = hookHost();
    viewHost = hookHost();
    rowHost = hookHost();
    dialogHost = hookHost();
    state.selectedUin = '10001';
    state.configTab = 'httpServers';
    state.api.config.get.mockReset().mockResolvedValue(original);
    state.api.config.save.mockReset();
    page();
    await flush();
});
afterEach(() => {
    [pageHost, viewHost, rowHost, dialogHost].forEach((host) => host.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('ConfigPage adapter changes', () => {
    it('opens a deletion confirmation and cancels without a write', () => {
        const confirmation = openDelete();
        expect(confirmation().open).toBe(true);
        confirmation().onOpenChange(false);
        expect(confirmation().open).toBe(false);
        vi.advanceTimersByTime(10_000);
        expect(state.api.config.save).not.toHaveBeenCalled();
    });

    it('confirms once, disables repeat submission and targets the selected account', async () => {
        const confirmation = openDelete();
        const pending = Promise.withResolvers<ConfigSaveResult>();
        state.api.config.save.mockReturnValue(pending.promise);
        let dialog = dialogHost.render(() => ConfirmDialog(confirmation()));
        (confirmButton(dialog).props.onClick as () => void)();
        expect(state.api.config.save).toHaveBeenCalledOnce();
        const [uin, target] = state.api.config.save.mock.calls[0] as [string, OneBotConfig];
        expect(uin).toBe('10001');
        expect(target.networks.httpServers).toEqual([]);
        dialog = dialogHost.render(() => ConfirmDialog(confirmation()));
        expect(confirmButton(dialog).props.disabled).toBe(true);
        pending.resolve(response(target));
        await flush();
        expect(confirmation().open).toBe(false);
        vi.advanceTimersByTime(10_000);
        expect(state.api.config.save).toHaveBeenCalledOnce();
        expect(state.api.config.get).toHaveBeenCalledOnce();
    });

    it('keeps the original adapter and visible modal error after failed deletion without retry', async () => {
        const confirmation = openDelete();
        state.api.config.save.mockRejectedValue(new Error('删除写入失败'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const dialog = dialogHost.render(() => ConfirmDialog(confirmation()));
        (confirmButton(dialog).props.onClick as () => void)();
        await flush();
        const next = dialogHost.render(() => ConfirmDialog(confirmation()));
        expect(find(next, (item) => item.props.role === 'alert').props.children).toBe(
            '删除写入失败',
        );
        expect(confirmation().open).toBe(true);
        expect(rowProps().item.name).toBe('server-a');
        vi.advanceTimersByTime(10_000);
        expect(state.api.config.save).toHaveBeenCalledOnce();
    });

    it('retains a persisted removal and its apply warning when runtime restart fails', async () => {
        const confirmation = openDelete();
        state.api.config.save.mockImplementation((_uin, target: OneBotConfig) =>
            Promise.resolve(
                response(target, {
                    applied: false,
                    errors: [{ name: 'server-a', phase: 'stop', message: '关闭超时', at: 1 }],
                }),
            ),
        );
        const dialog = dialogHost.render(() => ConfirmDialog(confirmation()));
        (confirmButton(dialog).props.onClick as () => void)();
        await flush();
        expect(confirmation().open).toBe(false);
        const editor = find(
            page(),
            (item) => typeof item.type === 'function' && item.type.name === 'EditorBar',
        );
        expect(editor.props.saveStatusTone).toBe('warning');
        expect(editor.props.saveStatus).toContain('server-a：关闭超时');
        expect(elements(view()).filter((item) => item.type === AdapterRow)).toHaveLength(0);
        vi.advanceTimersByTime(10_000);
        expect(state.api.config.save).toHaveBeenCalledOnce();
    });

    it('cancels a pending message-behavior debounce when account context changes', async () => {
        state.configTab = 'general';
        pageHost.unmount();
        pageHost = hookHost();
        page();
        await flush();
        const general = find(page(), (item) => item.type === GeneralSettingsTab);
        (general.props.onChange as (next: OneBotConfig) => void)({
            ...original,
            historySync: { enabled: true },
        });
        state.selectedUin = '20002';
        page();
        await flush();
        vi.advanceTimersByTime(1000);
        expect(state.api.config.save).not.toHaveBeenCalled();
    });
});
