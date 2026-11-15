// System maintenance routes: host info, listener settings, TLS certificate
// material, and config backup/restore. Distro/arch detection and the CPU
// sampler come from system-info.ts; the sampler is created once here (per
// initWebUI) so a second server does not inherit this one's baseline.

import { getRuntimeIntegrity, hasLowProcessIntegrity } from '@nowluma/bridge';
import { createLogger } from '@nowluma/common/logger';
import {
    readRuntimeConfig,
    resolveRuntimeEnvOverrides,
    updateRuntimeConfig,
} from '@nowluma/common/runtime';
import {
    chmodSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'fs';
import type { Hono } from 'hono';
import os from 'os';
import path from 'path';
import { buildBackup } from './backup';
import { deploymentInfo } from './deployment-info';
import { RestoreTransactionError, restoreBackup, type RestorePhase } from './restore';
import { createCpuLoadSampler, CACHED_ARCH_LABEL, CACHED_DISTRO } from './system-info';
import {
    coerceSettingsPatch,
    evaluateSettingsSave,
    settingsView,
    tlsCertDeletionBlocked,
} from './system-settings';
import { resolveTlsContext, validateTlsPair } from './tls';

const log = createLogger('WebUI');

export interface SystemRouteDependencies {
    /** Actual bound listener port; resolved after registration, read per request. */
    getBoundPort(): number;
}

export interface RestoreFailureBody {
    success: false;
    message: string;
    transactionId: string;
    phase: RestorePhase;
    committed: boolean;
    rollbackSucceeded?: boolean;
    snapshotDir?: string;
    failedFiles: string[];
}

/** Translate transaction facts into an operator-facing HTTP failure. */
export function describeRestoreFailure(error: RestoreTransactionError): {
    status: 400 | 500;
    body: RestoreFailureBody;
} {
    const detail = error.cause instanceof Error ? error.cause.message : error.message;
    let message: string;

    if (error.phase === 'preflight') {
        message = `备份校验失败：${detail}`;
    } else if (error.rollbackSucceeded === false) {
        const recovery = error.snapshotDir ? `，恢复资料保留在 ${error.snapshotDir}` : '';
        message = `恢复失败，且自动回滚不完整。请勿重启或继续修改配置；事务 ID：${error.transactionId}${recovery}。请检查服务器日志。`;
    } else if (error.committed) {
        const retained = error.snapshotDir ? `，临时事务资料保留在 ${error.snapshotDir}` : '';
        message = `配置已恢复，但临时事务目录清理失败；重启后配置仍会生效。事务 ID：${error.transactionId}${retained}。请检查服务器日志。`;
    } else if (error.phase === 'cleanup') {
        const configState =
            error.rollbackSucceeded === true ? '当前配置已自动回滚' : '当前配置未改动';
        const retained = error.snapshotDir ? `，临时事务资料保留在 ${error.snapshotDir}` : '';
        message = `恢复失败，${configState}，但临时事务目录清理失败；事务 ID：${error.transactionId}${retained}。请检查服务器日志。`;
    } else if (error.rollbackSucceeded === true) {
        message = `恢复失败，当前配置已自动回滚。事务 ID：${error.transactionId}。请检查服务器日志。`;
    } else {
        message = `恢复失败，当前配置未改动。事务 ID：${error.transactionId}。请检查服务器日志。`;
    }

    return {
        status: error.phase === 'preflight' ? 400 : 500,
        body: {
            success: false,
            message,
            transactionId: error.transactionId,
            phase: error.phase,
            committed: error.committed,
            ...(error.rollbackSucceeded === undefined
                ? {}
                : { rollbackSucceeded: error.rollbackSucceeded }),
            ...(error.snapshotDir === undefined ? {} : { snapshotDir: error.snapshotDir }),
            failedFiles: error.failedFiles,
        },
    };
}

function isMissingPath(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Read one allowlisted config file; I/O failures other than absence are fatal. */
export function readBackupConfigFile(configDir: string, name: string): Buffer | null {
    try {
        return readFileSync(path.join(configDir, name));
    } catch (error) {
        if (isMissingPath(error)) {
            return null;
        }

        throw error;
    }
}

/** List per-account OneBot config candidates; an unreadable directory is fatal. */
export function listPerUinOneBotConfigFiles(configDir: string): string[] {
    try {
        return readdirSync(configDir).filter((name) => /^onebot_\d+\.json$/.test(name));
    } catch (error) {
        if (isMissingPath(error)) {
            return [];
        }

        throw error;
    }
}

export function registerSystemRoutes(app: Hono, deps: SystemRouteDependencies): void {
    const sampleCpuLoad = createCpuLoadSampler();

    app.get('/api/system', async (c) => {
        const cpus = os.cpus();
        const usage = sampleCpuLoad.sample();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const runtimeMemory = process.memoryUsage();
        return c.json({
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            archLabel: CACHED_ARCH_LABEL,
            release: os.release(),
            distro: CACHED_DISTRO,
            uptime: os.uptime(),
            processUptime: process.uptime(),
            nodeVersion: process.version,
            deployment: deploymentInfo({
                ...readRuntimeConfig(),
                ...resolveRuntimeEnvOverrides(process.env),
            }),
            cpu: {
                model: cpus[0]?.model ?? 'unknown',
                cores: cpus.length,
                speedMHz: cpus[0]?.speed ?? 0,
                loadAvg: os.loadavg(),
                perCore: usage,
                average: usage.length ? usage.reduce((s, v) => s + v, 0) / usage.length : 0,
            },
            memory: {
                total: totalMem,
                free: freeMem,
                used: usedMem,
                usagePercent: totalMem ? (usedMem / totalMem) * 100 : 0,
            },
            runtime: {
                pid: process.pid,
                lowIntegrity: hasLowProcessIntegrity(await getRuntimeIntegrity()),
                rss: runtimeMemory.rss,
                heapTotal: runtimeMemory.heapTotal,
                heapUsed: runtimeMemory.heapUsed,
                external: runtimeMemory.external,
                arrayBuffers: runtimeMemory.arrayBuffers,
            },
        });
    });

    // ── System settings (WebUI listener) — Wave A1 ──
    // Listener-level changes (port/host/TLS) are persisted but apply only on the
    // next restart. The panel surfaces which
    // fields are currently overridden by env so edits that won't take effect are
    // visible.
    const SYSTEM_CERT_PATH = path.join('config', 'cert.pem');
    const SYSTEM_KEY_PATH = path.join('config', 'key.pem');
    const hasCert = (): boolean => existsSync(SYSTEM_CERT_PATH) && existsSync(SYSTEM_KEY_PATH);

    app.get('/api/system/settings', (c) => {
        const disk = readRuntimeConfig();
        const overrides = resolveRuntimeEnvOverrides(process.env);
        const effective = { ...disk, ...overrides };
        const envOverrides = Object.keys(overrides);
        return c.json({
            settings: settingsView(disk),
            effective: {
                vncPort: effective.vncPort ?? 0,
                vncUrl: effective.vncUrl ?? '',
                hookAutoLoad: effective.hookAutoLoad === true,
            },
            hasCert: hasCert(),
            envOverrides, // field names currently pinned by NOWLUMA_* env vars
            listeningPort: deps.getBoundPort(),
            restartRequiredToApply: true,
        });
    });

    app.post('/api/system/settings', async (c) => {
        let body: unknown;

        try {
            body = await c.req.json();
        } catch {
            return c.json({ success: false, message: '请求格式错误' }, 400);
        }

        const coerced = coerceSettingsPatch(body);

        if (!coerced.ok) {
            return c.json({ success: false, message: coerced.error }, 400);
        }

        const evaluated = evaluateSettingsSave(
            readRuntimeConfig(),
            coerced.patch,
            resolveTlsContext('config').ok,
        );

        if (!evaluated.ok) {
            return c.json({ success: false, message: evaluated.error }, 400);
        }

        const saved = updateRuntimeConfig(evaluated.patch);
        return c.json({
            success: true,
            settings: settingsView(saved),
            restartRequiredToApply: true,
        });
    });

    app.post('/api/system/tls/cert', async (c) => {
        let body: unknown;

        try {
            body = await c.req.json();
        } catch {
            return c.json({ success: false, message: '请求格式错误' }, 400);
        }

        const cert = (body as { cert?: unknown }).cert;
        const key = (body as { key?: unknown }).key;

        if (typeof cert !== 'string' || typeof key !== 'string') {
            return c.json({ success: false, message: 'cert 和 key 必须为 PEM 字符串' }, 400);
        }

        const valid = validateTlsPair(cert, key);

        if (!valid.ok) {
            return c.json({ success: false, message: valid.reason }, 400);
        }

        try {
            mkdirSync('config', { recursive: true });
            writeFileSync(SYSTEM_CERT_PATH, cert.endsWith('\n') ? cert : cert + '\n', 'utf8');
            // Private key must not be world-readable (mirrors auth.ts's webui.json
            // 0600). writeFileSync's mode is ignored for an existing file, so chmod
            // explicitly afterwards.
            writeFileSync(SYSTEM_KEY_PATH, key.endsWith('\n') ? key : key + '\n', {
                encoding: 'utf8',
                mode: 0o600,
            });

            // Best-effort (mirrors auth.ts): the key is already written 0600 above, so
            // a rare chmod failure must not fail the request.
            try {
                chmodSync(SYSTEM_KEY_PATH, 0o600);
            } catch {
                /* best-effort */
            }
        } catch (err) {
            log.warn('write cert/key failed: %s', err instanceof Error ? err.message : String(err));
            return c.json({ success: false, message: '写入证书失败，请检查服务器日志' }, 500);
        }

        return c.json({ success: true, restartRequiredToApply: true });
    });

    app.delete('/api/system/tls/cert', (c) => {
        if (tlsCertDeletionBlocked(readRuntimeConfig().webuiTls?.enabled === true)) {
            return c.json({ success: false, message: '请先关闭 TLS 再删除证书' }, 400);
        }

        try {
            rmSync(SYSTEM_CERT_PATH, { force: true });
            rmSync(SYSTEM_KEY_PATH, { force: true });
        } catch (err) {
            log.warn(
                'remove cert/key failed: %s',
                err instanceof Error ? err.message : String(err),
            );
            return c.json({ success: false, message: '删除证书失败' }, 500);
        }

        return c.json({ success: true });
    });

    // ── Config backup / restore (Wave A2) ──
    app.get('/api/system/backup/export', (c) => {
        try {
            const includeCredentials = c.req.query('credentials') === '1';
            const ts = new Date().toISOString();
            const bundle = buildBackup(
                (name) => readBackupConfigFile('config', name),
                listPerUinOneBotConfigFiles('config'),
                { includeCredentials },
                ts,
            );
            c.header(
                'Content-Disposition',
                `attachment; filename="nowluma-backup-${ts.replace(/[:.]/g, '-')}.json"`,
            );
            // Bundle may carry the TLS private key / password hash — never cache it.
            c.header('Cache-Control', 'no-store, max-age=0');
            c.header('Pragma', 'no-cache');
            return c.json(bundle);
        } catch (error) {
            log.error(
                'backup export failed: %s',
                error instanceof Error ? (error.stack ?? error.message) : String(error),
            );
            return c.json({ success: false, message: '导出失败，请检查服务器日志' }, 500);
        }
    });

    app.post('/api/system/backup/import', async (c) => {
        const declaredLen = Number(c.req.header('content-length'));

        if (Number.isFinite(declaredLen) && declaredLen > 32 * 1024 * 1024) {
            return c.json({ success: false, message: '备份文件过大' }, 413);
        }

        let body: unknown;

        try {
            body = await c.req.json();
        } catch {
            return c.json({ success: false, message: '请求格式错误' }, 400);
        }

        if (typeof body !== 'object' || body === null) {
            return c.json({ success: false, message: '请求格式错误' }, 400);
        }

        const { backup, restoreCredentials } = body as {
            backup?: unknown;
            restoreCredentials?: unknown;
        };

        try {
            const result = restoreBackup(backup, {
                configDir: 'config',
                restoreCredentials: restoreCredentials === true,
            });
            return c.json({ success: true, ...result });
        } catch (err) {
            if (err instanceof RestoreTransactionError) {
                const failure = describeRestoreFailure(err);
                return c.json(failure.body, failure.status);
            }

            log.error(
                'backup import failed unexpectedly: %s',
                err instanceof Error ? (err.stack ?? err.message) : String(err),
            );
            return c.json({ success: false, message: '恢复遇到未预期错误，请检查服务器日志' }, 500);
        }
    });
}
