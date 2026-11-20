import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface DownloadReservation {
    streamDir: string;
    partPath: string;
    finalPath: string;
    bytes: number;
}

// Process-wide because multiple MCP clients can target the same directory.
const downloadReservations = new Map<string, Map<string, DownloadReservation>>();

export function reserveDownloadQuota(
    streamDir: string,
    partPath: string,
    finalPath: string,
    bytes: number,
    quotaBytes: number,
): DownloadReservation {
    const active = downloadReservations.get(streamDir) ?? new Map<string, DownloadReservation>();
    const activePaths = new Set<string>();
    let reservedBytes = 0;

    for (const reservation of active.values()) {
        activePaths.add(reservation.partPath);
        activePaths.add(reservation.finalPath);
        reservedBytes += reservation.bytes;
    }

    let existingBytes = 0;

    for (const entry of fs.readdirSync(streamDir, { withFileTypes: true })) {
        const target = path.join(streamDir, entry.name);

        if (activePaths.has(target) || !entry.isFile()) {
            continue;
        }

        try {
            existingBytes += fs.lstatSync(target).size;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
    }

    if (existingBytes + reservedBytes + bytes > quotaBytes) {
        throw new Error(
            `download directory quota ${quotaBytes} bytes exceeded: existing=${existingBytes}, reserved=${reservedBytes}, requested reserve=${bytes}`,
        );
    }

    const reservation = { streamDir, partPath, finalPath, bytes };
    active.set(partPath, reservation);
    downloadReservations.set(streamDir, active);
    return reservation;
}

export function releaseDownloadQuota(reservation: DownloadReservation | undefined): void {
    if (!reservation) {
        return;
    }

    const active = downloadReservations.get(reservation.streamDir);

    if (!active) {
        return;
    }

    active.delete(reservation.partPath);

    if (active.size === 0) {
        downloadReservations.delete(reservation.streamDir);
    }
}

export function validateStreamDirectory(streamDir: string): void {
    try {
        fs.accessSync(streamDir, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
        // Quota admission scans the directory before opening a partial file, so
        // list access is a startup requirement too.
        fs.readdirSync(streamDir);
    } catch (error) {
        throw new Error(
            `streamDir is not readable, writable, and traversable: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    const probePath = path.join(streamDir, `.nowluma-mcp-write-probe-${randomUUID()}`);
    let probeFd: number | undefined;
    const cleanupErrors: string[] = [];

    try {
        probeFd = fs.openSync(probePath, 'wx', 0o600);
    } catch (error) {
        throw new Error(
            `streamDir cannot create files: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    try {
        fs.closeSync(probeFd);
        probeFd = undefined;
    } catch (error) {
        cleanupErrors.push(
            `close probe: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    try {
        fs.unlinkSync(probePath);
    } catch (error) {
        cleanupErrors.push(
            `remove probe: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    if (cleanupErrors.length > 0) {
        throw new Error(`streamDir write probe cleanup failed: ${cleanupErrors.join('; ')}`);
    }
}

export function isWithin(root: string, target: string): boolean {
    const relative = path.relative(root, target);
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function safeDownloadName(value: unknown): string {
    const raw = typeof value === 'string' ? path.basename(value) : 'download.bin';
    const safe = raw
        .replace(/[^A-Za-z0-9._-]/g, '_')
        .replace(/^\.+/, '')
        .slice(0, 180);
    return safe || 'download.bin';
}

export async function writeAll(handle: fs.promises.FileHandle, data: Buffer): Promise<void> {
    let offset = 0;

    while (offset < data.length) {
        const { bytesWritten } = await handle.write(data, offset, data.length - offset);

        if (bytesWritten <= 0) {
            throw new Error('file write made no progress');
        }

        offset += bytesWritten;
    }
}
