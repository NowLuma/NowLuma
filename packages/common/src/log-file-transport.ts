import { errorMessage } from './errors';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeLogLine } from './log-sanitize';
import {
    LogQuota,
    QUOTA_RETRY_MS,
    reportStorageError,
    todayString,
    type LogCleanupResult,
    type LogStoragePolicy,
    type LogStorageStatus,
} from './log-storage';
import { MAX_LOG_RETAIN_DAYS, MAX_LOG_TOTAL_MB } from './runtime';

export type {
    LogCleanupResult,
    LogStoragePolicy,
    LogStorageState,
    LogStorageStatus,
} from './log-storage';

const DEFAULT_DIR = 'logs';
const DEFAULT_MAX_MB = 50;
const DEFAULT_MAX_TOTAL_MB = 1024;
const DEFAULT_RETAIN_DAYS = 7;
const FILE_PREFIX = 'nowluma-';
const FILE_SUFFIX = '.log';

function parseNonNegativeInt(
    value: string | undefined,
    fallback: number,
    max: number,
    field?: string,
): number {
    if (value === undefined || value.trim() === '') {
        return fallback;
    }

    const parsed = Number(value.trim());

    if (Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= max) {
        return parsed;
    }

    if (field) {
        throw new RangeError(`${field} must be an integer in 0..${String(max)}`);
    }

    return fallback;
}

function parseRequiredPositiveInt(
    value: string | undefined,
    fallback: number,
    max: number,
    field: string,
): number {
    if (value === undefined || value.trim() === '') {
        return fallback;
    }

    const parsed = Number(value.trim());

    if (Number.isSafeInteger(parsed) && parsed > 0 && parsed <= max) {
        return parsed;
    }

    throw new RangeError(`${field} must be an integer in 1..${String(max)}`);
}

function parseRequiredBool(value: string | undefined, fallback: boolean, field: string): boolean {
    if (value === undefined || value.trim() === '') {
        return fallback;
    }

    const normalized = value.trim().toLowerCase();

    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
    }

    throw new TypeError(`${field} must be a boolean`);
}

interface OpenFile {
    stream: fs.WriteStream;
    bytes: number;
    date: string;
    splitIndex: number;
    path: string;
}

/**
 * Owns one output directory: keeps at most one open WriteStream, handles
 * daily rollover and the per-file size cap. Retention and total-tree quota
 * belong to the shared LogQuota, never to each writer independently.
 */
class FileWriter {
    private disabled = false;
    private file: OpenFile | null = null;
    private readonly pendingCloses = new Set<Promise<void>>();

    constructor(
        private readonly dir: string,
        private readonly maxBytes: number,
        private readonly quota: LogQuota,
    ) {
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (err) {
            this.disabled = true;
            this.quota.storageFailed(`failed to create log directory ${dir}`, err);
            return;
        }
    }

    get isDisabled(): boolean {
        return this.disabled;
    }

    get currentPath(): string | null {
        return this.file?.path ?? null;
    }

    async prepare(): Promise<void> {
        this.ensureForToday(todayString());
        const stream = this.file?.stream;

        if (!stream) {
            throw new Error(`failed to prepare log writer in ${this.dir}`);
        }

        await new Promise<void>((resolve, reject) => {
            const opened = () => {
                stream.off('error', failed);
                resolve();
            };

            const failed = (error: Error) => {
                stream.off('open', opened);
                reject(error);
            };

            stream.once('open', opened);
            stream.once('error', failed);
        });
    }

    write(data: string, bytes: number): boolean {
        if (this.disabled) {
            return false;
        }

        const today = todayString();
        this.ensureForToday(today);

        if (!this.file) {
            return false;
        }

        if (this.file.bytes + bytes > this.maxBytes && this.file.bytes > 0) {
            this.rotateBySize();

            if (!this.file) {
                return false;
            }
        }

        if (!this.quota.reserve(this.file.path, bytes)) {
            return false;
        }

        try {
            this.file.stream.write(data);
        } catch (error) {
            this.disabled = true;
            this.quota.writeFailed(this.file.path, error);
            return false;
        }

        this.file.bytes += bytes;
        return true;
    }

    async close(): Promise<void> {
        this.closeCurrent();
        await Promise.all(this.pendingCloses);
    }

    private ensureForToday(today: string): void {
        if (this.file && this.file.date === today) {
            return;
        }

        if (this.file) {
            this.closeCurrent();
        }

        // Resume from the highest existing split index for today (so two
        // process starts on the same day share files / don't clobber).
        let idx = 0;

        while (fs.existsSync(this.pathFor(today, idx + 1))) {
            idx++;
        }

        this.file = this.openFile(today, idx);
    }

    private rotateBySize(): void {
        if (!this.file) {
            return;
        }

        const date = this.file.date;
        const previousIndex = this.file.splitIndex;
        this.closeCurrent();
        let next = previousIndex + 1;

        while (fs.existsSync(this.pathFor(date, next))) {
            next++;
        }

        this.file = this.openFile(date, next);
    }

    private closeCurrent(): void {
        const file = this.file;
        this.file = null;

        if (!file) {
            return;
        }

        let finish!: () => void;
        const closed = new Promise<void>((resolve) => {
            let settled = false;

            finish = () => {
                if (settled) {
                    return;
                }

                settled = true;
                this.quota.deactivate(file.path);
                resolve();
            };
        });
        this.pendingCloses.add(closed);
        void closed.finally(() => this.pendingCloses.delete(closed));

        file.stream.once('error', finish);

        try {
            file.stream.end(finish);
        } catch (error) {
            this.quota.writeFailed(file.path, error);
            finish();
        }
    }

    private openFile(date: string, splitIndex: number): OpenFile | null {
        const p = this.pathFor(date, splitIndex);
        const existingBytes = this.quota.activate(p);

        if (existingBytes === null) {
            return null;
        }

        try {
            const stream = fs.createWriteStream(p, { flags: 'a' });
            stream.on('error', (err) => {
                this.disabled = true;

                if (this.file?.stream === stream) {
                    this.file = null;
                }

                this.quota.deactivate(p);
                this.quota.writeFailed(p, err);
            });
            return { stream, bytes: existingBytes, date, splitIndex, path: p };
        } catch (err) {
            this.disabled = true;
            this.quota.deactivate(p);
            this.quota.storageFailed(`failed to open log file ${p}`, err);
            return null;
        }
    }

    private pathFor(date: string, splitIndex: number): string {
        const tail = splitIndex > 0 ? `.${splitIndex}` : '';
        return path.join(this.dir, `${FILE_PREFIX}${date}${tail}${FILE_SUFFIX}`);
    }
}

export class FileTransport {
    private readonly dir: string;
    private readonly maxBytes: number;
    private maxTotalBytes: number;
    private retainDays: number;
    private readonly enabled: boolean;
    private perUinEnabled: boolean;
    private initializationError: string | null = null;
    private nextWriterRetryAt = 0;
    private quota: LogQuota | null = null;
    private shared: FileWriter | null = null;
    private perUin = new Map<number, FileWriter>();

    constructor(policy?: LogStoragePolicy) {
        if (policy) {
            validatePolicy(policy);
        }

        this.dir = path.resolve(process.env.NOWLUMA_LOG_DIR || DEFAULT_DIR);
        this.maxBytes =
            parseRequiredPositiveInt(
                process.env.NOWLUMA_LOG_MAX_MB,
                DEFAULT_MAX_MB,
                MAX_LOG_TOTAL_MB,
                'NOWLUMA_LOG_MAX_MB',
            ) *
            1024 *
            1024;
        this.maxTotalBytes =
            (policy?.maxTotalMb ??
                parseRequiredPositiveInt(
                    process.env.NOWLUMA_LOG_MAX_TOTAL_MB,
                    DEFAULT_MAX_TOTAL_MB,
                    MAX_LOG_TOTAL_MB,
                    'NOWLUMA_LOG_MAX_TOTAL_MB',
                )) *
            1024 *
            1024;
        this.retainDays =
            policy?.retainDays ??
            parseNonNegativeInt(
                process.env.NOWLUMA_LOG_RETAIN_DAYS,
                DEFAULT_RETAIN_DAYS,
                MAX_LOG_RETAIN_DAYS,
                'NOWLUMA_LOG_RETAIN_DAYS',
            );
        this.enabled = process.env.NOWLUMA_LOG_FILE !== '0';
        this.perUinEnabled =
            policy?.perUinEnabled ??
            parseRequiredBool(process.env.NOWLUMA_LOG_PER_UIN, false, 'NOWLUMA_LOG_PER_UIN');

        if (this.enabled) {
            this.initialize();
        }
    }

    /** True when no file output will happen (env disable or init failure). */
    get isDisabled(): boolean {
        return !this.shared;
    }

    /** Current shared-file path (or null if disabled / not yet opened). */
    get currentPath(): string | null {
        return this.shared?.currentPath ?? null;
    }

    /** Path of the per-UIN file for the given UIN, if open. */
    perUinPath(uin: number): string | null {
        return this.perUin.get(uin)?.currentPath ?? null;
    }

    getStorageStatus(): LogStorageStatus {
        if (!this.quota) {
            return {
                state: 'disabled',
                directory: this.dir,
                totalBytes: 0,
                maxTotalBytes: this.maxTotalBytes,
                retainDays: this.retainDays,
                perUinEnabled: this.perUinEnabled,
                fileCount: 0,
                activeFileCount: 0,
                droppedLines: 0,
                ...(this.initializationError ? { lastError: this.initializationError } : {}),
            };
        }

        return {
            ...this.quota.snapshot(),
            directory: this.dir,
            maxTotalBytes: this.maxTotalBytes,
            retainDays: this.retainDays,
            perUinEnabled: this.perUinEnabled,
        };
    }

    async updatePolicy(policy: LogStoragePolicy): Promise<LogStorageStatus> {
        validatePolicy(policy);
        this.maxTotalBytes = policy.maxTotalMb * 1024 * 1024;
        this.retainDays = policy.retainDays;

        const disablingPerUin = this.perUinEnabled && !policy.perUinEnabled;
        this.perUinEnabled = policy.perUinEnabled;

        if (disablingPerUin) {
            const writers = [...this.perUin.values()];
            this.perUin.clear();
            await Promise.all(writers.map((writer) => writer.close()));
        }

        if (this.quota) {
            this.quota.updatePolicy(this.maxTotalBytes, this.retainDays);
        }

        if (this.enabled && (!this.quota || !this.shared || this.shared.isDisabled)) {
            await this.recoverSharedWriter(true);
        }

        return this.getStorageStatus();
    }

    async clearManagedLogs(): Promise<LogCleanupResult> {
        if (!this.enabled) {
            return this.clearLogsWhileDisabled();
        }

        if (!this.quota) {
            try {
                this.quota = new LogQuota(this.dir, this.maxTotalBytes, this.retainDays);
            } catch (error) {
                this.recordWriterRecoveryFailure(error);
            }
        }

        if (!this.quota) {
            return {
                deletedFiles: 0,
                freedBytes: 0,
                failures: this.initializationError
                    ? [{ file: '.', message: this.initializationError }]
                    : [],
                status: this.getStorageStatus(),
            };
        }

        const quota = this.quota;
        const accountUins = [...this.perUin.keys()];
        const writers = [...(this.shared ? [this.shared] : []), ...this.perUin.values()];
        this.shared = null;
        this.perUin.clear();
        const resumeMaintenance = quota.suspendMaintenance();

        try {
            await Promise.all(writers.map((writer) => writer.close()));
        } finally {
            resumeMaintenance();
        }

        const result = quota.clearClosedFiles();

        const shared = new FileWriter(this.dir, this.maxBytes, quota);

        try {
            await shared.prepare();
            this.shared = shared;
            this.initializationError = null;
            this.nextWriterRetryAt = 0;
        } catch (error) {
            this.recordWriterRecoveryFailure(error);
            result.failures.push({
                file: '.',
                message: this.initializationError ?? 'failed to reopen the shared log writer',
            });
        }

        if (this.perUinEnabled) {
            for (const uin of accountUins) {
                const writer = new FileWriter(
                    path.join(this.dir, String(uin)),
                    this.maxBytes,
                    quota,
                );

                if (writer.isDisabled) {
                    continue;
                }

                try {
                    await writer.prepare();
                    this.perUin.set(uin, writer);
                } catch (error) {
                    quota.storageFailed(
                        `failed to reopen account log writer for ${String(uin)}`,
                        error,
                    );
                    result.failures.push({
                        file: String(uin),
                        message: `failed to reopen account log writer: ${errorMessage(error)}`,
                    });
                }
            }
        }

        return { ...result, status: this.getStorageStatus() };
    }

    write(line: string, uin?: number): void {
        if (!this.enabled) {
            return;
        }

        if (!this.shared || this.shared.isDisabled) {
            if (!this.recoverSharedWriterForWrite()) {
                return;
            }
        }

        if (!this.shared) {
            return;
        }

        const data = sanitizeLogLine(line) + '\n';
        const bytes = Buffer.byteLength(data, 'utf8');

        if (!this.shared.write(data, bytes)) {
            if (this.shared.isDisabled) {
                this.shared = null;
                this.nextWriterRetryAt = Date.now() + QUOTA_RETRY_MS;
            }

            return;
        }

        if (uin !== undefined && this.perUinEnabled && this.quota) {
            let w = this.perUin.get(uin);

            if (w?.isDisabled) {
                this.perUin.delete(uin);
                w = undefined;
            }

            if (!w) {
                w = new FileWriter(path.join(this.dir, String(uin)), this.maxBytes, this.quota);

                if (w.isDisabled) {
                    return;
                }

                this.perUin.set(uin, w);
            }

            w.write(data, bytes);
        }
    }

    async close(): Promise<void> {
        const closes: Promise<void>[] = [];

        if (this.shared) {
            closes.push(this.shared.close());
        }

        for (const w of this.perUin.values()) {
            closes.push(w.close());
        }

        this.shared = null;
        this.perUin.clear();
        await Promise.all(closes);
    }

    private async recoverSharedWriter(force: boolean): Promise<void> {
        if (!this.enabled) {
            return;
        }

        if (!force && Date.now() < this.nextWriterRetryAt) {
            throw new Error(this.initializationError ?? 'log writer retry is rate-limited');
        }

        if (this.shared?.isDisabled) {
            this.shared = null;
        }

        if (!this.quota) {
            this.initialize();
        }

        if (!this.shared && this.quota) {
            const writer = new FileWriter(this.dir, this.maxBytes, this.quota);

            if (!writer.isDisabled) {
                this.shared = writer;
            }
        }

        const writer = this.shared;

        if (!writer) {
            throw new Error(this.initializationError ?? 'failed to create the shared log writer');
        }

        try {
            await writer.prepare();

            if (writer.isDisabled || !writer.currentPath) {
                throw new Error('the shared log writer did not open a file');
            }

            this.initializationError = null;
            this.nextWriterRetryAt = 0;
        } catch (error) {
            this.shared = null;
            this.recordWriterRecoveryFailure(error);
            throw error;
        }
    }

    private recoverSharedWriterForWrite(): boolean {
        if (!this.enabled || Date.now() < this.nextWriterRetryAt) {
            return false;
        }

        if (this.shared?.isDisabled) {
            this.shared = null;
        }

        if (!this.quota) {
            this.initialize();
        }

        if (!this.shared && this.quota) {
            const writer = new FileWriter(this.dir, this.maxBytes, this.quota);

            if (!writer.isDisabled) {
                this.shared = writer;
            }
        }

        if (this.shared) {
            this.initializationError = null;
            this.nextWriterRetryAt = 0;
            return true;
        }

        return false;
    }

    private clearLogsWhileDisabled(): LogCleanupResult {
        try {
            const quota = new LogQuota(this.dir, this.maxTotalBytes, this.retainDays, false);
            const result = quota.clearClosedFiles();
            const snapshot = quota.snapshot();
            return {
                ...result,
                status: {
                    ...snapshot,
                    state: 'disabled',
                    directory: this.dir,
                    maxTotalBytes: this.maxTotalBytes,
                    retainDays: this.retainDays,
                    perUinEnabled: this.perUinEnabled,
                },
            };
        } catch (error) {
            const message = `failed to clear disabled log storage ${this.dir}: ${errorMessage(error)}`;
            reportStorageError(message);
            return {
                deletedFiles: 0,
                freedBytes: 0,
                failures: [{ file: '.', message }],
                status: {
                    state: 'disabled',
                    directory: this.dir,
                    totalBytes: 0,
                    maxTotalBytes: this.maxTotalBytes,
                    retainDays: this.retainDays,
                    perUinEnabled: this.perUinEnabled,
                    fileCount: 0,
                    activeFileCount: 0,
                    droppedLines: 0,
                    lastError: message,
                },
            };
        }
    }

    private recordWriterRecoveryFailure(error: unknown): void {
        this.initializationError = `failed to initialize log storage ${this.dir}: ${errorMessage(error)}`;
        this.nextWriterRetryAt = Date.now() + QUOTA_RETRY_MS;
        reportStorageError(this.initializationError);
    }

    private initialize(): void {
        try {
            fs.mkdirSync(this.dir, { recursive: true });
            const quota = new LogQuota(this.dir, this.maxTotalBytes, this.retainDays);
            const writer = new FileWriter(this.dir, this.maxBytes, quota);

            if (writer.isDisabled) {
                throw new Error(`failed to create shared log writer in ${this.dir}`);
            }

            this.quota = quota;
            this.shared = writer;
            this.initializationError = null;
            this.nextWriterRetryAt = 0;
        } catch (error) {
            this.quota = null;
            this.shared = null;
            this.recordWriterRecoveryFailure(error);
        }
    }
}

function validatePolicy(policy: LogStoragePolicy): void {
    if (
        !Number.isSafeInteger(policy.maxTotalMb) ||
        policy.maxTotalMb <= 0 ||
        policy.maxTotalMb > MAX_LOG_TOTAL_MB
    ) {
        throw new RangeError(`maxTotalMb must be an integer in 1..${String(MAX_LOG_TOTAL_MB)}`);
    }

    if (
        !Number.isSafeInteger(policy.retainDays) ||
        policy.retainDays < 0 ||
        policy.retainDays > MAX_LOG_RETAIN_DAYS
    ) {
        throw new RangeError(`retainDays must be an integer in 0..${String(MAX_LOG_RETAIN_DAYS)}`);
    }

    if (typeof policy.perUinEnabled !== 'boolean') {
        throw new TypeError('perUinEnabled must be a boolean');
    }
}

let singleton: FileTransport | null = null;
let configuredPolicy: LogStoragePolicy | null = null;

export function getFileTransport(): FileTransport {
    if (!singleton) {
        singleton = new FileTransport(configuredPolicy ?? undefined);
    }

    return singleton;
}

export async function configureFileTransport(policy: LogStoragePolicy): Promise<LogStorageStatus> {
    validatePolicy(policy);
    configuredPolicy = { ...policy };

    if (!singleton) {
        singleton = new FileTransport(configuredPolicy);
    } else {
        await singleton.updatePolicy(configuredPolicy);
    }

    return singleton.getStorageStatus();
}

export function getLogStorageStatus(): LogStorageStatus {
    return getFileTransport().getStorageStatus();
}

export function clearManagedLogs(): Promise<LogCleanupResult> {
    return getFileTransport().clearManagedLogs();
}

/** Reset state between tests. Closes all active file handles. */
export async function _resetFileTransportForTesting(): Promise<void> {
    if (singleton) {
        await singleton.close();
    }

    singleton = null;
    configuredPolicy = null;
}
