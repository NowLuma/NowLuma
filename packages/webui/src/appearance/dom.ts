// Apply the effective appearance to the DOM: html attributes, the injected
// theme/override stylesheets, custom CSS gating and the fixed background layer.
import type { UiAppearance } from '@/types';
import type { WebuiPresentation } from '@nowluma/common/webui-target';
import {
    FONT_CUSTOM_ID,
    FONT_MONO_OPTIONS,
    FONT_SANS_OPTIONS,
    GRADIENT_OPTIONS,
    type FontSpec,
} from '@/appearance/catalog';
import { accentVarsCss } from '@/appearance/color';
import { paletteVarsCss } from '@/appearance/palette';
import { applyPresentationAttributes } from '@/appearance/runtime';
import { authToken, isSafeMode } from '@/appearance/persistence';

// Guards the locally-tamperable cache from injecting arbitrary CSS through the
// `--font-sans`/`--font-mono` declaration. Mirrors the server's fontFamilyOr.
const FONT_FAMILY_RE = /^[\p{L}\p{N}\s,'"._-]+$/u;

function safeFontFamily(value: string): string | null {
    const v = value.trim();

    if (v.length === 0 || v.length > 200 || !FONT_FAMILY_RE.test(v)) {
        return null;
    }

    return v;
}

/** Resolve the active font stack: a preset's stack, or — when `id === 'custom'`
 *  and the free-form family is valid — that family with a generic fallback
 *  appended (so a missing font still degrades gracefully). */
function resolveFontStack(
    options: FontSpec[],
    id: string,
    custom: string,
    generic: string,
): string {
    if (id === FONT_CUSTOM_ID) {
        const fam = safeFontFamily(custom);

        if (fam) {
            return `${fam}, ${generic}`;
        }

        return options[0].stack; // 'custom' selected but empty/invalid → default preset
    }

    return (options.find((f) => f.id === id) ?? options[0]).stack;
}

/** Build the `:root{ --token: value; … }` block from whitelisted cssVar
 *  overrides. Re-validates keys/values defensively (the cache is tamperable;
 *  the server is the real validator). Applied last so it wins over palette. */
const CSS_VAR_WHITELIST = new Set<string>([
    '--background',
    '--foreground',
    '--card',
    '--card-foreground',
    '--popover',
    '--popover-foreground',
    '--primary',
    '--primary-foreground',
    '--secondary',
    '--secondary-foreground',
    '--muted',
    '--muted-foreground',
    '--accent',
    '--accent-foreground',
    '--destructive',
    '--destructive-foreground',
    '--success',
    '--warning',
    '--border',
    '--input',
    '--ring',
    '--sidebar',
    '--sidebar-foreground',
    '--sidebar-primary',
    '--sidebar-primary-foreground',
    '--sidebar-accent',
    '--sidebar-accent-foreground',
    '--sidebar-border',
    '--sidebar-ring',
]);
const CSS_COLOR_RE =
    /^(?:#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|[a-zA-Z]{1,24}|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix)\([a-zA-Z0-9.,%/\s#-]{1,120}\))$/;

function cssVarsCss(a: UiAppearance): string {
    const vars = a.cssVars;

    if (!vars || typeof vars !== 'object') {
        return '';
    }

    const decls = Object.entries(vars)
        .filter(
            ([k, v]) =>
                CSS_VAR_WHITELIST.has(k) && typeof v === 'string' && CSS_COLOR_RE.test(v.trim()),
        )
        .map(([k, v]) => `${k}:${v.trim()};`)
        .join('');
    return decls ? `:root{${decls}}` : '';
}

export function applyAppearance(
    a: UiAppearance,
    resolved: 'light' | 'dark',
    presentation: WebuiPresentation | null,
    lowPerformance = false,
): void {
    const root = document.documentElement;
    applyPresentationAttributes(presentation);

    root.classList.remove('light', 'dark');
    root.classList.add(resolved);
    root.setAttribute('data-theme', resolved);
    root.style.colorScheme = resolved;

    root.setAttribute('data-density', a.density);
    // A Catppuccin flavor owns its own darkness, so the OLED "black" override
    // must not fight it — force a neutral intensity (it has no CSS rule) so the
    // injected palette wins over base .dark.
    root.setAttribute('data-dark-intensity', a.palette === 'default' ? a.darkIntensity : 'soft');
    root.setAttribute('data-palette', a.palette);
    root.setAttribute('data-sidebar-style', a.sidebarStyle);
    root.setAttribute('data-contrast', a.highContrast ? 'high' : 'normal');
    // 减弱动效 OR 关闭全部动效 both engage the reduce-motion CSS/Framer layer;
    // 关闭全部动效 additionally sets data-no-motion (kills CSS animations outright
    // and gates Framer entrance fades that reduce-motion leaves on).
    const systemReduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    root.setAttribute(
        'data-reduce-motion',
        a.reduceMotion || a.disableMotion || systemReduce ? '1' : '0',
    );
    root.setAttribute('data-no-motion', a.disableMotion ? '1' : '0');
    // Low performance is a rendering budget, not a motion preference: it keeps
    // the short transitions and static glass edge while skipping displacement work.
    root.setAttribute('data-low-performance', lowPerformance ? '1' : '0');
    // Mode-independent vars go inline on :root.
    root.style.setProperty('--radius', `${a.radius}rem`);
    root.style.setProperty(
        '--font-sans',
        resolveFontStack(FONT_SANS_OPTIONS, a.fontSans, a.fontSansCustom, 'system-ui, sans-serif'),
    );
    root.style.setProperty(
        '--font-mono',
        resolveFontStack(
            FONT_MONO_OPTIONS,
            a.fontMono,
            a.fontMonoCustom,
            'ui-monospace, monospace',
        ),
    );
    // UI scale: scale the root font-size so all rem-based sizing tracks it.
    // Clamp defensively (the localStorage cache is locally tamperable; the
    // server already bounds this to 0.9..1.2 for its own values).
    const scale = Math.min(2, Math.max(0.5, Number.isFinite(a.uiScale) ? a.uiScale : 1));
    root.style.fontSize = `${Math.round(16 * scale * 100) / 100}px`;

    // Accent differs by light/dark, so it needs a stylesheet with a `.dark` rule.
    const styleId = 'nowluma-theme-overrides';
    let el = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!el) {
        el = document.createElement('style');
        el.id = styleId;
        document.head.appendChild(el);
    }

    // Palette (base/surface tokens) first, then accent (--primary/--ring) — a
    // disjoint var set, layered after so it composes with any flavor. The
    // operator's variable-panel overrides come last so they win over both.
    el.textContent = presentation
        ? ''
        : `${paletteVarsCss(a)}\n${accentVarsCss(a)}\n${cssVarsCss(a)}`;

    // Custom CSS — appended AFTER the accent block so it is the last style in
    // <head> and can override anything. Skipped under ?safe-mode=1 (escape
    // hatch) so a broken rule can't lock the operator out of fixing it.
    const cssId = 'nowluma-custom-css';
    let cssEl = document.getElementById(cssId) as HTMLStyleElement | null;
    // Apply custom CSS ONLY when authed — the cache (nowluma_ui_appearance)
    // may hold customCss from a prior session, and applyAppearance runs at boot
    // before auth; without this gate that cached CSS would hit the login page
    // (bypassing the server-side strip) and could lock the operator out.
    const css = isSafeMode() || !authToken() ? '' : a.customCss || '';

    if (css) {
        if (!cssEl) {
            cssEl = document.createElement('style');
            cssEl.id = cssId;
            document.head.appendChild(cssEl);
        }

        if (cssEl.textContent !== css) {
            cssEl.textContent = css;
        }
    } else if (cssEl) {
        cssEl.textContent = '';
    }

    // Read the rendered canvas after palette/accent/custom overrides are in
    // place, so the browser chrome follows the current (not previous) theme.
    const themeMeta = document.querySelector('meta[name="theme-color"]');

    if (themeMeta) {
        themeMeta.setAttribute('content', getComputedStyle(document.body).backgroundColor);
    }
}

/** Manage the fixed full-viewport background layer behind the app. */
export function applyBackgroundLayer(a: UiAppearance): void {
    const id = 'nowluma-bg-layer';
    let layer = document.getElementById(id) as HTMLDivElement | null;
    const bg = a.background;

    if (bg.type === 'none') {
        if (layer) {
            layer.style.display = 'none';
        }

        return;
    }

    if (!layer) {
        layer = document.createElement('div');
        layer.id = id;
        layer.setAttribute('aria-hidden', 'true');
        // Behind app content, ignores pointer events, fixed to the viewport.
        layer.style.position = 'fixed';
        layer.style.inset = '0';
        layer.style.zIndex = '-1';
        layer.style.pointerEvents = 'none';
        layer.style.backgroundSize = 'cover';
        layer.style.backgroundPosition = 'center';
        layer.style.backgroundRepeat = 'no-repeat';
        layer.style.overflow = 'hidden';
        document.body.insertBefore(layer, document.body.firstChild);
    }

    layer.style.display = 'block';
    layer.style.filter = '';
    layer.style.transform = '';

    if (bg.type !== 'image') {
        layer.replaceChildren();
    }

    if (bg.type === 'solid') {
        layer.style.backgroundColor = bg.color;
        layer.style.backgroundImage = 'none';
    } else if (bg.type === 'gradient') {
        const g = GRADIENT_OPTIONS.find((x) => x.id === bg.gradient) ?? GRADIENT_OPTIONS[0];
        layer.style.backgroundColor = 'transparent';
        layer.style.backgroundImage = g.css;
    } else if (bg.type === 'image' && bg.hasImage) {
        // Keep url() and the readability overlay on separate nodes. WebKit drops
        // a whole `background-image` when color-mix(oklab, oklch-var) sits inside
        // a gradient that is comma-stacked with a url().
        layer.style.backgroundColor = 'transparent';
        layer.style.backgroundImage = 'none';
        layer.replaceChildren();
        const image = document.createElement('div');
        image.style.position = 'absolute';
        image.style.inset = '-6%';
        image.style.backgroundImage = `url("/ui-asset/background?v=${bg.imageVersion}")`;
        image.style.backgroundSize = 'cover';
        image.style.backgroundPosition = 'center';

        if (bg.imageBlur > 0) {
            image.style.filter = `blur(${bg.imageBlur}px)`;
        }

        const veil = document.createElement('div');
        veil.style.position = 'absolute';
        veil.style.inset = '0';
        veil.style.backgroundColor = `color-mix(in oklab, var(--background) ${Math.round(bg.imageOpacity * 100)}%, transparent)`;
        layer.append(image, veil);
    } else {
        // type === 'image' but no image on disk → nothing to show.
        layer.style.display = 'none';
    }
}
