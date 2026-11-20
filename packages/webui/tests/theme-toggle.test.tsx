import type { KeyboardEvent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThemeMode } from '../src/contexts/ThemeContext';
import type { useDropdown } from '../src/components/interior/dropdown';
import { ThemeToggle } from '../src/components/theme-toggle';

const state = vi.hoisted(() => ({
    mode: 'system' as ThemeMode,
    open: false,
    managedBy: null as string | null,
    palette: 'default',
    setMode: vi.fn(),
    dropdown: null as ReturnType<typeof useDropdown> | null,
}));

vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        appearance: { palette: state.palette, reduceMotion: true, disableMotion: true },
        mode: state.mode,
        setMode: state.setMode,
        managedBy: state.managedBy,
    }),
    paletteResolved: (palette: string) => palette !== 'default',
}));

// Exercise the real dropdown handlers; SSR controls only the menu's visible state.
vi.mock('@/components/interior/dropdown', async (original) => {
    const actual = await original<typeof import('../src/components/interior/dropdown')>();
    return {
        ...actual,
        useDropdown: (options: Parameters<typeof useDropdown>[0]) => {
            const dropdown = actual.useDropdown(options);
            state.dropdown = dropdown;
            return { ...dropdown, open: state.open };
        },
    };
});

beforeEach(() => {
    Object.assign(state, {
        mode: 'system',
        open: false,
        managedBy: null,
        palette: 'default',
        dropdown: null,
    });
    vi.clearAllMocks();
});

function key(key: string) {
    return {
        key,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent<HTMLUListElement>;
}

function dropdown() {
    if (!state.dropdown) {
        throw new Error('Theme dropdown was not rendered');
    }

    return state.dropdown;
}

describe('ThemeToggle menu', () => {
    it.each([
        ['system', '跟随系统'],
        ['light', '浅色'],
        ['dark', '深色'],
    ] as const)('uses one button for the saved %s preference', (mode, label) => {
        state.mode = mode;
        const html = renderToStaticMarkup(<ThemeToggle />);
        expect(html.match(/<button/g)).toHaveLength(1);
        expect(html).toContain(`aria-label="切换主题：${label}"`);
        expect(html).toContain('aria-haspopup="listbox"');
        expect(html).toContain('aria-expanded="false"');
        expect(html).not.toContain('role="option"');
    });

    it('exposes every existing choice in a single named listbox', () => {
        state.open = true;
        state.mode = 'dark';
        const html = renderToStaticMarkup(<ThemeToggle />);
        expect(html).toContain('role="listbox"');
        expect(html).toContain('aria-label="主题"');
        expect(html.match(/role="option"/g)).toHaveLength(3);
        expect(html.match(/aria-selected="true"/g)).toHaveLength(1);

        for (const label of ['跟随系统', '浅色', '深色']) {
            expect(html).toContain(label);
        }

        expect(html).toContain('data-glass-renderer="frosted"');
    });

    it('saves through the theme owner and restores focus after selection or Escape', () => {
        renderToStaticMarkup(<ThemeToggle />);
        const menu = dropdown();
        const focus = vi.fn();
        menu.triggerProps.ref.current = { focus } as unknown as HTMLButtonElement;
        menu.getItemProps(2).onClick();
        expect(state.setMode).toHaveBeenCalledExactlyOnceWith('dark');
        expect(focus).toHaveBeenCalledOnce();
        focus.mockClear();
        const escape = key('Escape');
        menu.listProps.onKeyDown(escape);
        expect(escape.preventDefault).toHaveBeenCalledOnce();
        expect(escape.stopPropagation).toHaveBeenCalledOnce();
        expect(focus).toHaveBeenCalledOnce();
        focus.mockClear();
        menu.listProps.onKeyDown(key('Tab'));
        expect(focus).not.toHaveBeenCalled();
    });

    it('leaves named palettes and the host in control of the scheme', () => {
        state.palette = 'catppuccin-mocha';
        expect(renderToStaticMarkup(<ThemeToggle />)).toBe('');
        state.palette = 'default';
        state.managedBy = 'maibot';
        expect(renderToStaticMarkup(<ThemeToggle />)).toBe('');
    });
});
