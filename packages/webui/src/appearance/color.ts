// Colour helpers for the custom accent → readable foreground and the
// light/dark accent stylesheet. The stored accent may be a preset oklch or a
// free-form hex from the locally tamperable cache, so every value is checked
// before it reaches CSS text.
import type { UiAppearance } from '@/types';
import { DEFAULT_APPEARANCE } from '@nowluma/common/webui-appearance';
import { ACCENTS } from '@/appearance/catalog';

// ─── Colour helpers (custom hex accent → readable foreground) ──────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const m = hex.trim().replace('#', '');

    if (m.length === 3) {
        const r = parseInt(m[0] + m[0], 16),
            g = parseInt(m[1] + m[1], 16),
            b = parseInt(m[2] + m[2], 16);
        return Number.isNaN(r + g + b) ? null : { r, g, b };
    }

    if (m.length === 6 || m.length === 8) {
        const r = parseInt(m.slice(0, 2), 16),
            g = parseInt(m.slice(2, 4), 16),
            b = parseInt(m.slice(4, 6), 16);
        return Number.isNaN(r + g + b) ? null : { r, g, b };
    }

    return null;
}

/** Pick black or white text for a given accent so labels stay legible. Accepts
 *  the preset oklch colours and custom hex; unknown formats fall back to white. */
function readableForeground(color: string): string {
    const rgb = hexToRgb(color);
    let lum: number | null = rgb ? (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255 : null;

    if (lum === null) {
        const oklch = /^oklch\(\s*([\d.]+)%/i.exec(color.trim());

        if (oklch) {
            lum = Number(oklch[1]) / 100;
        }
    }

    if (lum === null) {
        return '#ffffff';
    }

    return lum >= 0.6 ? '#0b0d12' : '#ffffff';
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** A hex colour safe to interpolate into CSS text, else the fallback. Guards
 *  the localStorage cache (writable by anyone with local access) from
 *  injecting arbitrary CSS through the accent <style> block. */
function safeHex(value: unknown, fallback: string): string {
    return typeof value === 'string' && HEX_RE.test(value.trim()) ? value.trim() : fallback;
}

/** Lighten a hex colour toward white by `ratio` (0..1) for dark-mode accents. */
function lightenHex(hex: string, ratio: number): string {
    const rgb = hexToRgb(hex);

    if (!rgb) {
        return hex;
    }

    const mix = (c: number) => Math.round(c + (255 - c) * ratio);
    const to2 = (n: number) => n.toString(16).padStart(2, '0');
    return `#${to2(mix(rgb.r))}${to2(mix(rgb.g))}${to2(mix(rgb.b))}`;
}

// ─── Apply appearance → DOM ────────────────────────────────────────────────

// Selected-state surface tints derived from the accent, so the sidebar's
// active item (--sidebar-accent) and the settings rail's active row (--accent)
// follow the chosen accent — not just primary/ring. Default palette only; the
// Catppuccin/Rosé Pine/… palettes own their own --accent/--sidebar-accent.
function accentSurfaces(hex: string, global: boolean, mode: 'light' | 'dark'): string {
    const bgMix = mode === 'light' ? 16 : 26; // accent over the canvas → --accent
    const sbMix = mode === 'light' ? 18 : 28; // accent over the sidebar → --sidebar-accent
    const fgMix = 72; // accent-forward text legible on those tints
    const sidebar =
        `--sidebar-accent:color-mix(in oklab, ${hex} ${sbMix}%, var(--sidebar));` +
        `--sidebar-accent-foreground:color-mix(in oklab, ${hex} ${fgMix}%, var(--foreground));`;

    if (!global) {
        return sidebar;
    }

    return (
        `--accent:color-mix(in oklab, ${hex} ${bgMix}%, var(--background));` +
        `--accent-foreground:color-mix(in oklab, ${hex} ${fgMix}%, var(--foreground));` +
        sidebar
    );
}

export function accentVarsCss(a: UiAppearance): string {
    const global = a.accentScope === 'global';
    // Only the default palette gets accent-tinted surfaces (others own theirs).
    const surf = a.palette === 'default';

    if (a.accentMode === 'custom') {
        const hex = safeHex(a.accentCustom, DEFAULT_APPEARANCE.accentCustom);
        const lightFg = readableForeground(hex);
        // Dark mode: lighten the accent for contrast on dark surfaces, and pick
        // the foreground from the *lightened* colour (a light accent needs dark text).
        const darkHex = lightenHex(hex, 0.18);
        const darkFg = readableForeground(darkHex);
        const lightCore = global
            ? `--primary:${hex};--primary-foreground:${lightFg};--ring:${hex};--sidebar-primary:${hex};--sidebar-primary-foreground:${lightFg};--sidebar-ring:${hex};`
            : `--sidebar-primary:${hex};--sidebar-primary-foreground:${lightFg};--sidebar-ring:${hex};`;
        const darkCore = global
            ? `--primary:${darkHex};--primary-foreground:${darkFg};--ring:${darkHex};--sidebar-primary:${darkHex};--sidebar-primary-foreground:${darkFg};--sidebar-ring:${darkHex};`
            : `--sidebar-primary:${darkHex};--sidebar-primary-foreground:${darkFg};--sidebar-ring:${darkHex};`;
        const lightBlock = lightCore + (surf ? accentSurfaces(hex, global, 'light') : '');
        const darkBlock = darkCore + (surf ? accentSurfaces(darkHex, global, 'dark') : '');
        return `:root{${lightBlock}}\n.dark{${darkBlock}}`;
    }

    const spec = ACCENTS.find((x) => x.id === a.accentPreset) ?? ACCENTS[0];
    // Black/white labels picked from each mode's primary keep preset buttons
    // readable in both schemes (the neutral dark primary is white).
    const lightFg = readableForeground(spec.light.primary);
    const darkFg = readableForeground(spec.dark.primary);
    const lightCore = global
        ? `--primary:${spec.light.primary};--primary-foreground:${lightFg};--ring:${spec.light.ring};--sidebar-primary:${spec.light.primary};--sidebar-primary-foreground:${lightFg};--sidebar-ring:${spec.light.ring};`
        : `--sidebar-primary:${spec.light.primary};--sidebar-primary-foreground:${lightFg};--sidebar-ring:${spec.light.ring};`;
    const darkCore = global
        ? `--primary:${spec.dark.primary};--primary-foreground:${darkFg};--ring:${spec.dark.ring};--sidebar-primary:${spec.dark.primary};--sidebar-primary-foreground:${darkFg};--sidebar-ring:${spec.dark.ring};`
        : `--sidebar-primary:${spec.dark.primary};--sidebar-primary-foreground:${darkFg};--sidebar-ring:${spec.dark.ring};`;
    const light = lightCore + (surf ? accentSurfaces(spec.light.primary, global, 'light') : '');
    const dark = darkCore + (surf ? accentSurfaces(spec.dark.primary, global, 'dark') : '');
    return `:root{${light}}\n.dark{${dark}}`;
}
