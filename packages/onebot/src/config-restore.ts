// Shared config validation primitives and the restore-only subsections.
//
// `config.ts` keeps the file/network owner because its parser (`fromJson`)
// normalizes adapters and must not be imported back here. These validators are
// independent of that parser; keeping them in a leaf module lets config,
// restore, and tests share one error contract without a cycle.

import type { JsonObject } from './types';

/** Upper bound on the status-command reply cooldown — a year is effectively "off but sane". */
export const STATUS_COMMAND_COOLDOWN_MAX = 31_536_000;
/** Max length of a user-customised trigger word (UTF-16 code units). */
export const STATUS_COMMAND_TRIGGER_MAX_LENGTH = 32;

/** A deterministic configuration error. Callers may safely return this as a
 *  4xx without conflating it with filesystem/runtime failures. */
export class OneBotConfigValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OneBotConfigValidationError';
    }
}

export function invalid(message: string): never {
    throw new OneBotConfigValidationError(message);
}

export function isObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function rejectUnknownKeys(
    value: JsonObject,
    allowed: ReadonlySet<string>,
    at: string,
): void {
    const unknown = Object.keys(value).find((key) => !allowed.has(key));

    if (unknown) {
        invalid(`${at}.${unknown} is not supported`);
    }
}

export function parseRestoreInteger(value: unknown): number | null {
    const number = typeof value === 'string' && value.trim() ? Number(value) : value;
    return typeof number === 'number' && Number.isSafeInteger(number) ? number : null;
}

export function validateRestoreStatusCommand(value: unknown): void {
    if (value === undefined) {
        return;
    }

    if (!isObject(value)) {
        invalid('$.statusCommand must be an object');
    }

    rejectUnknownKeys(
        value,
        new Set(['enabled', 'swallow', 'cooldownSeconds', 'trigger']),
        '$.statusCommand',
    );

    if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
        invalid('$.statusCommand.enabled must be a boolean');
    }

    if (value.swallow !== undefined && typeof value.swallow !== 'boolean') {
        invalid('$.statusCommand.swallow must be a boolean');
    }

    if (value.cooldownSeconds !== undefined) {
        const cooldown = parseRestoreInteger(value.cooldownSeconds);

        if (cooldown === null || cooldown < 0 || cooldown > STATUS_COMMAND_COOLDOWN_MAX) {
            invalid(
                `$.statusCommand.cooldownSeconds must be an integer between 0 and ${STATUS_COMMAND_COOLDOWN_MAX}`,
            );
        }
    }

    if (value.trigger !== undefined) {
        const trigger = typeof value.trigger === 'string' ? value.trigger.trim() : '';

        if (
            typeof value.trigger !== 'string' ||
            !trigger ||
            /[\r\n]/.test(value.trigger) ||
            trigger.length > STATUS_COMMAND_TRIGGER_MAX_LENGTH
        ) {
            invalid(
                `$.statusCommand.trigger must be non-empty, single-line, and <= ${STATUS_COMMAND_TRIGGER_MAX_LENGTH} characters`,
            );
        }
    }
}

export function validateRestoreNotifications(value: unknown): void {
    if (value === undefined) {
        return;
    }

    if (!isObject(value)) {
        invalid('$.notifications must be an object');
    }

    rejectUnknownKeys(value, new Set(['channelIds']), '$.notifications');

    if (value.channelIds === undefined) {
        return;
    }

    if (!Array.isArray(value.channelIds)) {
        invalid('$.notifications.channelIds must be an array');
    }

    value.channelIds.forEach((id, index) => {
        if (typeof id !== 'string') {
            invalid(`$.notifications.channelIds[${String(index)}] must be a string`);
        }

        const normalized = id.trim();

        if (!normalized || normalized.length > 64 || !/^[\w.-]+$/.test(normalized)) {
            invalid(`$.notifications.channelIds[${String(index)}] is invalid`);
        }
    });
}

export function validateRestoreHistorySync(value: unknown): void {
    if (value === undefined) {
        return;
    }

    if (!isObject(value)) {
        invalid('$.historySync must be an object');
    }

    rejectUnknownKeys(value, new Set(['enabled']), '$.historySync');

    if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
        invalid('$.historySync.enabled must be a boolean');
    }
}
