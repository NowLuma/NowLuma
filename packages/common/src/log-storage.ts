import { errorMessage } from './errors';
import fs from 'node:fs';
import path from 'node:path';

const FILE_RE = /^nowluma-(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.log$/;
const ACCOUNT_DIR_RE = /^\d+$/;
export const QUOTA_RETRY_MS = 5_000;

export type LogStorageState = 'disabled' | 'healthy' | 'warning' | 'degraded';

export interface LogStorageStatus {
    state: LogStorageState;
    directory: string;
    totalBytes: number;
    maxTotalBytes: number;
    retainDays: number;
    perUinEnabled: boolean;
    fileCount: number;
    activeFileCount: number;
    droppedLines: number;
    lastError?: string;
}

export interface LogStoragePolicy {
    maxTotalMb: number;
    retainDays: number;
    perUinEnabled: boolean;
}

export interface LogCleanupResult {
    deletedFiles: number;
    freedBytes: number;
    failures: Array<{ file: string; message: string }>;
    status: LogStorageStatus;
}

export function todayString(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function dateOf(s: string): Date {
    const [y, m, d] = s.split('-').map((v) => Number.parseInt(v, 10));
    return new Date(y!, m! - 1, d!);
}

function isMissing(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

interface ManagedLogFile {
    path: string;
    bytes: number;
    mtimeMs: number;
    date: string;
}

/**
 * Owns the byte budget for the whole managed log tree. Writers reserve bytes
 * here before enqueueing them to a WriteStream, so buffered bytes count toward
 * the hard limit even before fs.stat can observe them.
 */
export class LogQuota {
    private readonly files = new Map<string, ManagedLogFile>();
    private readonly active = new Set<string>();
    private usedBytes = 0;
    private degraded = false;
    private lastError: string | null = null;
    private nextRetryAt = 0;
    private droppedLines = 0;
    private maintenanceSuspensions = 0;

    constructor(
        private readonly root: string,
        private maxTotalBytes: number,
        private retainDays: number,
        maintainOnLoad = true,
    ) {
        this.loadManagedFiles();

        if (maintainOnLoad) {
            this.cleanupExpired();
            this.ensureCapacity(0);
        }
    }

    activate(filePath: string): number | null {
        const normalized = path.resolve(filePath);
        const known = this.files.get(normalized);

        if (known) {
            this.active.add(normalized);
            return known.bytes;
        }

        let bytes = 0;
        let mtimeMs = Date.now();

        try {
            const stat = fs.statSync(normalized);
            bytes = stat.size;
            mtimeMs = stat.mtimeMs;
        } catch (error) {
            if (!isMissing(error)) {
                this.enterDegraded(
                    `failed to inspect active log ${normalized}: ${errorMessage(error)}`,
                );
                return null;
            }
        }

        const date = FILE_RE.exec(path.basename(normalized))?.[1] ?? todayString();
        this.files.set(normalized, { path: normalized, bytes, mtimeMs, date });
        this.usedBytes += bytes;
        this.active.add(normalized);
        return bytes;
    }

    deactivate(filePath: string): void {
        this.active.delete(path.resolve(filePath));

        if (this.maintenanceSuspensions > 0) {
            return;
        }

        this.maintainAfterClose();
    }

    suspendMaintenance(): () => void {
        this.maintenanceSuspensions += 1;
        let resumed = false;

        return () => {
            if (resumed) {
                return;
            }

            resumed = true;
            this.maintenanceSuspensions = Math.max(0, this.maintenanceSuspensions - 1);
        };
    }

    reserve(filePath: string, bytes: number): boolean {
        if (bytes <= 0) {
            return true;
        }

        if (this.degraded && !this.retry(false)) {
            this.droppedLines += 1;
            return false;
        }

        if (!this.ensureCapacity(bytes)) {
            this.droppedLines += 1;
            return false;
        }

        const normalized = path.resolve(filePath);
        const file = this.files.get(normalized);

        if (!file) {
            if (this.activate(normalized) === null) {
                this.droppedLines += 1;
                return false;
            }

            return this.reserve(normalized, bytes);
        }

        file.bytes += bytes;
        file.mtimeMs = Date.now();
        this.usedBytes += bytes;
        return true;
    }

    writeFailed(filePath: string, error: unknown): void {
        this.storageFailed(`write ${filePath}`, error);
    }

    storageFailed(operation: string, error: unknown): void {
        this.enterDegraded(`${operation}: ${errorMessage(error)}`);
    }

    snapshot(): Omit<
        LogStorageStatus,
        'directory' | 'maxTotalBytes' | 'retainDays' | 'perUinEnabled'
    > {
        return {
            state: this.degraded ? 'degraded' : this.lastError ? 'warning' : 'healthy',
            totalBytes: this.usedBytes,
            fileCount: this.files.size,
            activeFileCount: this.active.size,
            droppedLines: this.droppedLines,
            ...(this.lastError ? { lastError: this.lastError } : {}),
        };
    }

    updatePolicy(maxTotalBytes: number, retainDays: number): void {
        this.maxTotalBytes = maxTotalBytes;
        this.retainDays = retainDays;
        this.degraded = false;
        this.lastError = null;
        this.nextRetryAt = 0;

        try {
            this.refreshClosedFiles();
            this.cleanupExpired();
            this.ensureCapacity(0);
        } catch (error) {
            this.enterDegraded(`failed to apply log storage policy: ${errorMessage(error)}`);
            throw error;
        }
    }

    clearClosedFiles(): Omit<LogCleanupResult, 'status'> {
        this.refreshClosedFiles();
        let deletedFiles = 0;
        let freedBytes = 0;
        const failures: LogCleanupResult['failures'] = [];
        const candidates = this.closedFilesOldestFirst();

        for (const file of candidates) {
            const bytes = file.bytes;

            if (this.deleteManagedFile(file, 'capacity')) {
                deletedFiles += 1;
                freedBytes += bytes;
            } else {
                failures.push({
                    file: path.relative(this.root, file.path),
                    message: this.lastError ?? 'unknown cleanup error',
                });
            }
        }

        if (failures.length === 0) {
            this.degraded = false;
            this.lastError = null;
            this.nextRetryAt = 0;
        } else if (this.usedBytes > this.maxTotalBytes) {
            this.enterDegraded(
                `managed logs still use ${String(this.usedBytes)} bytes after manual cleanup, ` +
                    `exceeding the ${String(this.maxTotalBytes)} byte limit`,
            );
        }

        this.ensureCapacity(0);
        return { deletedFiles, freedBytes, failures };
    }

    private retry(force: boolean): boolean {
        if (!force && Date.now() < this.nextRetryAt) {
            return false;
        }

        this.degraded = false;
        this.lastError = null;

        try {
            this.refreshClosedFiles();
            const recovered = this.ensureCapacity(0);

            if (recovered) {
                this.nextRetryAt = 0;
            }

            return recovered;
        } catch (error) {
            this.enterDegraded(`failed to refresh managed logs: ${errorMessage(error)}`);
            return false;
        }
    }

    private maintainAfterClose(): void {
        try {
            this.refreshClosedFiles();
            this.cleanupExpired();

            if (this.degraded) {
                this.retry(true);
            } else {
                this.ensureCapacity(0);
            }
        } catch (error) {
            this.enterDegraded(
                `failed to maintain managed logs after rotation: ${errorMessage(error)}`,
            );
        }
    }

    private ensureCapacity(incomingBytes: number): boolean {
        if (this.usedBytes + incomingBytes <= this.maxTotalBytes) {
            return true;
        }

        const candidates = this.closedFilesOldestFirst();

        for (const file of candidates) {
            if (this.usedBytes + incomingBytes <= this.maxTotalBytes) {
                break;
            }

            if (!this.deleteManagedFile(file, 'capacity')) {
                break;
            }
        }

        if (this.usedBytes + incomingBytes <= this.maxTotalBytes) {
            return true;
        }

        this.enterDegraded(
            `managed logs require ${String(this.usedBytes + incomingBytes)} bytes, ` +
                `exceeding the ${String(this.maxTotalBytes)} byte limit; no closed log can be reclaimed`,
        );
        return false;
    }

    private enterDegraded(message: string): void {
        const shouldReport = !this.degraded || this.lastError !== message;
        this.degraded = true;
        this.lastError = message;
        this.nextRetryAt = Date.now() + QUOTA_RETRY_MS;

        if (shouldReport) {
            reportStorageError(message);
        }
    }

    private cleanupExpired(): void {
        if (this.retainDays === 0) {
            return;
        }

        const cutoff = Date.now() - this.retainDays * 24 * 60 * 60 * 1000;
        const expired = this.closedFilesOldestFirst().filter(
            (file) => dateOf(file.date).getTime() < cutoff,
        );

        for (const file of expired) {
            if (!this.deleteManagedFile(file, 'retention')) {
                break;
            }
        }
    }

    private closedFilesOldestFirst(): ManagedLogFile[] {
        return [...this.files.values()]
            .filter((file) => !this.active.has(file.path))
            .sort((a, b) => a.mtimeMs - b.mtimeMs || a.path.localeCompare(b.path));
    }

    private deleteManagedFile(file: ManagedLogFile, reason: 'capacity' | 'retention'): boolean {
        try {
            fs.unlinkSync(file.path);
            this.files.delete(file.path);
            this.usedBytes = Math.max(0, this.usedBytes - file.bytes);
            return true;
        } catch (error) {
            this.lastError = `${reason} cleanup failed for ${file.path}: ${error instanceof Error ? error.message : String(error)}`;
            reportStorageError(this.lastError);
            return false;
        }
    }

    private loadManagedFiles(): void {
        for (const file of listManagedLogFiles(this.root)) {
            this.files.set(file.path, file);
            this.usedBytes += file.bytes;
        }
    }

    /** Refresh only closed files; active stream bytes are tracked in-memory and
     * may be newer than fs.stat while the WriteStream buffer is still flushing. */
    private refreshClosedFiles(): void {
        const disk = new Map(listManagedLogFiles(this.root).map((file) => [file.path, file]));

        for (const [filePath, file] of this.files) {
            if (this.active.has(filePath)) {
                continue;
            }

            const next = disk.get(filePath);
            this.usedBytes -= file.bytes;

            if (next) {
                this.files.set(filePath, next);
                this.usedBytes += next.bytes;
                disk.delete(filePath);
            } else {
                this.files.delete(filePath);
            }
        }

        for (const file of disk.values()) {
            if (this.files.has(file.path)) {
                continue;
            }

            this.files.set(file.path, file);
            this.usedBytes += file.bytes;
        }
    }
}

function listManagedLogFiles(root: string): ManagedLogFile[] {
    const out: ManagedLogFile[] = [];

    const readDirectory = (dir: string): fs.Dirent[] | null => {
        try {
            return fs.readdirSync(dir, { withFileTypes: true });
        } catch (error) {
            if (isMissing(error)) {
                return null;
            }

            throw new Error(`failed to read managed log directory ${dir}: ${errorMessage(error)}`, {
                cause: error,
            });
        }
    };

    const visit = (dir: string, entries: fs.Dirent[]): void => {
        for (const entry of entries) {
            if (!entry.isFile()) {
                continue;
            }

            const match = FILE_RE.exec(entry.name);

            if (!match) {
                continue;
            }

            const filePath = path.resolve(dir, entry.name);

            try {
                const stat = fs.statSync(filePath);
                out.push({
                    path: filePath,
                    bytes: stat.size,
                    mtimeMs: stat.mtimeMs,
                    date: match[1]!,
                });
            } catch (error) {
                if (isMissing(error)) {
                    continue;
                }

                throw new Error(`failed to stat managed log ${filePath}: ${errorMessage(error)}`, {
                    cause: error,
                });
            }
        }
    };

    const rootEntries = readDirectory(root);

    if (!rootEntries) {
        return out;
    }

    visit(root, rootEntries);

    for (const entry of rootEntries) {
        if (entry.isDirectory() && ACCOUNT_DIR_RE.test(entry.name)) {
            const accountDir = path.join(root, entry.name);
            const accountEntries = readDirectory(accountDir);

            if (accountEntries) {
                visit(accountDir, accountEntries);
            }
        }
    }

    return out;
}

export function reportStorageError(message: string): void {
    process.stderr.write(`[logger.storage] ${message}\n`);
}
