// Appearance cache + HTTP persistence. ThemeProvider sits outside ApiProvider,
// so it uses a direct fetch with the bearer token from localStorage.
import { DEFAULT_APPEARANCE, UI_APPEARANCE_CACHE_KEY } from '@nowluma/common/webui-appearance';
import { webuiSessionHeaders } from '@/lib/api/session-headers';
import type { UiAppearance } from '@/types';

const LS_CACHE = UI_APPEARANCE_CACHE_KEY;
const TOKEN_KEY = 'nowluma_token';

export function authToken(): string | null {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

function withAppearanceDefaults(value: Partial<UiAppearance>): UiAppearance {
    return {
        ...DEFAULT_APPEARANCE,
        ...value,
        background: {
            ...DEFAULT_APPEARANCE.background,
            ...value.background,
        },
    };
}

export async function fetchAppearance(): Promise<UiAppearance | null> {
    const token = authToken();

    try {
        // Authed: fetch the full config so we get `customCss` (which the public
        // subset strips). Pre-auth (login page): the cosmetic public subset only.
        if (token) {
            const res = await fetch('/api/ui', { headers: webuiSessionHeaders(token) });

            if (res.ok) {
                const data = (await res.json()) as {
                    config?: { appearance?: Partial<UiAppearance> };
                };

                if (data.config?.appearance) {
                    return withAppearanceDefaults(data.config.appearance);
                }
            }
            // 401/expired → fall through to the public subset.
        }

        const res = await fetch('/api/ui/public');

        if (!res.ok) {
            return null;
        }

        const data = (await res.json()) as { appearance?: Partial<UiAppearance> };
        return data.appearance ? withAppearanceDefaults(data.appearance) : null;
    } catch {
        return null;
    }
}

/** `?safe-mode=1` disables custom CSS so a broken rule can't lock the operator
 *  out. Sticky for the session (sessionStorage) so it survives in-app
 *  navigation — and so editing the CSS to fix it doesn't re-inject the broken
 *  rule mid-fix. Clears when the tab/session closes. */
export function isSafeMode(): boolean {
    try {
        if (new URLSearchParams(window.location.search).get('safe-mode') === '1') {
            sessionStorage.setItem('nowluma_safe_mode', '1');
            return true;
        }

        return sessionStorage.getItem('nowluma_safe_mode') === '1';
    } catch {
        return false;
    }
}

export async function persistAppearance(appearance: UiAppearance): Promise<void> {
    const token = authToken();

    if (!token) {
        return;
    } // pre-auth: local cache only (no settings UI exists there anyway)

    const response = await fetch('/api/ui', {
        method: 'POST',
        headers: webuiSessionHeaders(token, { 'Content-Type': 'application/json' }),
        // Section-level save: only `appearance`; the server preserves `layout`.
        body: JSON.stringify({ appearance }),
    });

    if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
            message?: string;
            error?: string;
        };
        throw new Error(
            payload.message || payload.error || `外观保存失败（HTTP ${response.status}）`,
        );
    }
}

/** Upload a wallpaper and return the server's normalized appearance, if sent. */
export async function uploadBackgroundImage(file: File): Promise<UiAppearance | null> {
    const token = authToken();

    if (!token) {
        throw new Error('未登录');
    }

    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/ui/background', {
        method: 'POST',
        headers: webuiSessionHeaders(token),
        body: form,
    });

    if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(e.message || '上传失败');
    }

    const data = (await res.json()) as { config?: { appearance?: UiAppearance } };
    return data.config?.appearance ?? null;
}

/** Remove the wallpaper and return the server's normalized appearance, if sent. */
export async function removeBackgroundImage(): Promise<UiAppearance | null> {
    const token = authToken();

    if (!token) {
        throw new Error('未登录');
    }

    const res = await fetch('/api/ui/background', {
        method: 'DELETE',
        headers: webuiSessionHeaders(token),
    });

    if (!res.ok) {
        throw new Error('删除失败');
    }

    const data = (await res.json()) as { config?: { appearance?: UiAppearance } };
    return data.config?.appearance ?? null;
}

export function readCache(): UiAppearance {
    try {
        const raw = localStorage.getItem(LS_CACHE);

        if (!raw) {
            return DEFAULT_APPEARANCE;
        }

        const parsed = JSON.parse(raw) as Partial<UiAppearance>;
        // Shallow merge over defaults so a cache written by an older build still
        // yields a complete object (the server is the real validator).
        return withAppearanceDefaults(parsed);
    } catch {
        return DEFAULT_APPEARANCE;
    }
}

export function writeCache(a: UiAppearance): void {
    try {
        localStorage.setItem(LS_CACHE, JSON.stringify(a));
    } catch {
        /* quota / private mode */
    }
}
