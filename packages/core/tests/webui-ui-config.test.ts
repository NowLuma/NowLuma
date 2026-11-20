import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DEFAULT_APPEARANCE, DEFAULT_BACKGROUND } from '@nowluma/common/webui-appearance';
import {
    defaultUiConfig,
    normalizeAppearance,
    normalizeLayout,
    normalizePages,
    normalizeUiConfig,
    sniffImageMime,
} from '../src/webui/ui-config';

// These cover the total-normalize trust boundary (any corrupt/hostile input
// collapses to safe defaults — the cosmetic subset is served to the
// UNAUTHENTICATED login page) plus the B1–B3 schema additions.

describe('normalizeAppearance — defaults & coercion', () => {
    it('collapses non-objects / garbage to the full default appearance', () => {
        const d = defaultUiConfig().appearance;
        expect(normalizeAppearance(undefined)).toEqual(d);
        expect(normalizeAppearance(null)).toEqual(d);
        expect(normalizeAppearance(42)).toEqual(d);
        expect(normalizeAppearance('nope')).toEqual(d);
        expect(normalizeAppearance([])).toEqual(d);
    });

    it('clamps numeric fields and rejects bad enums', () => {
        const a = normalizeAppearance({
            uiScale: 99,
            radius: -5,
            mode: 'neon',
            density: 'spacious',
        });
        expect(a.uiScale).toBe(1.2); // clamped to max
        expect(a.radius).toBe(0); // clamped to min
        expect(a.mode).toBe('system'); // bad enum → default
        expect(a.density).toBe('cozy');
    });

    it('normalizes legacy automatic quality without changing manual motion or other preferences', () => {
        expect(normalizeAppearance({}).performanceMode).toBe('high');

        for (const performanceMode of ['high', 'low']) {
            expect(normalizeAppearance({ performanceMode }).performanceMode).toBe(performanceMode);
        }

        const preferences = {
            disableMotion: true,
            reduceMotion: true,
            accentPreset: 'violet',
            palette: 'rose-pine',
            uiScale: 1.1,
            background: { type: 'solid', color: '#123456' },
            cssVars: { '--primary': '#234567' },
            customCss: 'body { color: inherit; }',
        };
        const saved = normalizeAppearance({ ...preferences, performanceMode: 'auto', autoLow: true });
        expect(saved).toMatchObject({ ...preferences, performanceMode: 'high' });
        expect(saved).not.toHaveProperty('autoLow');
        expect(normalizeAppearance({ ...preferences, performanceMode: 'low' })).toMatchObject({
            ...preferences,
            performanceMode: 'low',
        });
        expect(normalizeAppearance({ performanceMode: 'turbo', disableMotion: true })).toMatchObject({
            performanceMode: 'high',
            disableMotion: true,
        });
    });

    it('keeps the custom pointer opt-in while enabling the independent context menu by default', () => {
        expect(normalizeAppearance({}).customPointerSystem).toBe(false);
        expect(normalizeAppearance({ customPointerSystem: true }).customPointerSystem).toBe(true);
        expect(normalizeAppearance({}).customContextMenu).toBe(true);
        expect(normalizeAppearance({ customContextMenu: false }).customContextMenu).toBe(false);
    });
});

describe('normalizeAppearance — custom fonts (B1)', () => {
    it('accepts a free-form family / stack with spaces', () => {
        const a = normalizeAppearance({
            fontSansCustom: 'LXGW WenKai, PingFang SC',
            fontMonoCustom: 'Cascadia Code',
        });
        expect(a.fontSansCustom).toBe('LXGW WenKai, PingFang SC');
        expect(a.fontMonoCustom).toBe('Cascadia Code');
    });

    it('rejects control chars and CSS-injection, falling back to default', () => {
        expect(
            normalizeAppearance({ fontSansCustom: 'Evil; } body{display:none}' }).fontSansCustom,
        ).toBe('');
        expect(normalizeAppearance({ fontSansCustom: 'bad\u0000name' }).fontSansCustom).toBe('');
        expect(normalizeAppearance({ fontSansCustom: '{nope}' }).fontSansCustom).toBe('');
    });

    it('treats an explicitly-empty custom family as cleared', () => {
        expect(normalizeAppearance({ fontSansCustom: '   ' }).fontSansCustom).toBe('');
    });

    it('caps an over-long family name', () => {
        expect(normalizeAppearance({ fontSansCustom: 'A'.repeat(500) }).fontSansCustom).toBe('');
    });
});

describe('normalizeAppearance — cssVars whitelist (B1)', () => {
    it('keeps whitelisted tokens with valid colour values', () => {
        const a = normalizeAppearance({
            cssVars: {
                '--primary': '#abcdef',
                '--background': 'rgb(10, 20, 30)',
                '--foreground': 'oklch(70% 0.1 230)',
                '--accent': 'color-mix(in oklab, #fff 50%, transparent)',
                '--border': 'red',
            },
        });
        expect(a.cssVars).toEqual({
            '--primary': '#abcdef',
            '--background': 'rgb(10, 20, 30)',
            '--foreground': 'oklch(70% 0.1 230)',
            '--accent': 'color-mix(in oklab, #fff 50%, transparent)',
            '--border': 'red',
        });
    });

    it('drops keys outside the token whitelist', () => {
        const a = normalizeAppearance({
            cssVars: { '--evil': '#fff', color: 'red', '--primary': '#000' },
        });
        expect(a.cssVars).toEqual({ '--primary': '#000' });
    });

    it('drops values that could break out of the declaration', () => {
        const a = normalizeAppearance({
            cssVars: {
                '--primary': 'red; } body { display: none }',
                '--background': 'url(evil.png)',
                '--foreground': '#zzz',
                '--border': '#fff', // valid survivor
            },
        });
        expect(a.cssVars).toEqual({ '--border': '#fff' });
    });

    it('collapses a non-object cssVars to {}', () => {
        expect(normalizeAppearance({ cssVars: 'nope' }).cssVars).toEqual({});
        expect(normalizeAppearance({ cssVars: ['#fff'] }).cssVars).toEqual({});
        expect(normalizeAppearance({}).cssVars).toEqual({});
    });
});

describe('normalizeAppearance — customCss cap', () => {
    it('truncates customCss to 50k and coerces non-strings to empty', () => {
        expect(normalizeAppearance({ customCss: 'x'.repeat(60_000) }).customCss).toHaveLength(
            50_000,
        );
        expect(normalizeAppearance({ customCss: 123 }).customCss).toBe('');
    });
});

describe('normalizeLayout — overviewMobile + topbarItems (B2)', () => {
    it('preserves order, de-dupes, and keeps id+visible only', () => {
        const layout = normalizeLayout({
            overviewMobile: [
                { id: 'host', visible: false },
                { id: 'host', visible: true }, // dup → dropped
                { id: 'connections', visible: true },
            ],
            topbarItems: [
                { id: 'theme', visible: false },
                { id: 'status', visible: true },
            ],
        });
        expect(layout.overviewMobile).toEqual([
            { id: 'host', visible: false },
            { id: 'connections', visible: true },
        ]);
        expect(layout.topbarItems).toEqual([
            { id: 'theme', visible: false },
            { id: 'status', visible: true },
        ]);
    });

    it('falls back to defaults when the array is missing or all-invalid', () => {
        const def = defaultUiConfig().layout;
        expect(normalizeLayout({}).overviewMobile).toEqual(def.overviewMobile);
        expect(normalizeLayout({ topbarItems: [{}, { id: '' }, 7] }).topbarItems).toEqual(
            def.topbarItems,
        );
    });

    it('preserves + clamps overviewBlocks grid coords', () => {
        const layout = normalizeLayout({
            overviewBlocks: [{ id: 'host', visible: true, x: 999, y: -5, w: 99, h: 0 }],
        });
        expect(layout.overviewBlocks[0]).toMatchObject({ id: 'host', x: 50, y: 0, w: 12, h: 1 });
    });
});

describe('normalizeLayout — per-widget config size bound (B2 static widgets)', () => {
    it('keeps a config object at/under the 4096-byte JSON cap and drops oversize', () => {
        const small = { id: 'note', visible: true, config: { text: 'hi' } };
        const okText = 'x'.repeat(4000); // JSON well under 4096
        const ok = { id: 'link', visible: true, config: { text: okText } };
        const bigText = 'x'.repeat(5000); // JSON over 4096
        const big = { id: 'account', visible: true, config: { text: bigText } };

        const layout = normalizeLayout({ overviewBlocks: [small, ok, big] });
        expect(layout.overviewBlocks[0].config).toEqual({ text: 'hi' });
        expect(layout.overviewBlocks[1].config).toEqual({ text: okText });
        expect(layout.overviewBlocks[2].config).toBeUndefined(); // oversize → dropped
    });
});

describe('normalizePages — logs preset (B3)', () => {
    it('accepts known presets and defaults unknown to custom', () => {
        expect(normalizePages({ logs: { preset: 'dev' } }).logs.preset).toBe('dev');
        expect(normalizePages({ logs: { preset: 'ops' } }).logs.preset).toBe('ops');
        expect(normalizePages({ logs: { preset: 'bogus' } }).logs.preset).toBe('custom');
        expect(normalizePages({}).logs.preset).toBe('custom');
    });
});

describe('sniffImageMime — magic-byte sniffing', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

    it('identifies PNG / JPEG / WebP by magic bytes', () => {
        expect(sniffImageMime(png)).toBe('image/png');
        expect(sniffImageMime(jpeg)).toBe('image/jpeg');
        expect(sniffImageMime(webp)).toBe('image/webp');
    });

    it('returns null for non-images / truncated input', () => {
        expect(sniffImageMime(new Uint8Array([1, 2, 3]))).toBeNull();
        expect(sniffImageMime(new Uint8Array([0x89, 0x50]))).toBeNull();
        expect(sniffImageMime(new Uint8Array(0))).toBeNull();
    });
});

describe('normalizeUiConfig — image fields are NOT taken from the value', () => {
    it('ignores a client-supplied hasImage when no trusted state is given', () => {
        const cfg = normalizeUiConfig({
            appearance: {
                background: {
                    type: 'image',
                    hasImage: true,
                    imageMime: 'image/png',
                    imageVersion: 9,
                },
            },
        });
        // Default (untrusted) image state → forced off; an 'image' type with no
        // stored image degrades to 'none'.
        expect(cfg.appearance.background.hasImage).toBe(false);
        expect(cfg.appearance.background.type).toBe('none');
    });

    it('takes image fields from the trusted ServerImageState argument', () => {
        const cfg = normalizeUiConfig(
            { appearance: { background: { type: 'image' } } },
            { hasImage: true, imageMime: 'image/png', imageVersion: 3 },
        );
        expect(cfg.appearance.background).toMatchObject({
            type: 'image',
            hasImage: true,
            imageMime: 'image/png',
            imageVersion: 3,
        });
    });
});

// ── Shared appearance contract (common/webui-appearance) ───────────────────
describe('shared appearance defaults', () => {
    it('normalizes to the shared default appearance', () => {
        expect(normalizeAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
        expect(defaultUiConfig().appearance).toEqual({
            ...DEFAULT_APPEARANCE,
            background: { ...DEFAULT_BACKGROUND },
            cssVars: {},
        });
    });

    it('returns clone-isolated defaults', () => {
        const first = defaultUiConfig().appearance;
        const second = defaultUiConfig().appearance;
        expect(first).not.toBe(second);
        expect(first.background).not.toBe(second.background);
        expect(first.background).not.toBe(DEFAULT_APPEARANCE.background);
        first.background.color = '#000000';
        first.cssVars['--primary'] = 'red';
        expect(DEFAULT_APPEARANCE.background.color).not.toBe('#000000');
        expect(DEFAULT_APPEARANCE.cssVars).toEqual({});
    });

    it('preserves saved lavender/custom appearance and unknown accent ids', () => {
        const saved = normalizeAppearance({
            accentMode: 'custom',
            accentPreset: 'lavender',
            accentCustom: '#8561bd',
            background: { type: 'solid', color: '#b99ae6' },
            palette: 'rose-pine',
        });
        expect(saved.accentMode).toBe('custom');
        expect(saved.accentPreset).toBe('lavender');
        expect(saved.accentCustom).toBe('#8561bd');
        expect(saved.background).toMatchObject({ type: 'solid', color: '#b99ae6' });
        expect(saved.palette).toBe('rose-pine');
        expect(normalizeAppearance({ accentPreset: 'future-accent' }).accentPreset).toBe(
            'future-accent',
        );
    });

    it('keeps every existing palette selectable', () => {
        const palettes = [
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
        ] as const;

        for (const palette of palettes) {
            expect(normalizeAppearance({ palette }).palette).toBe(palette);
        }
    });
});

// ── fs-backed: save/load/public, isolated in a temp cwd with a fresh module ──
describe('saveUiConfig / publicAppearance (fs-backed)', () => {
    let tmp: string;
    let prevCwd: string;

    beforeEach(() => {
        prevCwd = process.cwd();
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-uicfg-'));
        process.chdir(tmp);
        vi.resetModules(); // fresh module → empty in-memory cache + config/ dir here
    });
    afterEach(() => {
        process.chdir(prevCwd);
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('forces the server-managed image fields (a client cannot forge hasImage)', async () => {
        const mod = await import('../src/webui/ui-config');
        const saved = mod.saveUiConfig({
            appearance: {
                background: {
                    type: 'image',
                    hasImage: true,
                    imageMime: 'image/png',
                    imageVersion: 7,
                },
            },
        });
        // No image on disk → the forged hasImage is rejected.
        expect(saved.appearance.background.hasImage).toBe(false);
        expect(saved.appearance.background.type).toBe('none');
    });

    it('publicAppearance strips customCss but keeps cssVars + other cosmetic fields', async () => {
        const mod = await import('../src/webui/ui-config');
        mod.saveUiConfig({
            appearance: {
                customCss: 'body{display:none}',
                cssVars: { '--primary': '#123456' },
                accentPreset: 'violet',
                customPointerSystem: true,
            },
        });
        const pub = mod.publicAppearance();
        expect(pub.customCss).toBe(''); // stripped — never reaches the login page
        expect(pub.cssVars).toEqual({ '--primary': '#123456' }); // safe → kept
        expect(pub.accentPreset).toBe('violet');
        expect(pub.customPointerSystem).toBe(true);
    });
});
