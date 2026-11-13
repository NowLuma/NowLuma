import { describe, it, expect } from 'vitest';
import {
    coerceSettingsPatch,
    evaluateSettingsSave,
    tlsCertDeletionBlocked,
} from '../src/webui/system-settings';
import type { RuntimeConfig } from '@nowluma/common/runtime';

describe('coerceSettingsPatch', () => {
    it('accepts a full valid body and maps tlsEnabled → webuiTls.enabled', () => {
        const r = coerceSettingsPatch({
            webuiPort: 8080,
            webuiHost: '127.0.0.1',
            tlsEnabled: true,
            trustProxy: '1',
        });
        expect(r).toEqual({
            ok: true,
            patch: {
                webuiPort: 8080,
                webuiHost: '127.0.0.1',
                webuiTls: { enabled: true },
                trustProxy: '1',
            },
        });
    });

    it('only includes provided keys (partial patch)', () => {
        const r = coerceSettingsPatch({ webuiHost: '0.0.0.0' });
        expect(r).toEqual({ ok: true, patch: { webuiHost: '0.0.0.0' } });
    });

    it('rejects a non-object body', () => {
        expect(coerceSettingsPatch(null).ok).toBe(false);
        expect(coerceSettingsPatch('x').ok).toBe(false);
    });

    it('rejects an out-of-range or non-integer port', () => {
        expect(coerceSettingsPatch({ webuiPort: 0 }).ok).toBe(false);
        expect(coerceSettingsPatch({ webuiPort: 70000 }).ok).toBe(false);
        expect(coerceSettingsPatch({ webuiPort: 12.5 }).ok).toBe(false);
    });

    it('rejects an empty/blank host', () => {
        expect(coerceSettingsPatch({ webuiHost: '   ' }).ok).toBe(false);
        expect(coerceSettingsPatch({ webuiHost: 123 }).ok).toBe(false);
    });

    it('rejects a non-boolean tlsEnabled and non-string trustProxy', () => {
        expect(coerceSettingsPatch({ tlsEnabled: 'yes' }).ok).toBe(false);
        expect(coerceSettingsPatch({ trustProxy: 1 }).ok).toBe(false);
    });

    it('accepts an empty-string trustProxy (trust nobody)', () => {
        expect(coerceSettingsPatch({ trustProxy: '' })).toEqual({
            ok: true,
            patch: { trustProxy: '' },
        });
    });

    it('validates desktop URLs and automatic-attach switches at the API boundary', () => {
        expect(coerceSettingsPatch({ vncUrl: '/desktop/vnc.html', hookAutoLoad: true })).toEqual({ ok: true, patch: { vncUrl: '/desktop/vnc.html', hookAutoLoad: true } });
        expect(coerceSettingsPatch({ hookAutoLoad: 'yes' }).ok).toBe(false);
        for (const url of ['javascript:alert(1)', '//elsewhere.test', 'https://user:pass@example.test', '/vnc.html?token=secret']) {
            expect(coerceSettingsPatch({ vncUrl: url }).ok).toBe(false);
        }
    });

    it('accepts vncPort 0 through 65535 and rejects the rest', () => {
        expect(coerceSettingsPatch({ vncPort: 0 })).toEqual({ ok: true, patch: { vncPort: 0 } });
        expect(coerceSettingsPatch({ vncPort: 6080 })).toEqual({
            ok: true,
            patch: { vncPort: 6080 },
        });
        expect(coerceSettingsPatch({ vncPort: -1 }).ok).toBe(false);
        expect(coerceSettingsPatch({ vncPort: 70000 }).ok).toBe(false);
        expect(coerceSettingsPatch({ vncPort: 60.5 }).ok).toBe(false);
        expect(coerceSettingsPatch({ vncPort: '6080' }).ok).toBe(false);
    });
});

describe('evaluateSettingsSave', () => {
    const current: RuntimeConfig = {
        webuiPort: 5099,
        webuiHost: '127.0.0.1',
        webuiTls: { enabled: false },
    };

    it('rejects an invalid bind host on the patch', () => {
        const r = evaluateSettingsSave(current, { webuiHost: 'not_a_host' }, true);
        expect(r.ok).toBe(false);

        if (!r.ok) {
            expect(r.error).toMatch(/TCP/);
        }
    });

    it('rejects saving an unrelated field when the persisted host is invalid', () => {
        const r = evaluateSettingsSave(
            { ...current, webuiHost: 'not_a_host' },
            { webuiPort: 8080 },
            true,
        );
        expect(r.ok).toBe(false);
    });

    it('rejects enabling TLS without a usable certificate pair', () => {
        const r = evaluateSettingsSave(current, { webuiTls: { enabled: true } }, false);
        expect(r).toEqual({ ok: false, error: '启用 TLS 前请先上传有效的证书与私钥' });
    });

    it('rejects leaving TLS enabled when the pair is already missing', () => {
        const r = evaluateSettingsSave(
            { ...current, webuiTls: { enabled: true } },
            { webuiPort: 8080 },
            false,
        );
        expect(r.ok).toBe(false);
    });

    it('allows disabling TLS even without a pair', () => {
        const r = evaluateSettingsSave(
            { ...current, webuiTls: { enabled: true } },
            { webuiTls: { enabled: false } },
            false,
        );
        expect(r).toEqual({ ok: true, patch: { webuiTls: { enabled: false } } });
    });
});

describe('tlsCertDeletionBlocked', () => {
    it('blocks deletion while TLS is enabled and allows it when TLS is off', () => {
        expect(tlsCertDeletionBlocked(true)).toBe(true);
        expect(tlsCertDeletionBlocked(false)).toBe(false);
    });
});
