import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { normalizeRuntimeConfig, resolveRuntimeEnvOverrides } from '../src/runtime';

describe('normalizeRuntimeConfig', () => {
    it('applies all defaults for an empty object', () => {
        expect(normalizeRuntimeConfig({})).toEqual({
            webuiPort: 5099,
            hookAutoLoad: false,
            webuiHost: '127.0.0.1',
            webuiTls: { enabled: false },
            trustProxy: '',
            vncPort: 0,
            vncUrl: '',
            logMaxTotalMb: 1024,
            logRetainDays: 7,
            logPerUin: false,
        });
    });

    it('passes through valid values', () => {
        expect(
            normalizeRuntimeConfig({
                webuiPort: 8080,
                hookAutoLoad: true,
                webuiHost: '127.0.0.1',
                webuiTls: { enabled: true },
                trustProxy: '1',
                vncPort: 6080,
                logMaxTotalMb: 2048,
                logRetainDays: 0,
                logPerUin: true,
            }),
        ).toEqual({
            webuiPort: 8080,
            hookAutoLoad: true,
            webuiHost: '127.0.0.1',
            webuiTls: { enabled: true },
            trustProxy: '1',
            vncPort: 6080,
            vncUrl: '',
            logMaxTotalMb: 2048,
            logRetainDays: 0,
            logPerUin: true,
        });
    });

    it('accepts vncPort 0 as "entry hidden" and rejects out-of-range values', () => {
        expect(normalizeRuntimeConfig({ vncPort: 0 }).vncPort).toBe(0);
        expect(normalizeRuntimeConfig({ vncPort: 6080 }).vncPort).toBe(6080);
        expect(normalizeRuntimeConfig({ vncPort: '6080' }).vncPort).toBe(6080);

        for (const value of [-1, 70000, 60.5, null, true, 'abc']) {
            expect(() => normalizeRuntimeConfig({ vncPort: value })).toThrow(/vncPort/);
        }
    });

    it('falls back on invalid types', () => {
        const out = normalizeRuntimeConfig({
            webuiPort: 0, // out of range → default
            webuiHost: 123, // non-string → default
            webuiTls: 'yes', // non-object → default
            trustProxy: 5, // non-string → default
        });
        expect(out.webuiPort).toBe(5099);
        expect(out.webuiHost).toBe('127.0.0.1');
        expect(out.webuiTls).toEqual({ enabled: false });
        expect(out.trustProxy).toBe('');
    });

    it('fails fast on invalid persisted log settings', () => {
        expect(() => normalizeRuntimeConfig({ logMaxTotalMb: 0 })).toThrow(/logMaxTotalMb/);
        expect(() => normalizeRuntimeConfig({ logRetainDays: -1 })).toThrow(/logRetainDays/);
        expect(() => normalizeRuntimeConfig({ logPerUin: 'maybe' })).toThrow(/logPerUin/);
        expect(() => normalizeRuntimeConfig({ logPerUin: '' })).toThrow(/logPerUin/);
        expect(() => normalizeRuntimeConfig({ logMaxTotalMb: Number.MAX_SAFE_INTEGER })).toThrow(
            /logMaxTotalMb/,
        );
        expect(() => normalizeRuntimeConfig({ logRetainDays: Number.MAX_SAFE_INTEGER })).toThrow(
            /logRetainDays/,
        );
    });

    it('coerces webuiTls.enabled loosely and trims a blank host to default', () => {
        expect(normalizeRuntimeConfig({ webuiTls: { enabled: 1 } }).webuiTls).toEqual({
            enabled: true,
        });
        expect(normalizeRuntimeConfig({ webuiHost: '   ' }).webuiHost).toBe('127.0.0.1');
    });

    it('rejects a non-object input back to full defaults', () => {
        expect(normalizeRuntimeConfig(null).webuiPort).toBe(5099);
        expect(normalizeRuntimeConfig('nope').webuiHost).toBe('127.0.0.1');
    });
});

describe('resolveRuntimeEnvOverrides', () => {
    it('returns empty when no NOWLUMA_* vars are set', () => {
        expect(resolveRuntimeEnvOverrides({})).toEqual({});
    });

    it('parses port / host / trustProxy from env', () => {
        expect(
            resolveRuntimeEnvOverrides({
                NOWLUMA_WEBUI_PORT: '6700',
                NOWLUMA_WEBUI_HOST: '127.0.0.1',
                NOWLUMA_WEBUI_TRUST_PROXY: '1',
            }),
        ).toEqual({ webuiPort: 6700, webuiHost: '127.0.0.1', trustProxy: '1' });
    });

    it('parses log storage overrides including retainDays=0', () => {
        expect(
            resolveRuntimeEnvOverrides({
                NOWLUMA_LOG_MAX_TOTAL_MB: '4096',
                NOWLUMA_LOG_RETAIN_DAYS: '0',
                NOWLUMA_LOG_PER_UIN: '1',
            }),
        ).toEqual({
            logMaxTotalMb: 4096,
            logRetainDays: 0,
            logPerUin: true,
        });
    });

    it('fails fast on invalid log storage overrides', () => {
        expect(() =>
            resolveRuntimeEnvOverrides({
                NOWLUMA_LOG_MAX_TOTAL_MB: '0',
            }),
        ).toThrow(/NOWLUMA_LOG_MAX_TOTAL_MB/);
        expect(() =>
            resolveRuntimeEnvOverrides({
                NOWLUMA_LOG_RETAIN_DAYS: '-1',
            }),
        ).toThrow(/NOWLUMA_LOG_RETAIN_DAYS/);
        expect(() =>
            resolveRuntimeEnvOverrides({
                NOWLUMA_LOG_PER_UIN: 'maybe',
            }),
        ).toThrow(/NOWLUMA_LOG_PER_UIN/);
    });

    it('fails fast when converted log storage overrides would be unsafe', () => {
        expect(() =>
            resolveRuntimeEnvOverrides({
                NOWLUMA_LOG_MAX_TOTAL_MB: String(Number.MAX_SAFE_INTEGER),
            }),
        ).toThrow(/NOWLUMA_LOG_MAX_TOTAL_MB/);
        expect(() =>
            resolveRuntimeEnvOverrides({
                NOWLUMA_LOG_RETAIN_DAYS: String(Number.MAX_SAFE_INTEGER),
            }),
        ).toThrow(/NOWLUMA_LOG_RETAIN_DAYS/);
    });

    it('parses NOWLUMA_WEBUI_TLS over the saved switch', () => {
        expect(resolveRuntimeEnvOverrides({ NOWLUMA_WEBUI_TLS: '1' })).toEqual({
            webuiTls: { enabled: true },
        });
        expect(resolveRuntimeEnvOverrides({ NOWLUMA_WEBUI_TLS: '0' })).toEqual({
            webuiTls: { enabled: false },
        });
        expect(() => resolveRuntimeEnvOverrides({ NOWLUMA_WEBUI_TLS: 'maybe' })).toThrow(
            /NOWLUMA_WEBUI_TLS/,
        );
    });

    it('parses NOWLUMA_VNC_PORT including 0 to hide the console entry', () => {
        expect(resolveRuntimeEnvOverrides({ NOWLUMA_VNC_PORT: '6080' })).toEqual({
            vncPort: 6080,
        });
        expect(resolveRuntimeEnvOverrides({ NOWLUMA_VNC_PORT: '0' })).toEqual({ vncPort: 0 });
        expect(resolveRuntimeEnvOverrides({ NOWLUMA_VNC_PORT: '' })).toEqual({});
        expect(() => resolveRuntimeEnvOverrides({ NOWLUMA_VNC_PORT: 'abc' })).toThrow(
            /NOWLUMA_VNC_PORT/,
        );
        expect(() => resolveRuntimeEnvOverrides({ NOWLUMA_VNC_PORT: '70000' })).toThrow(
            /NOWLUMA_VNC_PORT/,
        );
        expect(() => resolveRuntimeEnvOverrides({ NOWLUMA_VNC_PORT: '60.5' })).toThrow(
            /NOWLUMA_VNC_PORT/,
        );
    });

    it('supports proxy desktop URLs and explicit automatic-attach overrides', () => {
        expect(normalizeRuntimeConfig({ vncUrl: '/desktop/vnc.html' }).vncUrl).toBe(
            '/desktop/vnc.html',
        );
        expect(
            resolveRuntimeEnvOverrides({ NOWLUMA_VNC_URL: '', NOWLUMA_HOOK_AUTOLOAD: '0' }),
        ).toEqual({ vncUrl: '', hookAutoLoad: false });
        expect(resolveRuntimeEnvOverrides({ NOWLUMA_HOOK_AUTOLOAD: 'yes' })).toEqual({
            hookAutoLoad: true,
        });

        for (const url of [
            'javascript:alert(1)',
            '//evil.test/vnc.html',
            'https://user:pass@example.test',
            'https://example.test?password=secret',
        ]) {
            expect(() => normalizeRuntimeConfig({ vncUrl: url })).toThrow();
        }
    });

    it('ignores an out-of-range / non-numeric port env', () => {
        expect(resolveRuntimeEnvOverrides({ NOWLUMA_WEBUI_PORT: '0' })).toEqual({});
        expect(resolveRuntimeEnvOverrides({ NOWLUMA_WEBUI_PORT: 'abc' })).toEqual({});
    });

    it('treats trustProxy="0"/"off" as a real override (not absent)', () => {
        expect(resolveRuntimeEnvOverrides({ NOWLUMA_WEBUI_TRUST_PROXY: '0' })).toEqual({
            trustProxy: '0',
        });
    });
});

describe('updateRuntimeConfig (fs)', () => {
    let prevCwd: string;
    let dir: string;
    let prevPortEnv: string | undefined;
    beforeEach(async () => {
        const fs = await import('fs');
        const os = await import('os');
        const path = await import('path');
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-rt-'));
        prevCwd = process.cwd();
        process.chdir(dir);
        prevPortEnv = process.env.NOWLUMA_WEBUI_PORT;
        delete process.env.NOWLUMA_WEBUI_PORT;
    });
    afterEach(async () => {
        process.chdir(prevCwd);

        if (prevPortEnv === undefined) {
            delete process.env.NOWLUMA_WEBUI_PORT;
        } else {
            process.env.NOWLUMA_WEBUI_PORT = prevPortEnv;
        }

        fs.rmSync(dir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it('merges a patch over on-disk values and persists normalized', async () => {
        const { updateRuntimeConfig } = await import('../src/runtime');
        const fs = await import('fs');
        const path = await import('path');
        const out = updateRuntimeConfig({ webuiHost: '127.0.0.1', webuiTls: { enabled: true } });
        expect(out.webuiHost).toBe('127.0.0.1');
        expect(out.webuiTls).toEqual({ enabled: true });
        const onDisk = JSON.parse(fs.readFileSync(path.join('config', 'runtime.json'), 'utf8'));
        expect(onDisk.webuiHost).toBe('127.0.0.1');
        expect(onDisk.webuiTls).toEqual({ enabled: true });
    });

    it('does NOT bake an env-overridden port into the persisted file', async () => {
        const { updateRuntimeConfig } = await import('../src/runtime');
        const fs = await import('fs');
        const path = await import('path');
        process.env.NOWLUMA_WEBUI_PORT = '9999';
        updateRuntimeConfig({ webuiHost: '127.0.0.1' });
        const onDisk = JSON.parse(fs.readFileSync(path.join('config', 'runtime.json'), 'utf8'));
        expect(onDisk.webuiPort).toBe(5099); // default on-disk, NOT the env 9999
    });

    it('never overwrites corrupt or non-object persisted runtime configuration', async () => {
        const { loadRuntimeConfig, updateRuntimeConfig } = await import('../src/runtime');
        fs.mkdirSync('config');
        const file = path.join('config', 'runtime.json');

        for (const contents of ['{invalid', '[]', 'null']) {
            fs.writeFileSync(file, contents, 'utf8');
            expect(() => loadRuntimeConfig()).toThrow(/preserved/);
            expect(() => updateRuntimeConfig({ vncPort: 6080 })).toThrow(/preserved/);
            expect(fs.readFileSync(file, 'utf8')).toBe(contents);
        }
    });

    it('keeps the previous runtime file intact when atomic replacement fails', async () => {
        const { updateRuntimeConfig } = await import('../src/runtime');
        updateRuntimeConfig({ logRetainDays: 7 });
        const runtimePath = path.join('config', 'runtime.json');
        const before = fs.readFileSync(runtimePath, 'utf8');
        vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
            throw Object.assign(new Error('disk replacement failed'), { code: 'EIO' });
        });

        expect(() => updateRuntimeConfig({ logRetainDays: 0 })).toThrow(/disk replacement failed/);
        expect(fs.readFileSync(runtimePath, 'utf8')).toBe(before);
        expect(fs.readdirSync('config').filter((name) => name.includes('.tmp-'))).toEqual([]);
    });
});
