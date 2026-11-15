// Pure validator for the POST /api/system/settings body. Rejects clearly-bad
// input with a message (→ 400) rather than silently normalizing it, then hands
// a clean patch to updateRuntimeConfig. Wire field `tlsEnabled` maps to the
// nested `webuiTls.enabled`.

import { normalizeVncUrl, type RuntimeConfig } from '@nowluma/common/runtime';
import { isObject } from '@nowluma/common/coerce';
import { checkListenerExposure } from './listener-exposure';

export type SettingsPatch = Partial<
    Pick<
        RuntimeConfig,
        | 'webuiPort'
        | 'webuiHost'
        | 'webuiTls'
        | 'trustProxy'
        | 'vncPort'
        | 'vncUrl'
        | 'hookAutoLoad'
    >
>;

export type CoerceResult = { ok: true; patch: SettingsPatch } | { ok: false; error: string };

export function coerceSettingsPatch(body: unknown): CoerceResult {
    if (!isObject(body)) {
        return { ok: false, error: 'body must be an object' };
    }

    const patch: SettingsPatch = {};

    if ('webuiPort' in body) {
        const p = body.webuiPort;

        if (typeof p !== 'number' || !Number.isInteger(p) || p <= 0 || p > 65535) {
            return { ok: false, error: 'webuiPort must be an integer in 1..65535' };
        }

        patch.webuiPort = p;
    }

    if ('webuiHost' in body) {
        if (typeof body.webuiHost !== 'string' || !body.webuiHost.trim()) {
            return { ok: false, error: 'webuiHost must be a non-empty string' };
        }

        patch.webuiHost = body.webuiHost.trim();
    }

    if ('tlsEnabled' in body) {
        if (typeof body.tlsEnabled !== 'boolean') {
            return { ok: false, error: 'tlsEnabled must be a boolean' };
        }

        patch.webuiTls = { enabled: body.tlsEnabled };
    }

    if ('trustProxy' in body) {
        if (typeof body.trustProxy !== 'string') {
            return { ok: false, error: 'trustProxy must be a string' };
        }

        patch.trustProxy = body.trustProxy;
    }

    if ('vncPort' in body) {
        const p = body.vncPort;

        // 0 是合法值：关闭控制台的 QQ 桌面入口。
        if (typeof p !== 'number' || !Number.isInteger(p) || p < 0 || p > 65535) {
            return { ok: false, error: 'vncPort must be an integer in 0..65535' };
        }

        patch.vncPort = p;
    }

    if ('vncUrl' in body) {
        try {
            patch.vncUrl = normalizeVncUrl(body.vncUrl);
        } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : 'invalid vncUrl' };
        }
    }

    if ('hookAutoLoad' in body) {
        if (typeof body.hookAutoLoad !== 'boolean') {
            return { ok: false, error: 'hookAutoLoad must be a boolean' };
        }

        patch.hookAutoLoad = body.hookAutoLoad;
    }

    return { ok: true, patch };
}

const SETTINGS_ERRORS: Record<'invalid-bind-host' | 'tls-pair-required', string> = {
    'invalid-bind-host': '绑定地址不是有效的 TCP 地址',
    'tls-pair-required': '启用 TLS 前请先上传有效的证书与私钥',
};

/** Validate the listener that would be persisted after applying `patch` to `current`. */
export function evaluateSettingsSave(
    current: RuntimeConfig,
    patch: SettingsPatch,
    pairOk: boolean,
): CoerceResult {
    const webuiHost = patch.webuiHost ?? current.webuiHost ?? '127.0.0.1';
    const tlsEnabled = patch.webuiTls?.enabled ?? current.webuiTls?.enabled ?? false;
    const check = checkListenerExposure({ webuiHost, tlsEnabled, pairOk });

    if (!check.ok) {
        return { ok: false, error: SETTINGS_ERRORS[check.code] };
    }

    return { ok: true, patch };
}

export function tlsCertDeletionBlocked(tlsEnabled: boolean): boolean {
    return tlsEnabled;
}

/** The seven operator-editable fields, shared by the settings GET and POST. */
export interface SettingsView {
    webuiPort: number | undefined;
    webuiHost: string | undefined;
    tlsEnabled: boolean;
    trustProxy: string;
    vncPort: number;
    vncUrl: string;
    hookAutoLoad: boolean;
}

export function settingsView(config: RuntimeConfig): SettingsView {
    return {
        webuiPort: config.webuiPort,
        webuiHost: config.webuiHost,
        tlsEnabled: config.webuiTls?.enabled ?? false,
        trustProxy: config.trustProxy ?? '',
        vncPort: config.vncPort ?? 0,
        vncUrl: config.vncUrl ?? '',
        hookAutoLoad: config.hookAutoLoad === true,
    };
}
