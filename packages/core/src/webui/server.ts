import { APP_VERSION } from '@nowluma/common/version';
import { serve } from '@hono/node-server';
import { resolveWebuiTarget } from '@nowluma/common/webui-target';
import { registerKernelRoutes } from '../kernel-routes';
import type { KernelPolicyStore } from '../kernel-policy';
import { registerStaticFrontend } from './static-frontend';
import type { HookManager, HookProcessInfo } from '@nowluma/bridge';
import {
    clearManagedLogs,
    configureFileTransport,
    getLogStorageStatus,
} from '@nowluma/common/log-file-transport';
import {
    createLogger,
    getLogLevel,
    getLogSnapshot,
    getRecentLogs,
    logInitialWebuiCredentials,
    LOG_LEVELS,
    setLogLevel,
    subscribeLogs,
} from '@nowluma/common/logger';
import {
    assertValidOneBotConfig,
    loadOneBotConfig,
    OneBotConfigValidationError,
    saveOneBotConfig,
} from '@nowluma/onebot/config';
import { loadGlobalSettings, saveGlobalSettings } from '@nowluma/onebot/global-config';
import type { OneBotManager } from '@nowluma/onebot/manager';
import { clearInactiveStreamStorage, snapshotStreamStorage } from '@nowluma/onebot/stream-storage';
import type { OneBotConfig } from '@nowluma/onebot/types';
import {
    readRuntimeConfig,
    updateRuntimeConfig,
    resolveRuntimeEnvOverrides,
} from '@nowluma/common/runtime';
import { randomBytes } from 'crypto';
import { createServer as createHttpsServer } from 'https';
import { Hono, type Context } from 'hono';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    clearDesktopSessionCookie,
    createDesktopGateway,
    setDesktopSessionCookie,
} from './desktop';
import { evaluatePasswordRules, isStrongPassword, WebuiAuth } from './auth';
import { completeWebuiLogin, invalidateOtherSessions } from './webui-login';
import {
    beginTotpEnrollment,
    confirmTotpEnrollment,
    decideSecondFactorLogin,
    regenerateRecoveryCodes,
} from './totp';
import {
    EULA_ACCEPT_ENV,
    getAgreementsPayload,
    isConsentRequired,
    loadAgreements,
    PRIVACY_ACCEPT_ENV,
    recordConsent,
    resolveEnvironmentConsent,
} from './consent';
import { requireTlsContext, resolveTlsContext } from './tls';
import { checkListenerExposure } from './listener-exposure';
import { createDroppingSender } from './debug-stream';
import { createSseResponder } from './sse-response';
import { WebuiSessions } from './sessions';
import { bindStateStream } from './state-stream';
import type { StateBus, StateResource } from './state-bus';
import { createConnectionPoller } from './connection-diff-loop';
import { comparableConnectionSnapshot } from './connection-snapshot';
import { traceAuthenticatedWebuiMutation } from './mutation-trace';
import { describeTrustProxy, makeClientIpResolver, parseTrustProxy } from './client-ip';
import {
    OneBotAccessTokenPolicyError,
    validateOneBotAccessTokenChanges,
} from './onebot-token-policy';
import { findAvailablePort } from './port';
import {
    clearBackgroundImage,
    loadUiConfig,
    MAX_BACKGROUND_BYTES,
    publicAppearance,
    readBackgroundImage,
    saveUiConfig,
    sniffImageMime,
    writeBackgroundImage,
} from './ui-config';
import { getUpdateInfo } from '../update/check';
import { createUpdateService } from '../update/service';
import { updateRoutes } from './update-routes';
import { buildFullTraceDownload } from './log-export';
import { loadNotificationsConfig, saveNotificationsConfig } from '../notifications/config';
import type { NotificationManager } from '../notifications/manager';
import { StorageManagementService } from './storage-management';
import { registerStorageRoutes } from './storage-routes';
import { registerSystemRoutes } from './system-routes';
import { registerDebugRoutes } from './debug-routes';
import { isRealUin } from '@nowluma/common/uin';
import { LogStorageSettingsManager } from './storage-settings';
import {
    clearAvatarSessionCookie,
    extractWebuiSessionToken,
    readAvatarSessionToken,
    registerLoginRequestSecurity,
    setAvatarSessionCookie,
    webuiSecurityHeaders,
} from './request-security';

const log = createLogger('WebUI');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export {
    describeRestoreFailure,
    listPerUinOneBotConfigFiles,
    readBackupConfigFile,
} from './system-routes';
export type { RestoreFailureBody } from './system-routes';

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const totpEnrollments = new Map<
    string,
    {
        secret: string;
        issuer: string;
        accountName: string;
        expiresAt: number;
    }
>();

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const TOTP_ENROLL_TTL_MS = 10 * 60 * 1000;
const DEFAULT_TOTP_ISSUER = 'Nowluma';
const AVATAR_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AVATAR_BROWSER_CACHE_SECONDS = 30 * 24 * 60 * 60;

// Endpoints that an auth-required-but-must-change-password session can still hit.
const MUST_CHANGE_ALLOWLIST = new Set([
    '/api/status',
    '/api/auth/state',
    '/api/auth/check-strength',
    '/api/auth/change-password',
    // Consent is collected AFTER login but BEFORE the forced password change, so
    // reading + recording it must be reachable while the session mustChangePassword.
    '/api/agreements',
    '/api/agreements/record-consent',
    '/api/logout',
]);

// Endpoints reachable while consent is still pending. Everything else is 403'd
// with consentRequired:true until the operator accepts — the same server-side
// enforcement pattern as MUST_CHANGE_ALLOWLIST, so the consent gate is real and
// not merely a frontend convention. Ordered BEFORE the must-change gate so a
// fresh install must consent first, then set its password.
const CONSENT_ALLOWLIST = new Set([
    '/api/status',
    '/api/auth/state',
    '/api/agreements',
    '/api/agreements/record-consent',
    '/api/logout',
]);

// uin = QQ number; 5–10 digits (real QQ UINs fit in uint32, max 4294967295).
// Used to construct config file paths, so anything else (path traversal, NUL
// bytes, timestamp-shaped hook garbage) is rejected by isRealUin.

const avatarCache = new Map<string, { body: Uint8Array; contentType: string; expiresAt: number }>();

function purgeExpiredTokens(sessionTokens: WebuiSessions) {
    const now = Date.now();

    for (const [token, info] of sessionTokens) {
        if (now > info.expiresAt) {
            sessionTokens.delete(token);
        }
    }

    for (const [ip, attempt] of loginAttempts) {
        if (now > attempt.resetAt) {
            loginAttempts.delete(ip);
        }
    }

    for (const [token, enrollment] of totpEnrollments) {
        if (now > enrollment.expiresAt) {
            totpEnrollments.delete(token);
        }
    }
}

function sanitizeTotpLabelPart(value: unknown, fallback: string): string {
    if (typeof value !== 'string') {
        return fallback;
    }

    const trimmed = value.replace(/[\r\n\t]/g, '').trim();

    if (!trimmed) {
        return fallback;
    }

    return trimmed.slice(0, 64);
}

function defaultTotpAccountName(): string {
    const host = os.hostname().trim();
    return host || 'admin';
}

async function fetchQqAvatar(uin: string): Promise<{ body: Uint8Array; contentType: string }> {
    const response = await fetch(`https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(uin)}&s=100`, {
        headers: {
            'User-Agent': 'Nowluma WebUI',
            Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
    });

    if (!response.ok) {
        throw new Error(`avatar upstream responded with ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const body = new Uint8Array(await response.arrayBuffer());
    return { body, contentType };
}

export async function initWebUI(
    desiredPort: number = 5099,
    oneBotManager: OneBotManager,
    hookManager?: HookManager,
    notificationManager?: NotificationManager,
    listener: {
        host?: string;
        tlsEnabled?: boolean;
        trustProxy?: string;
        stateBus?: StateBus;
        restart?: () => void;
        updateRoot?: string;
        kernelPolicy?: KernelPolicyStore;
    } = {},
): Promise<{ port: number; stop: () => Promise<void> }> {
    const webuiTarget = resolveWebuiTarget(process.env.NOWLUMA_WEBUI_TARGET);

    if (webuiTarget) {
        log.info(
            'presentation target enabled: %s (runtime override; saved appearance is preserved)',
            webuiTarget,
        );
    }

    const host = listener.host || '127.0.0.1';
    const tlsEnabled = listener.tlsEnabled === true;
    const bootCheck = checkListenerExposure({
        webuiHost: host,
        tlsEnabled,
        pairOk: resolveTlsContext('config').ok,
    });

    if (!bootCheck.ok) {
        const reason =
            bootCheck.code === 'invalid-bind-host'
                ? `bind host is not a valid TCP address: ${host}`
                : 'TLS is enabled but the certificate/private-key pair is unusable';
        throw new Error(`WebUI listener cannot start: ${reason}`);
    }

    // Resolve the client IP for per-IP rate limiting from the configured
    // trust-proxy directive (runtime.json `trustProxy`, env-overridable via
    // NOWLUMA_WEBUI_TRUST_PROXY which loadRuntimeConfig already merged in).
    // Default ('') = trust the TCP socket peer only (cannot be spoofed).
    const trustProxyMode = parseTrustProxy(listener.trustProxy);
    const getClientIp = makeClientIpResolver(trustProxyMode);
    // Security decisions must not silently turn an unreadable socket peer into
    // localhost. The regular resolver keeps its compatibility fallback for
    // rate-limit bucketing; this resolver fails closed with an empty address.
    const getSecurityClientIp = makeClientIpResolver(trustProxyMode, '');

    // Actual bound port (set just before serve; findAvailablePort may bump it).
    // Read by GET /api/system/settings so the panel shows what's really live.
    let boundPort = desiredPort;

    const auth = WebuiAuth.load();
    const initialPassword = auth.takeInitialPassword();

    if (auth.isDevMode()) {
        log.warn('dev mode enabled with the configured development credential');
        log.warn('dev mode skips config/webui.json and password rotation');
    } else if (initialPassword) {
        log.info('════════════════════════════════════════════════════════════════');
        log.info('  ★ WebUI 初始登录凭据 / Initial WebUI Credentials ★');
        log.info('  请立即登录并修改密码 —— 关闭程序后此密码无法找回。');
        log.info('  若跳过初始改密，下次启动将自动生成新的随机密码。');
        log.info('  Log in and change the password now; it will not be shown again.');
        log.info('────────────────────────────────────────────────────────────────');
        logInitialWebuiCredentials(initialPassword);
        log.info('════════════════════════════════════════════════════════════════');
    } else if (auth.mustChangePassword()) {
        log.warn('password change is still required');
    }

    log.info('login rate-limit keyed by: %s', describeTrustProxy(trustProxyMode));

    if (trustProxyMode.kind === 'all') {
        log.warn(
            'NOWLUMA_WEBUI_TRUST_PROXY=1 — only safe behind a reverse proxy that strips client-set X-Real-IP / X-Forwarded-For',
        );
    }

    // Memoized once at startup (agreements version is fixed per process; a text
    // change ships with a redeploy that restarts us). Flipped to false the moment
    // consent is recorded, so the middleware never touches disk per request.
    const environmentConsent = resolveEnvironmentConsent();
    let consentGatePending = isConsentRequired();

    if (environmentConsent.accepted) {
        log.info(
            'EULA/PRIVACY consent supplied by %s and %s (agreements version=%s)',
            EULA_ACCEPT_ENV,
            PRIVACY_ACCEPT_ENV,
            loadAgreements().version,
        );
    } else if (environmentConsent.eulaAccepted || environmentConsent.privacyAccepted) {
        log.warn(
            'partial environment consent ignored; set both %s=1 and %s=1 to accept the agreements',
            EULA_ACCEPT_ENV,
            PRIVACY_ACCEPT_ENV,
        );
    } else if (consentGatePending) {
        log.info('awaiting EULA/PRIVACY consent before the panel unlocks');
    }

    const app = new Hono();
    const sessionTokens = new WebuiSessions();
    const shutdownStreams = new AbortController();
    const sseResponse = createSseResponder(shutdownStreams.signal, (c, channel) =>
        sessionTokens.bindStream(c.get('sessionToken' as never) as string, channel),
    );
    app.use('*', webuiSecurityHeaders);
    registerLoginRequestSecurity(app);
    const storageManagement = new StorageManagementService({
        dataDir: 'data',
        getLogStatus: getLogStorageStatus,
        clearLogs: clearManagedLogs,
        temporary: {
            snapshot: snapshotStreamStorage,
            clearInactive: clearInactiveStreamStorage,
        },
        // Connection statuses include active and still-retiring generations.
        // A retiring instance may still hold SQLite handles after disappearing
        // from getInstances(), so it must continue to block destructive cleanup.
        listOnlineAccounts: () =>
            oneBotManager
                .getConnectionStatuses()
                .map((account) => ({ uin: account.uin, nickname: account.nickname })),
    });
    const logStorageSettings = new LogStorageSettingsManager({
        readPersisted: readRuntimeConfig,
        readEnvOverrides: () => resolveRuntimeEnvOverrides(process.env),
        readEffective: getLogStorageStatus,
        persist: updateRuntimeConfig,
        apply: configureFileTransport,
    });

    // ─── Anti-indexing ───────────────────────────────────────────────────────
    // The WebUI is an admin surface that has no business showing up in
    // search results — even the login page leaks the existence of a
    // Nowluma instance to anyone scanning the IP. Three overlapping
    // signals: a hard X-Robots-Tag on every response, a robots.txt for
    // crawlers that read it before pages, and a <meta robots> in the
    // SPA shell for the case where a proxy strips headers.
    app.use('*', async (c, next) => {
        await next();
        c.res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
    });

    app.get('/robots.txt', (c) => {
        c.res.headers.set('Content-Type', 'text/plain; charset=utf-8');
        return c.body('User-agent: *\nDisallow: /\n');
    });

    // ─── Auth middleware ─────────────────────────────────────────────────────
    app.use('/api/*', async (c, next) => {
        const reqPath = c.req.path;

        // `/api/ui/public` serves the cosmetic appearance subset to the
        // pre-auth login page, so it must skip the bearer check. It exposes
        // nothing sensitive (no layout, no secrets) — see ui-config.ts.
        if (
            reqPath === '/api/login' ||
            reqPath === '/api/ui/public' ||
            (c.req.method === 'GET' && reqPath === '/api/kernel/catalog')
        ) {
            return next();
        }

        const token = extractWebuiSessionToken(c.req.raw);

        if (!token) {
            return c.json({ status: 'failed', message: 'Unauthorized' }, 401);
        }

        const info = sessionTokens.get(token);

        if (!info) {
            return c.json({ status: 'failed', message: 'Token expired or invalid' }, 401);
        }

        // Consent gate (before the password gate): block everything outside the
        // consent allowlist until the operator has accepted the current agreements.
        // `consentGatePending` is memoized (see below) so this is a Set lookup, not
        // a disk read, on the hot path.
        if (consentGatePending && !CONSENT_ALLOWLIST.has(reqPath)) {
            return c.json(
                {
                    status: 'failed',
                    message: '请先阅读并同意用户协议与隐私政策',
                    consentRequired: true,
                },
                403,
            );
        }

        if (info.mustChangePassword && !MUST_CHANGE_ALLOWLIST.has(reqPath)) {
            return c.json(
                { status: 'failed', message: '请先修改密码', mustChangePassword: true },
                403,
            );
        }

        c.set('sessionToken' as never, token);
        c.res = await traceAuthenticatedWebuiMutation(c.req.raw, async () => {
            await next();
            return c.res;
        });
    });

    // The applied desktop capability is decided once at boot; the system routes
    // and the gateway guards read the same value.
    const desktopEnabled = process.env.NOWLUMA_DESKTOP_PROXY === '1';
    const desktop = createDesktopGateway(app, {
        enabled: desktopEnabled,
        sessionAllowed: (token) => {
            const session = sessionTokens.get(token);
            return !!session && !session.mustChangePassword && !consentGatePending;
        },
    });
    app.post('/api/desktop/session', (c) => {
        if (!desktopEnabled) {
            return c.json({ success: false, message: '桌面服务未启用' }, 404);
        }

        setDesktopSessionCookie(
            c,
            c.get('sessionToken' as never) as string,
            listener.tlsEnabled === true,
        );
        return c.json({ success: true, url: '/desktop/' });
    });

    // ─── Login ───────────────────────────────────────────────────────────────
    app.post('/api/login', async (c) => {
        const ip = getClientIp(c);
        const now = Date.now();
        const attempt = loginAttempts.get(ip);

        if (attempt && attempt.count >= LOGIN_MAX_ATTEMPTS && now < attempt.resetAt) {
            const waitSec = Math.ceil((attempt.resetAt - now) / 1000);
            return c.json({ success: false, message: `登录尝试过多，请 ${waitSec} 秒后重试` }, 429);
        }

        let body: unknown;

        try {
            body = await c.req.json();
        } catch {
            return c.json({ success: false, message: '请求格式错误' }, 400);
        }

        const result = completeWebuiLogin(auth, body, now);

        if (result.kind === 'bad-request') {
            return c.json({ success: false, message: '请求格式错误' }, 400);
        }

        if (result.kind === 'bad-password' || result.kind === 'bad-second-factor') {
            const current = loginAttempts.get(ip) ?? { count: 0, resetAt: now + LOGIN_LOCKOUT_MS };
            current.count += 1;

            if (current.count === 1) {
                current.resetAt = now + LOGIN_LOCKOUT_MS;
            }

            loginAttempts.set(ip, current);
            const message = result.kind === 'bad-second-factor' ? '验证码不正确' : '密码错误';
            return c.json({ success: false, message }, 401);
        }

        if (result.kind === 'needs-totp') {
            return c.json({ success: false, needsTotp: true });
        }

        loginAttempts.delete(ip);

        if (result.totpState) {
            try {
                auth.persistTotp(result.totpState);
            } catch (err) {
                log.warn(
                    'persist totp after login failed: %s',
                    err instanceof Error ? err.message : String(err),
                );
                return c.json({ success: false, message: '登录失败' }, 500);
            }
        }

        const token = randomBytes(32).toString('hex');
        sessionTokens.set(token, {
            expiresAt: now + TOKEN_TTL_MS,
            mustChangePassword: result.mustChangePassword,
        });
        setAvatarSessionCookie(c, token, listener.tlsEnabled === true);
        setDesktopSessionCookie(c, token, listener.tlsEnabled === true);
        return c.json({ success: true, token, mustChangePassword: result.mustChangePassword });
    });

    app.post('/api/logout', (c) => {
        const token = c.get('sessionToken' as never) as string | undefined;

        if (token) {
            sessionTokens.delete(token);
        }

        clearAvatarSessionCookie(c, listener.tlsEnabled === true);
        clearDesktopSessionCookie(c, listener.tlsEnabled === true);
        return c.json({ success: true });
    });

    app.get('/api/auth/state', (c) => {
        const token = c.get('sessionToken' as never) as string | undefined;
        const info = token ? sessionTokens.get(token) : undefined;
        return c.json({
            mustChangePassword: info?.mustChangePassword ?? auth.mustChangePassword(),
        });
    });

    app.post('/api/auth/check-strength', async (c) => {
        let body: { password?: unknown };

        try {
            body = await c.req.json();
        } catch {
            return c.json({ rules: evaluatePasswordRules(''), valid: false });
        }

        const pwd = typeof body.password === 'string' ? body.password : '';
        return c.json({ rules: evaluatePasswordRules(pwd), valid: isStrongPassword(pwd) });
    });

    app.post('/api/auth/change-password', async (c) => {
        let body: { oldPassword?: unknown; newPassword?: unknown };

        try {
            body = await c.req.json();
        } catch {
            return c.json({ success: false, message: '请求格式错误' }, 400);
        }

        const oldPassword = typeof body.oldPassword === 'string' ? body.oldPassword : '';
        const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

        if (!auth.verify(oldPassword)) {
            return c.json({ success: false, message: '当前密码不正确' }, 401);
        }

        if (!isStrongPassword(newPassword)) {
            return c.json(
                {
                    success: false,
                    message: '新密码不符合强度要求',
                    rules: evaluatePasswordRules(newPassword),
                },
                400,
            );
        }

        if (oldPassword === newPassword) {
            return c.json({ success: false, message: '新密码不得与旧密码相同' }, 400);
        }

        try {
            auth.setPassword(newPassword, oldPassword);
        } catch (err) {
            log.warn(
                'change password failed: %s',
                err instanceof Error ? err.message : String(err),
            );
            return c.json({ success: false, message: '密码修改失败' }, 400);
        }

        // Revoke the old token and every other session, then continue the
        // already-authenticated browser with a fresh token. The caller just
        // proved the old password (and any active second factor), so forcing
        // this browser through a second login would make the first-run wizard
        // unable to advance to its next authenticated step.
        sessionTokens.clear();
        const nextToken = randomBytes(32).toString('hex');
        sessionTokens.set(nextToken, {
            expiresAt: Date.now() + TOKEN_TTL_MS,
            mustChangePassword: false,
        });
        clearAvatarSessionCookie(c, listener.tlsEnabled === true);
        clearDesktopSessionCookie(c, listener.tlsEnabled === true);
        setAvatarSessionCookie(c, nextToken, listener.tlsEnabled === true);
        setDesktopSessionCookie(c, nextToken, listener.tlsEnabled === true);
        log.info('password updated; previous session and all other sessions invalidated');
        return c.json({ success: true, requireRelogin: false, token: nextToken });
    });

    const totpDisabledInDev = () => auth.isDevMode();

    app.get('/api/auth/totp', (c) => {
        if (totpDisabledInDev()) {
            return c.json({ success: false, message: '开发模式已禁用 2FA' }, 400);
        }

        return c.json(auth.totpStatus());
    });

    app.post('/api/auth/totp/begin', async (c) => {
        if (totpDisabledInDev()) {
            return c.json({ success: false, message: '开发模式已禁用 2FA' }, 400);
        }

        if (auth.totpEnabled()) {
            return c.json({ success: false, message: '2FA 已开启' }, 409);
        }

        const token = c.get('sessionToken' as never) as string;
        let body: Record<string, unknown> = {};

        try {
            const parsed = await c.req.json();

            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                body = parsed as Record<string, unknown>;
            }
        } catch {
            body = {};
        }

        const issuer = sanitizeTotpLabelPart(body.issuer, DEFAULT_TOTP_ISSUER);
        const accountName = sanitizeTotpLabelPart(body.accountName, defaultTotpAccountName());
        const now = Date.now();
        const existing = totpEnrollments.get(token);
        const secret = existing && existing.expiresAt > now ? existing.secret : undefined;
        const enrollment = beginTotpEnrollment({ issuer, accountName, secret });
        totpEnrollments.set(token, {
            secret: enrollment.secret,
            issuer,
            accountName,
            expiresAt: now + TOTP_ENROLL_TTL_MS,
        });
        return c.json({
            success: true,
            secret: enrollment.secret,
            otpauthUrl: enrollment.otpauthUrl,
            issuer: enrollment.issuer,
            accountName: enrollment.accountName,
        });
    });

    app.post('/api/auth/totp/confirm', async (c) => {
        if (totpDisabledInDev()) {
            return c.json({ success: false, message: '开发模式已禁用 2FA' }, 400);
        }

        if (auth.totpEnabled()) {
            return c.json({ success: false, message: '2FA 已开启' }, 409);
        }

        const token = c.get('sessionToken' as never) as string;
        let body: { password?: unknown; code?: unknown };

        try {
            body = await c.req.json();
        } catch {
            return c.json({ success: false, message: '请求格式错误' }, 400);
        }

        const password = typeof body.password === 'string' ? body.password : '';
        const code = typeof body.code === 'string' ? body.code : '';

        if (!auth.verify(password)) {
            return c.json({ success: false, message: '当前密码不正确' }, 401);
        }

        const pending = totpEnrollments.get(token);

        if (!pending || pending.expiresAt <= Date.now()) {
            totpEnrollments.delete(token);
            return c.json({ success: false, message: '请先开始绑定' }, 400);
        }

        try {
            const enabled = confirmTotpEnrollment({
                password,
                secret: pending.secret,
                code,
                label: `${pending.issuer} (${pending.accountName})`,
                atMs: Date.now(),
            });
            auth.persistTotp(enabled.state);
            totpEnrollments.delete(token);
            invalidateOtherSessions(sessionTokens, token);
            log.info('webui 2FA enabled; other sessions invalidated');
            return c.json({ success: true, recoveryCodes: enabled.recoveryCodes });
        } catch (err) {
            log.warn('totp confirm failed: %s', err instanceof Error ? err.message : String(err));
            return c.json({ success: false, message: '验证码不正确' }, 401);
        }
    });

    app.post('/api/auth/totp/disable', async (c) => {
        if (totpDisabledInDev()) {
            return c.json({ success: false, message: '开发模式已禁用 2FA' }, 400);
        }

        if (!auth.totpEnabled()) {
            return c.json({ success: false, message: '2FA 未开启' }, 400);
        }

        const token = c.get('sessionToken' as never) as string;
        let body: { password?: unknown; totp?: unknown; recoveryCode?: unknown };

        try {
            body = await c.req.json();
        } catch {
            return c.json({ success: false, message: '请求格式错误' }, 400);
        }

        const password = typeof body.password === 'string' ? body.password : '';

        if (!auth.verify(password)) {
            return c.json({ success: false, message: '当前密码不正确' }, 401);
        }

        const decision = decideSecondFactorLogin({
            totpEnabled: true,
            state: auth.totpState(),
            password,
            totp: typeof body.totp === 'string' ? body.totp : undefined,
            recoveryCode: typeof body.recoveryCode === 'string' ? body.recoveryCode : undefined,
            atMs: Date.now(),
        });

        if (decision.kind !== 'ok') {
            return c.json({ success: false, message: '验证码不正确' }, 401);
        }

        auth.persistTotp(undefined);
        totpEnrollments.delete(token);
        invalidateOtherSessions(sessionTokens, token);
        log.info('webui 2FA disabled; other sessions invalidated');
        return c.json({ success: true });
    });

    app.post('/api/auth/totp/recovery-codes', async (c) => {
        if (totpDisabledInDev()) {
            return c.json({ success: false, message: '开发模式已禁用 2FA' }, 400);
        }

        const state = auth.totpState();

        if (!state) {
            return c.json({ success: false, message: '2FA 未开启' }, 400);
        }

        let body: { password?: unknown; totp?: unknown };

        try {
            body = await c.req.json();
        } catch {
            return c.json({ success: false, message: '请求格式错误' }, 400);
        }

        const password = typeof body.password === 'string' ? body.password : '';
        const totp = typeof body.totp === 'string' ? body.totp : '';

        if (!auth.verify(password)) {
            return c.json({ success: false, message: '当前密码不正确' }, 401);
        }

        try {
            const next = regenerateRecoveryCodes({
                password,
                state,
                totp,
                atMs: Date.now(),
            });
            auth.persistTotp(next.state);
            log.info('webui 2FA recovery codes regenerated');
            return c.json({ success: true, recoveryCodes: next.recoveryCodes });
        } catch (err) {
            log.warn(
                'totp recovery regenerate failed: %s',
                err instanceof Error ? err.message : String(err),
            );
            return c.json({ success: false, message: '验证码不正确' }, 401);
        }
    });

    // ─── EULA / PRIVACY consent ──────────────────────────────────────────────
    // Both are bearer-gated (consent is collected AFTER login) and live in the
    // consent + must-change allowlists so they're reachable during onboarding.
    // The version is content-derived, so consent is stable across app upgrades
    // and re-prompted only when the agreement text itself changes.
    app.get('/api/agreements', (c) => c.json(getAgreementsPayload()));

    app.post('/api/agreements/record-consent', async (c) => {
        let body: { version?: unknown };

        try {
            body = await c.req.json();
        } catch {
            return c.json({ success: false, message: '请求格式错误' }, 400);
        }

        const version = typeof body.version === 'string' ? body.version : '';
        const current = loadAgreements().version;

        // Reject a stale/blank version so a client that read an older agreement set
        // can't record consent that the server would then treat as current.
        if (!version || version !== current) {
            return c.json(
                {
                    success: false,
                    message: '协议版本已更新，请刷新后重新确认',
                    currentVersion: current,
                },
                409,
            );
        }

        try {
            recordConsent(version);
        } catch (err) {
            log.warn('record consent failed: %s', err instanceof Error ? err.message : String(err));
            return c.json({ success: false, message: '保存失败，请检查服务器日志' }, 500);
        }

        consentGatePending = false; // unlock the rest of the API for this process
        log.info('agreements consent recorded (version=%s)', version);
        return c.json({ success: true, version });
    });

    // ─── Avatar proxy (uin validated) ────────────────────────────────────────
    app.get('/avatar/:uin', async (c) => {
        const sessionToken = readAvatarSessionToken(c);
        const session = sessionTokens.get(sessionToken);

        if (!session) {
            return c.text('unauthorized', 401);
        }

        const uin = c.req.param('uin');

        if (!isRealUin(uin)) {
            return c.text('invalid uin', 400);
        }

        const now = Date.now();
        let cached = avatarCache.get(uin);

        if (!cached || cached.expiresAt <= now) {
            try {
                const avatar = await fetchQqAvatar(uin);
                cached = { ...avatar, expiresAt: now + AVATAR_CACHE_TTL_MS };
                avatarCache.set(uin, cached);
            } catch (err) {
                log.warn(
                    'failed to proxy avatar for UIN %s: %s',
                    uin,
                    err instanceof Error ? err.message : String(err),
                );

                if (!cached) {
                    return c.text('avatar unavailable', 502);
                }
            }
        }

        return new Response(cached.body, {
            headers: {
                'Content-Type': cached.contentType,
                'Cache-Control': `private, max-age=${AVATAR_BROWSER_CACHE_SECONDS}, immutable`,
                Vary: 'Cookie',
            },
        });
    });

    // ─── Background image (unauth, like /avatar) ─────────────────────────────
    // The login page needs to render the operator's background before auth, so
    // this route is intentionally public. It only serves a file the operator
    // themselves uploaded. Cache-busting is via the `?v=` version the client
    // appends; the bytes for a given version are immutable.
    app.get('/ui-asset/background', (c) => {
        const asset = readBackgroundImage();

        if (!asset) {
            return c.text('no background', 404);
        }

        return new Response(new Uint8Array(asset.bytes), {
            headers: {
                'Content-Type': asset.mime,
                'Cache-Control': 'public, max-age=31536000, immutable',
                // Defence-in-depth: never let an uploaded blob be interpreted as
                // anything but the sniffed image type.
                'X-Content-Type-Options': 'nosniff',
            },
        });
    });

    // ─── Read-only API ───────────────────────────────────────────────────────
    app.get('/api/status', (c) => {
        // Refresh the path-scoped avatar cookie for a still-valid localStorage
        // session (for example after upgrading from a version without the cookie).
        const token = c.get('sessionToken' as never) as string;
        setAvatarSessionCookie(c, token, listener.tlsEnabled === true);
        return c.json({ status: 'running' });
    });

    const updater = await createUpdateService(
        listener.restart ? listener.updateRoot : undefined,
        APP_VERSION,
    );
    app.route(
        '/api/update',
        updateRoutes(updater, () => listener.restart?.()),
    );

    app.get('/api/update/check', async (c) => {
        const force = c.req.query('force') === 'true' || c.req.query('force') === '1';
        return c.json(await getUpdateInfo(force));
    });

    registerKernelRoutes(app, listener.kernelPolicy);
    registerSystemRoutes(app, { getBoundPort: () => boundPort, desktopEnabled });

    registerStorageRoutes(app, {
        storage: storageManagement,
        settings: logStorageSettings,
        audit: (event) => {
            log.info(
                'storage cleanup scope=%s accountScope=%s category=%s uin=%s deletedFiles=%d freedBytes=%d failures=%d',
                event.scope,
                event.accountScope,
                event.category ?? '-',
                event.uin ?? '-',
                event.deletedFiles,
                event.freedBytes,
                event.failureCount,
            );
        },
        reportError: (operation, error) => {
            log.error(
                '%s failed: %s',
                operation,
                error instanceof Error ? (error.stack ?? error.message) : String(error),
            );
        },
    });

    registerDebugRoutes(app, {
        manager: oneBotManager,
        sseResponse,
    });

    app.get('/api/qq-list', (c) => {
        const instances = oneBotManager.getInstances();
        const list = instances.map((inst) => ({ uin: inst.uin, nickname: inst.nickname }));
        return c.json({ list });
    });

    // Live OneBot adapter health per account (listening / connected / client
    // counts / last-delivery), powering the dashboard's connection card.
    app.get('/api/connections', (c) => {
        return c.json({ list: oneBotManager.getConnectionStatuses() });
    });

    // Combined SSE feed for the dashboard's three live resources — processes,
    // qq-list, connections. Replaces the 3s REST polling tick in
    // app-layout.tsx; the REST endpoints above stay for the initial fetch
    // before SSE connects and for the slow (30s) reconciliation fallback.
    //
    // On connect: one frame per resource with the current snapshot. After
    // that: a fresh snapshot per resource only when the StateBus signals a
    // change (HookSession status-changed, BridgeManager session edges, the
    // connection-status diff loop). 50ms per-resource debounce coalesces a
    // burst (e.g. multiple HookSessions flipping status simultaneously).
    const stateBus = listener.stateBus;
    const subscribeConnections =
        stateBus &&
        createConnectionPoller({
            bus: stateBus,
            getSnapshot: () => oneBotManager.getConnectionStatuses(),
            pickComparable: comparableConnectionSnapshot,
        });
    app.get('/api/state/stream', (c) => {
        if (!stateBus || !subscribeConnections) {
            // Build without state-wiring (e.g. a future headless mode) — clients
            // fall back to the REST endpoints. Treat as endpoint-not-here.
            return c.text('state stream not configured', 503);
        }

        const liveBus = stateBus;
        return sseResponse(c, (ch) => {
            ch.onClose(subscribeConnections());
            const send = createDroppingSender(ch);

            send({ kind: 'ready' });

            const handle = bindStateStream({
                bus: liveBus,
                snapshot: async (resource: StateResource): Promise<unknown> => {
                    if (resource === 'processes') {
                        if (!hookManager) {
                            return [];
                        }

                        return hookManager.listProcesses();
                    }

                    if (resource === 'qq-list') {
                        return oneBotManager
                            .getInstances()
                            .map((inst) => ({ uin: inst.uin, nickname: inst.nickname }));
                    }

                    return oneBotManager.getConnectionStatuses();
                },
                send: (frame) => send(frame),
                debounceMs: 50,
            });
            ch.onClose(() => handle.dispose());
            // Prime with the initial snapshot; if the client never sees the
            // bus publish (idle system) it still has the current state.
            void handle.sendAllInitial();
        });
    });

    app.get('/api/logs', (c) => {
        const limit = Number(c.req.query('limit') ?? 300);
        return c.json({ list: getRecentLogs(limit) });
    });

    app.get('/api/logs/export/trace', (c) => {
        const exportedAt = new Date().toISOString();
        const download = buildFullTraceDownload(getLogSnapshot(), {
            version: APP_VERSION,
            operatingSystem: os.platform(),
            architecture: os.arch(),
            nodeVersion: process.version,
            logLevel: getLogLevel(),
            exportedAt,
        });

        for (const [name, value] of Object.entries(download.headers)) {
            c.header(name, value);
        }

        return c.body(download.body);
    });

    app.get('/api/logs/level', (c) => {
        return c.json({ level: getLogLevel(), levels: [...LOG_LEVELS] });
    });

    app.post('/api/logs/level', async (c) => {
        const body = (await c.req.json().catch(() => null)) as { level?: unknown } | null;
        const next = typeof body?.level === 'string' ? body.level : '';

        if (!setLogLevel(next)) {
            return c.json({ message: `invalid level: ${next}`, levels: [...LOG_LEVELS] }, 400);
        }

        log.info('console log level set to %s via WebUI', getLogLevel());
        return c.json({ level: getLogLevel(), levels: [...LOG_LEVELS] });
    });

    app.get('/api/logs/stream', (c) =>
        sseResponse(c, (ch) => {
            ch.send({ type: 'ready' });
            ch.onClose(subscribeLogs((entry) => ch.send(entry)));
        }),
    );

    app.get('/api/processes', async (c) => {
        if (!hookManager) {
            return c.json({ list: [] });
        }

        try {
            return c.json({ list: await hookManager.listProcesses() });
        } catch (err) {
            return c.json(
                { list: [], message: err instanceof Error ? err.message : String(err) },
                500,
            );
        }
    });

    // Per-process action handler. The three routes below differ only in
    // which HookManager method they call.
    const MAX_PID = 4_194_304;

    function processAction(label: string, action: (pid: number) => Promise<HookProcessInfo>) {
        return async (c: Context) => {
            if (!hookManager) {
                return c.json({ success: false, message: 'hook manager is not available' }, 503);
            }

            const pid = Number(c.req.param('pid'));

            if (!Number.isInteger(pid) || pid <= 0 || pid > MAX_PID) {
                return c.json({ success: false, message: 'invalid pid' }, 400);
            }

            try {
                const processInfo = await action(pid);
                return c.json({ success: processInfo.status !== 'error', process: processInfo });
            } catch (err) {
                log.warn(
                    '%s pid=%d failed: %s',
                    label,
                    pid,
                    err instanceof Error ? err.message : String(err),
                );
                return c.json({ success: false, message: '操作失败，请检查服务器日志' }, 500);
            }
        };
    }

    app.post(
        '/api/processes/:pid/load',
        processAction('load', (pid) => hookManager!.loadProcess(pid)),
    );
    app.post(
        '/api/processes/:pid/unload',
        processAction('unload', (pid) => hookManager!.unloadProcess(pid)),
    );
    app.post(
        '/api/processes/:pid/refresh',
        processAction('refresh', (pid) => hookManager!.refreshProcess(pid)),
    );

    app.get('/api/config/:uin', (c) => {
        const uin = c.req.param('uin');

        if (!isRealUin(uin)) {
            return c.json({ message: 'invalid uin' }, 400);
        }

        // Read-only: never write defaults to disk on a GET. The persisted
        // file is created when manager.onSessionStarted boots an instance
        // or when the operator POSTs from this very endpoint.
        const config = loadOneBotConfig(uin);
        return c.json({ config });
    });

    app.post('/api/config/:uin', async (c) => {
        const uin = c.req.param('uin');

        if (!isRealUin(uin)) {
            return c.json({ success: false, message: 'invalid uin' }, 400);
        }

        let body: unknown;

        try {
            body = await c.req.json();
        } catch {
            return c.json(
                { success: false, saved: false, applied: false, message: '请求格式错误' },
                400,
            );
        }

        let nextConfig: OneBotConfig;

        try {
            assertValidOneBotConfig(body);
            nextConfig = body;

            let previousConfig: OneBotConfig | null = null;

            try {
                previousConfig = loadOneBotConfig(uin);
            } catch (err) {
                // A damaged existing file must not strand the recovery UI. Treat the
                // submitted endpoints as new, apply the full policy, and let the
                // subsequent atomic save either repair the file or fail visibly.
                log.warn(
                    'could not read prior OneBot config for uin=%s before save: %s',
                    uin,
                    err instanceof Error ? err.message : String(err),
                );
            }

            validateOneBotAccessTokenChanges(previousConfig, nextConfig, {
                clientIp: getSecurityClientIp(c),
                uin,
            });
            saveOneBotConfig(uin, nextConfig);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);

            if (
                err instanceof OneBotConfigValidationError ||
                err instanceof OneBotAccessTokenPolicyError
            ) {
                log.warn('reject invalid config for uin=%s: %s', uin, message);
                return c.json({ success: false, saved: false, applied: false, message }, 400);
            }

            log.error('persist config for uin=%s failed: %s', uin, message);
            return c.json(
                {
                    success: false,
                    saved: false,
                    applied: false,
                    message: '配置保存失败，请检查服务器日志',
                },
                500,
            );
        }

        try {
            // Apply the exact validated value that was persisted above. Re-reading
            // the path here would race concurrent POSTs (request A could load B and
            // falsely report that A was applied).
            const apply = await oneBotManager.reloadConfig(uin, nextConfig);
            const message = !apply.online
                ? '配置保存成功，当前会话未在线，将在下次连接时生效。'
                : apply.applied
                  ? '配置保存成功，已热重载当前会话。'
                  : '配置已保存，但部分网络节点未能应用；旧节点已尽力恢复，请查看错误详情。';
            log.info(
                'Updated OneBot config for UIN=%s saved=true online=%s applied=%s failures=%d',
                uin,
                String(apply.online),
                String(apply.applied),
                apply.errors.length,
            );
            return c.json({
                success: true,
                saved: true,
                applied: apply.applied,
                online: apply.online,
                errors: apply.errors,
                adapters: apply.adapters,
                config: body,
                // Legacy compatibility: this field used to mean "a live instance was
                // asked to reload". It now only claims success after the awaitable
                // reconcile actually completed.
                reloaded: apply.online && apply.applied,
                message,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error('config saved but apply crashed for uin=%s: %s', uin, message);
            return c.json({
                success: true,
                saved: true,
                applied: false,
                online: oneBotManager.getInstance(uin) !== null,
                reloaded: false,
                errors: [{ name: 'network-manager', phase: 'reload', message, at: Date.now() }],
                config: body,
                message: '配置已保存，但热重载失败，请检查服务器日志。',
            });
        }
    });

    // ─── Notifications (account up/down → webhook) ───────────────────────────
    // Global channel store (config/notifications.json); per-UIN opt-in lives in
    // OneBotConfig.notifications.channelIds. All bearer-gated — channel URLs can
    // embed secrets, so none of this is exposed unauthenticated.
    app.get('/api/notifications/config', (c) => c.json({ config: loadNotificationsConfig() }));

    app.post('/api/notifications/config', async (c) => {
        const declaredLen = Number(c.req.header('content-length'));

        if (Number.isFinite(declaredLen) && declaredLen > 512 * 1024) {
            return c.json({ success: false, message: '配置过大' }, 413);
        }

        let body: unknown;

        try {
            body = await c.req.json();
        } catch {
            return c.json({ success: false, message: '请求格式错误' }, 400);
        }

        try {
            const config = saveNotificationsConfig(body);
            return c.json({ success: true, config });
        } catch (err) {
            log.warn(
                'save notifications config failed: %s',
                err instanceof Error ? err.message : String(err),
            );
            return c.json({ success: false, message: '保存失败，请检查服务器日志' }, 500);
        }
    });

    app.get('/api/notifications/recent', (c) => {
        if (!notificationManager) {
            return c.json({ recent: [] });
        }

        const limitRaw = Number(c.req.query('limit'));
        const limit =
            Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 100) : 100;
        return c.json({ recent: notificationManager.getRecent(limit) });
    });

    app.post('/api/notifications/test', async (c) => {
        if (!notificationManager) {
            return c.json({ success: false, message: '通知子系统不可用' }, 503);
        }

        let body: { channelId?: unknown };

        try {
            body = await c.req.json();
        } catch {
            return c.json({ success: false, message: '请求格式错误' }, 400);
        }

        const channelId = typeof body.channelId === 'string' ? body.channelId : '';

        if (!channelId) {
            return c.json({ success: false, message: '缺少 channelId' }, 400);
        }

        const result = await notificationManager.testSend(channelId);

        if (!result.found) {
            return c.json({ success: false, message: '渠道不存在' }, 404);
        }

        return c.json({
            success: result.ok,
            status: result.status,
            message: result.ok
                ? '测试发送成功'
                : `测试发送失败：${result.error ?? (result.status ? `HTTP ${result.status}` : '未知错误')}`,
        });
    });

    // ─── Global deployment config (config/nowluma.json) ─────────────────────
    // All-accounts Nowluma knobs (rkey fallback servers + musicSignUrl). Saving
    // section-merges + normalizes server-side, then hot-reloads every instance.
    app.get('/api/global-config', (c) => c.json({ config: loadGlobalSettings() }));

    app.post('/api/global-config', async (c) => {
        const declaredLen = Number(c.req.header('content-length'));

        if (Number.isFinite(declaredLen) && declaredLen > 512 * 1024) {
            return c.json({ success: false, message: '配置过大' }, 413);
        }

        let body: unknown;

        try {
            body = await c.req.json();
        } catch {
            return c.json({ success: false, message: '请求格式错误' }, 400);
        }

        try {
            const config = saveGlobalSettings(body);
            oneBotManager.reloadGlobalSettings();
            return c.json({ success: true, config });
        } catch (err) {
            log.warn(
                'save global config failed: %s',
                err instanceof Error ? err.message : String(err),
            );

            if (err instanceof RangeError) {
                return c.json({ success: false, message: err.message }, 400);
            }

            return c.json({ success: false, message: '保存失败，请检查服务器日志' }, 500);
        }
    });

    // ─── WebUI customization config (config/ui.json) ─────────────────────────
    // Appearance (A) + layout (C). The full config is bearer-gated; only the
    // cosmetic appearance subset is exposed unauthenticated for the login page.
    app.get('/api/ui', (c) => c.json({ config: loadUiConfig() }));

    app.get('/api/ui/public', (c) => c.json({ appearance: publicAppearance() }));

    app.post('/api/ui', async (c) => {
        // Reject oversized bodies before buffering — the normalizer caps individual
        // fields (customCss 50KB, per-widget config 4KB) but not the whole payload.
        const declaredLen = Number(c.req.header('content-length'));

        if (Number.isFinite(declaredLen) && declaredLen > 256 * 1024) {
            return c.json({ success: false, message: '配置过大' }, 413);
        }

        let body: unknown;

        try {
            body = await c.req.json();
        } catch {
            return c.json({ success: false, message: '请求格式错误' }, 400);
        }

        try {
            const config = saveUiConfig(body);
            return c.json({ success: true, config });
        } catch (err) {
            log.warn('save ui.json failed: %s', err instanceof Error ? err.message : String(err));
            return c.json({ success: false, message: '保存失败，请检查服务器日志' }, 400);
        }
    });

    app.post('/api/ui/background', async (c) => {
        // Early reject by Content-Length BEFORE parseBody() buffers the whole
        // multipart body into memory — otherwise a multi-GB upload is fully
        // materialized before the post-parse size check fires. The slack covers
        // the multipart envelope (boundary + part headers); the exact decoded
        // size is still enforced below. A chunked request with no Content-Length
        // skips this coarse guard, but the endpoint is bearer-gated to the single
        // admin, so that residual is acceptable.
        const declaredLen = Number(c.req.header('content-length'));

        if (Number.isFinite(declaredLen) && declaredLen > MAX_BACKGROUND_BYTES + 1024 * 1024) {
            return c.json({ success: false, message: '图片过大（上限 5MB）' }, 413);
        }

        let file: unknown;

        try {
            const form = await c.req.parseBody();
            file = form['file'];
        } catch {
            return c.json({ success: false, message: '上传解析失败' }, 400);
        }

        if (!(file instanceof File)) {
            return c.json({ success: false, message: '缺少图片文件' }, 400);
        }

        if (file.size > MAX_BACKGROUND_BYTES) {
            return c.json({ success: false, message: '图片过大（上限 5MB）' }, 413);
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        const mime = sniffImageMime(bytes);

        if (!mime) {
            return c.json({ success: false, message: '仅支持 PNG / JPEG / WebP 图片' }, 415);
        }

        try {
            const config = writeBackgroundImage(bytes, mime);
            return c.json({ success: true, config });
        } catch (err) {
            log.warn(
                'write background image failed: %s',
                err instanceof Error ? err.message : String(err),
            );
            return c.json({ success: false, message: '保存图片失败，请检查服务器日志' }, 500);
        }
    });

    app.delete('/api/ui/background', (c) => {
        try {
            const config = clearBackgroundImage();
            return c.json({ success: true, config });
        } catch (err) {
            log.warn(
                'clear background image failed: %s',
                err instanceof Error ? err.message : String(err),
            );
            return c.json({ success: false, message: '删除图片失败' }, 500);
        }
    });

    // ─── Static frontend ─────────────────────────────────────────────────────
    // Build path is relative to the bundled / dev __dirname. SPA fallback to
    // index.html so client-side routes (if any) keep working.
    const staticRoot = path.resolve(__dirname, 'client');
    registerStaticFrontend(app, staticRoot, webuiTarget);

    const finalPort = await findAvailablePort(desiredPort, { host });

    if (finalPort !== desiredPort) {
        log.warn('port %d is in use, using %d instead', desiredPort, finalPort);
    }

    boundPort = finalPort;

    // TLS is an explicit transport promise. Once enabled, an unusable pair must
    // abort startup instead of silently exposing the listener over plaintext.
    let tlsServe:
        | { createServer: typeof createHttpsServer; serverOptions: { cert: Buffer; key: Buffer } }
        | undefined;
    let scheme = 'http';

    if (listener.tlsEnabled) {
        const tls = requireTlsContext('config');
        tlsServe = { createServer: createHttpsServer, serverOptions: tls };
        scheme = 'https';
    }

    const listeningServer = await new Promise<ReturnType<typeof serve>>((resolve) => {
        const server = serve(
            { fetch: app.fetch, port: finalPort, hostname: host, ...(tlsServe ?? {}) },
            (info) => {
                log.info(`listening ${scheme}://${host}:${info.port}`);
                resolve(server);
            },
        );
    });
    desktop.attach(listeningServer as import('node:http').Server);
    const tokenJanitor = setInterval(() => purgeExpiredTokens(sessionTokens), 60_000);
    tokenJanitor.unref();
    return {
        port: finalPort,
        async stop() {
            clearInterval(tokenJanitor);
            shutdownStreams.abort();
            sessionTokens.clear();
            desktop.stop();
            await new Promise<void>((resolve, reject) => {
                listeningServer.close((err) => (err ? reject(err) : resolve()));
            });
        },
    };
}
