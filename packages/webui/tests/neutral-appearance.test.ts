import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, UI_APPEARANCE_CACHE_KEY } from '@nowluma/common/webui-appearance';
import {
    ACCENTS,
    DEFAULT_APPEARANCE as CONTEXT_DEFAULT_APPEARANCE,
    PALETTE_OPTIONS,
    accentVarsCss,
} from '../src/contexts/ThemeContext';

function channel(hex: string, index: number): number {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(a: string, b: string): number {
    const luminance = (hex: string) =>
        0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

describe('neutral appearance defaults', () => {
    it('shares one default object between the common contract and ThemeContext', () => {
        expect(CONTEXT_DEFAULT_APPEARANCE).toBe(DEFAULT_APPEARANCE);
        expect(UI_APPEARANCE_CACHE_KEY).toBe('nowluma_ui_appearance');
        expect(DEFAULT_APPEARANCE.accentPreset).toBe('neutral');
        expect(DEFAULT_APPEARANCE.accentCustom).toBe('#111111');
        expect(DEFAULT_APPEARANCE.background.color).toBe('#ffffff');
    });

    it('keeps neutral first and purple accents selectable', () => {
        expect(ACCENTS[0].id).toBe('neutral');
        expect(ACCENTS.map((accent) => accent.id)).toContain('lavender');
        expect(ACCENTS.find((accent) => accent.id === 'lavender')?.swatch).toBe('#8561bd');
        expect(ACCENTS.map((accent) => accent.id)).toEqual([
            'neutral',
            'lavender',
            'sky',
            'blue',
            'violet',
            'rose',
            'emerald',
            'amber',
            'orange',
        ]);
    });

    it('injects a white dark primary with readable black/white foregrounds', () => {
        const css = accentVarsCss({ ...DEFAULT_APPEARANCE, mode: 'dark' });
        const dark = css.slice(css.indexOf('\n.dark{'));
        expect(dark).toContain('--primary:oklch(98% 0 0);--primary-foreground:#0b0d12;');
        expect(dark).toContain('--sidebar-primary-foreground:#0b0d12;');
        expect(contrastRatio('#f8f8f8', '#0b0d12')).toBeGreaterThanOrEqual(7);

        const light = css.slice(css.indexOf(':root{'), css.indexOf('\n.dark{'));
        expect(light).toContain('--primary:oklch(21% 0 0);--primary-foreground:#ffffff;');
        expect(contrastRatio('#181818', '#ffffff')).toBeGreaterThanOrEqual(7);
    });

    it('uses dark labels at the 60% lightness boundary for blue and violet', () => {
        for (const accentPreset of ['blue', 'violet']) {
            const css = accentVarsCss({ ...DEFAULT_APPEARANCE, accentPreset });
            const light = css.slice(0, css.indexOf('\n.dark{'));
            expect(light).toContain('--primary-foreground:#0b0d12;');
            expect(light).toContain('--sidebar-primary-foreground:#0b0d12;');
        }
    });

    it('keeps every existing palette option', () => {
        expect(PALETTE_OPTIONS.map((palette) => palette.id)).toEqual([
            'default',
            'catppuccin-latte',
            'catppuccin-frappe',
            'catppuccin-macchiato',
            'catppuccin-mocha',
            'rose-pine',
            'rose-pine-moon',
            'rose-pine-dawn',
            'nord',
            'everforest-dark',
            'everforest-light',
        ]);
    });

    it('has no purple in the base :root/.dark tokens', () => {
        const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
        const base = css.slice(0, css.indexOf('@theme inline'));
        expect(base).not.toMatch(/\b300\)/);
        expect(base).toContain('--primary: oklch(98% 0 0);');
        expect(base).toContain('--sidebar-accent: oklch(94% 0 0);');
        expect(base).toContain('--sidebar-ring: oklch(98% 0 0);');
    });
});
