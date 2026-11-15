import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../src/components/pages/login-page';
import { elements, hookHost } from './helpers/hook-host';

const state = vi.hoisted(() => ({
    fx: '1',
    low: false,
    reduceMotion: false,
    disableMotion: false,
    setAppearance: vi.fn(),
    setItem: vi.fn(),
    removeCustomCss: vi.fn(),
}));

vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));
vi.mock('motion/react', async (original) => ({
    ...(await original<typeof import('motion/react')>()),
    useReducedMotionConfig: () => false,
}));
vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        appearance: {
            background: { type: 'none' },
            palette: 'default',
            reduceMotion: state.reduceMotion,
            disableMotion: state.disableMotion,
        },
        performance: { low: state.low, mode: 'auto', fps: 30 },
        managedBy: null,
        setAppearance: state.setAppearance,
    }),
}));

let hosts: ReturnType<typeof hookHost>[];
beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(state, { fx: '1', low: false, reduceMotion: false, disableMotion: false });
    hosts = [];
    state.setItem.mockImplementation((key: string, value: string) => {
        if (key === 'nowluma_login_fx') {
            state.fx = value;
        }
    });
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => (key === 'nowluma_login_fx' ? state.fx : null),
        setItem: state.setItem,
    });
    vi.stubGlobal(
        'window',
        Object.assign(new EventTarget(), {
            matchMedia: () => ({ matches: false }),
        }),
    );
    vi.stubGlobal(
        'document',
        Object.assign(new EventTarget(), {
            getElementById: (id: string) =>
                id === 'nowluma-custom-css' ? { remove: state.removeCustomCss } : null,
        }),
    );
});
afterEach(() => {
    hosts.forEach((host) => host.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function host() {
    const next = hookHost();
    hosts.push(next);
    return next;
}

function invoke(node: ReactElement<Record<string, unknown>>) {
    return (node.type as (props: Record<string, unknown>) => ReactNode)(node.props);
}

function find(
    node: ReactNode,
    predicate: (element: ReactElement<Record<string, unknown>>) => boolean,
) {
    const found = elements(node).find(predicate);

    if (!found) {
        throw new Error('Expected production login control');
    }

    return found;
}

function named(node: ReactNode, name: string) {
    return find(
        node,
        (element) => typeof element.type === 'function' && element.type.name === name,
    );
}

function mountedPage(onLogin = vi.fn(async () => ({ success: false }))) {
    const pageHost = host();
    const render = () => pageHost.render(() => LoginPage({ onLogin }));
    const shell = () => invoke(render() as ReactElement<Record<string, unknown>>);
    return { render, shell, onLogin };
}

function mountedEffects(shell: ReactNode) {
    const node = named(shell, 'LoginEffects');
    const effectsHost = host();
    const render = () => effectsHost.render(() => invoke(node));
    const tree = render();
    const trigger = find(tree, (element) => element.props['aria-label'] === '显示效果');
    const focus = vi.fn();
    (trigger.props.ref as { current: unknown }).current = { focus };
    const event = { key: 'ArrowDown', preventDefault: vi.fn() };
    (trigger.props.onKeyDown as (event: unknown) => void)(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    const opened = render();
    const list = find(opened, (element) => element.props.role === 'listbox');
    return { render, list, opened, focus };
}

describe('LoginPage device-local effects control', () => {
    it('changes the actual artwork with keyboard selection, persists only the compatible key, and keeps the password form mounted', () => {
        const page = mountedPage();
        const original = page.render();
        const input = find(original, (element) => element.props.id === 'login-password');
        (input.props.onChange as (event: unknown) => void)({
            target: { value: 'not-a-real-password' },
        });
        const full = page.shell();
        expect(
            find(full, (element) => element.props['data-login-effects'] === 'full'),
        ).toBeDefined();
        expect(
            find(full, (element) => element.props.className === 'ui-glass workspace-auth-lens'),
        ).toBeDefined();
        const menu = mountedEffects(full);
        const key = (key: string) => ({ key, preventDefault: vi.fn(), stopPropagation: vi.fn() });
        (menu.list.props.onKeyDown as (event: unknown) => void)(key('End'));
        const selectedList = find(menu.render(), (element) => element.props.role === 'listbox');
        (selectedList.props.onKeyDown as (event: unknown) => void)(key('Enter'));
        expect(state.setItem).toHaveBeenCalledExactlyOnceWith('nowluma_login_fx', '0');
        expect(state.setAppearance).not.toHaveBeenCalled();
        expect(page.onLogin).not.toHaveBeenCalled();
        expect(menu.focus).toHaveBeenCalledOnce();
        const simple = page.shell();
        expect(
            find(simple, (element) => element.props['data-login-effects'] === 'simple'),
        ).toBeDefined();
        expect(
            elements(simple).some(
                (element) => element.props.className === 'ui-glass workspace-auth-lens',
            ),
        ).toBe(false);
        expect(named(simple, 'LineField').props.animated).toBe(false);
        const retainedInput = find(
            page.render(),
            (element) => element.props.id === 'login-password',
        );
        expect(retainedInput.props.value).toBe('not-a-real-password');
        expect(retainedInput.key).toBe(input.key);
        expect(state.removeCustomCss).toHaveBeenCalledOnce();
        expect(mountedPage().render().props.fxOn).toBe(false);
    });

    it('restores focus on Escape without persisting a choice', () => {
        const menu = mountedEffects(mountedPage().shell());
        const escape = { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() };
        (menu.list.props.onKeyDown as (event: unknown) => void)(escape);
        expect(menu.focus).toHaveBeenCalledOnce();
        expect(escape.stopPropagation).toHaveBeenCalledOnce();
        expect(state.setItem).not.toHaveBeenCalled();
        expect(
            find(menu.render(), (element) => element.props['aria-label'] === '显示效果').props[
                'aria-expanded'
            ],
        ).toBe(false);
    });

    it('applies a real change even if local storage fails and preserves the failure detail', () => {
        state.setItem.mockImplementation(() => {
            throw new Error('storage denied');
        });
        const page = mountedPage();
        const menu = mountedEffects(page.shell());
        const simple = find(
            menu.opened,
            (element) =>
                element.props.role === 'option' && element.props['aria-selected'] === false,
        );
        (simple.props.onClick as () => void)();
        expect(page.render().props.fxOn).toBe(false);
        expect(page.render().props.fxSaveError).toContain('storage denied');
        expect(state.setAppearance).not.toHaveBeenCalled();
    });

    it('keeps short transitions in low mode and zero movement under either manual motion switch', () => {
        state.low = true;
        const low = mountedEffects(mountedPage().shell());
        const surface = find(
            low.opened,
            (element) =>
                element.props.className === 'ui-glass ui-glass-menu workspace-effects-menu',
        );
        expect(surface.props.transition).toMatchObject({ duration: 0.18 });
        state.reduceMotion = true;
        const reduced = mountedEffects(mountedPage().shell());
        const quiet = find(
            reduced.opened,
            (element) =>
                element.props.className === 'ui-glass ui-glass-menu workspace-effects-menu',
        );
        expect(quiet.props.transition).toEqual({ duration: 0 });
        state.reduceMotion = false;
        state.disableMotion = true;
        const disabled = mountedEffects(mountedPage().shell());
        expect(
            find(
                disabled.opened,
                (element) =>
                    element.props.className === 'ui-glass ui-glass-menu workspace-effects-menu',
            ).props.transition,
        ).toEqual({ duration: 0 });
    });

    it('leaves asynchronous authentication and the separate second-factor focus path with the auth owner', async () => {
        let resolve: (result: { success: boolean; needsTotp: boolean }) => void = () => undefined;
        const onLogin = vi.fn(
            () =>
                new Promise<{ success: boolean; needsTotp: boolean }>((done) => {
                    resolve = done;
                }),
        );
        const page = mountedPage(onLogin);
        const input = find(page.render(), (element) => element.props.id === 'login-password');
        (input.props.onChange as (event: unknown) => void)({
            target: { value: 'not-a-real-password' },
        });
        const form = find(page.render(), (element) => element.type === 'form');
        const pending = (form.props.onSubmit as (event: unknown) => Promise<void>)({
            preventDefault: vi.fn(),
        });
        const checking = find(page.render(), (element) => element.props.type === 'submit');
        expect(checking.props.disabled).toBe(true);
        expect(checking.props.children).toBe('验证中…');
        expect(
            find(page.render(), (element) => element.props.id === 'login-password').props.value,
        ).toBe('not-a-real-password');
        resolve({ success: false, needsTotp: true });
        await pending;
        expect(onLogin).toHaveBeenCalledExactlyOnceWith('not-a-real-password');
        expect(named(page.render(), 'OtpInput').props.autoFocus).toBe(true);
        expect(
            elements(page.render()).some((element) => element.props.id === 'login-password'),
        ).toBe(false);
        expect(state.removeCustomCss).toHaveBeenCalledOnce();
    });
});
