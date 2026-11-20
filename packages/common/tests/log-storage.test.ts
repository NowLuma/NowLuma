// Direct regressions for the managed log store: reservations must count before
// they reach disk, cleanup must never reclaim active or unrelated paths, and a
// degraded store must recover once its retry window expires.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LogQuota } from '../src/log-storage';

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nowluma-log-storage-'));
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('LogQuota', () => {
    it('reserves active bytes toward the quota before they reach disk', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 6, 24, 12, 0, 0));
        vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const activePath = path.join(tmpDir, 'nowluma-2026-07-24.log');
        const quota = new LogQuota(tmpDir, 100, 7);

        expect(quota.activate(activePath)).toBe(0);
        expect(quota.reserve(activePath, 90)).toBe(true);
        expect(quota.snapshot()).toMatchObject({
            state: 'healthy',
            totalBytes: 90,
            activeFileCount: 1,
        });
        expect(fs.existsSync(activePath)).toBe(false);

        expect(quota.reserve(activePath, 20)).toBe(false);
        expect(quota.snapshot()).toMatchObject({
            state: 'degraded',
            totalBytes: 90,
            droppedLines: 1,
        });
    });

    it('clears only closed managed files and preserves active and unrelated paths', () => {
        const activePath = path.join(tmpDir, 'nowluma-2026-07-24.log');
        const closedPath = path.join(tmpDir, 'nowluma-2020-01-01.log');
        const unrelatedPath = path.join(tmpDir, 'keep.txt');
        fs.writeFileSync(activePath, 'active\n');
        fs.writeFileSync(closedPath, 'closed\n');
        fs.writeFileSync(unrelatedPath, 'keep\n');
        const quota = new LogQuota(tmpDir, 1_024, 0);

        expect(quota.activate(activePath)).toBe(7);

        expect(quota.clearClosedFiles()).toMatchObject({
            deletedFiles: 1,
            freedBytes: 7,
            failures: [],
        });
        expect(fs.existsSync(activePath)).toBe(true);
        expect(fs.readFileSync(unrelatedPath, 'utf8')).toBe('keep\n');
        expect(fs.existsSync(closedPath)).toBe(false);
    });

    it('reports one degraded error and recovers after the retry window', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 6, 24, 12, 0, 0));
        const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const activePath = path.join(tmpDir, 'nowluma-2026-07-24.log');
        const quota = new LogQuota(tmpDir, 1_024, 0);

        quota.storageFailed('probe', new Error('boom'));
        expect(quota.snapshot()).toMatchObject({
            state: 'degraded',
            lastError: 'probe: boom',
        });

        expect(quota.reserve(activePath, 10)).toBe(false);
        expect(quota.snapshot().droppedLines).toBe(1);
        expect(stderr).toHaveBeenCalledTimes(1);

        vi.setSystemTime(new Date(2026, 6, 24, 12, 0, 5));
        expect(quota.reserve(activePath, 10)).toBe(true);
        expect(quota.snapshot()).toMatchObject({
            state: 'healthy',
            totalBytes: 10,
            droppedLines: 1,
        });
    });
});
