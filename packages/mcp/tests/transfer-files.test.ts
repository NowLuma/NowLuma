import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
    releaseDownloadQuota,
    reserveDownloadQuota,
    writeAll,
    type DownloadReservation,
} from '../src/transfer-files.js';

describe('MCP transfer file ownership', () => {
    it('counts existing files and all active reservations before admitting another download', () => {
        const directory = mkdtempSync(path.join(tmpdir(), 'nowluma-transfer-files-'));
        let first: DownloadReservation | undefined;
        let second: DownloadReservation | undefined;

        try {
            writeFileSync(path.join(directory, 'existing'), '12345');
            first = reserveDownloadQuota(
                directory,
                path.join(directory, 'first.part'),
                path.join(directory, 'first'),
                4,
                10,
            );

            const reserveSecond = () => {
                second = reserveDownloadQuota(
                    directory,
                    path.join(directory, 'second.part'),
                    path.join(directory, 'second'),
                    2,
                    10,
                );
            };

            expect(reserveSecond).toThrow(/quota 10 bytes exceeded/);
            releaseDownloadQuota(first);
            first = undefined;
            expect(reserveSecond).not.toThrow();
        } finally {
            releaseDownloadQuota(first);
            releaseDownloadQuota(second);
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('finishes partial file writes without repeating confirmed bytes', async () => {
        const write = vi
            .fn()
            .mockResolvedValueOnce({ bytesWritten: 2 })
            .mockResolvedValueOnce({ bytesWritten: 3 });
        const data = Buffer.from('12345');
        await writeAll({ write } as unknown as FileHandle, data);
        expect(write.mock.calls).toEqual([
            [data, 0, 5],
            [data, 2, 3],
        ]);
    });

    it('rejects a write that makes no progress', async () => {
        const write = vi.fn().mockResolvedValue({ bytesWritten: 0 });
        await expect(
            writeAll({ write } as unknown as FileHandle, Buffer.from('1')),
        ).rejects.toThrow('file write made no progress');
        expect(write).toHaveBeenCalledTimes(1);
    });
});
