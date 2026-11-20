import { isRealUin } from '@nowluma/common/uin';
import {
    ApiError,
    type AccountKernelPolicy,
    type KernelCatalog,
    type KernelChoiceInput,
    type KernelOption,
    type KernelSelection,
    type SaveKernelChoiceResult,
} from './types';

function object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function invalidResponse(value: unknown): never {
    throw new ApiError(
        502,
        object(value) && text(value.message) ? value.message : '服务端返回了无效的内核策略响应',
        'INVALID_RESPONSE',
    );
}

function options(value: unknown): value is KernelOption[] {
    return (
        Array.isArray(value) &&
        value.length === 2 &&
        new Set(value.map((option) => object(option) && option.id)).size === 2 &&
        value.every(
            (option) =>
                object(option) &&
                (option.id === 'compat' || option.id === 'rewrite') &&
                text(option.label) &&
                typeof option.available === 'boolean' &&
                typeof option.reason === 'string',
        )
    );
}

function selection(value: unknown): value is KernelSelection {
    return (
        object(value) &&
        (value.kernel === 'compat' || value.kernel === 'rewrite') &&
        typeof value.riskAccepted === 'boolean' &&
        (value.kernel !== 'compat' || value.riskAccepted) &&
        text(value.riskVersion) &&
        typeof value.acceptedAt === 'string' &&
        Number.isFinite(Date.parse(value.acceptedAt))
    );
}

export function kernelAccountPath(uin: string): string {
    if (typeof uin !== 'string' || !isRealUin(uin)) {
        throw new ApiError(400, '尚未识别当前 QQ 账号，请先在 QQ 登录');
    }

    return `/api/kernel/accounts/${encodeURIComponent(uin)}`;
}

export function assertKernelChoiceInput(value: unknown): asserts value is KernelChoiceInput {
    if (
        !object(value) ||
        Object.keys(value).length !== 3 ||
        !['kernel', 'riskAccepted', 'riskVersion'].every((key) => Object.hasOwn(value, key)) ||
        (value.kernel !== 'compat' && value.kernel !== 'rewrite') ||
        typeof value.riskAccepted !== 'boolean' ||
        !text(value.riskVersion)
    ) {
        throw new ApiError(400, '内核选择请求格式错误');
    }
}

export function readKernelCatalog(value: unknown): KernelCatalog {
    if (
        !object(value) ||
        !options(value.options) ||
        !text(value.riskVersion) ||
        !text(value.riskText)
    ) {
        return invalidResponse(value);
    }

    return { options: value.options, riskVersion: value.riskVersion, riskText: value.riskText };
}

export function readAccountKernelPolicy(value: unknown): AccountKernelPolicy {
    if (
        !object(value) ||
        !options(value.options) ||
        (value.selection !== null && !selection(value.selection)) ||
        typeof value.canLoad !== 'boolean' ||
        (value.canLoad &&
            (value.selection?.kernel !== 'compat' ||
                !value.selection.riskAccepted ||
                !value.options.some((option) => option.id === 'compat' && option.available)))
    ) {
        return invalidResponse(value);
    }

    return { selection: value.selection, options: value.options, canLoad: value.canLoad };
}

export function readSaveKernelChoiceResult(
    value: unknown,
    input: KernelChoiceInput,
): SaveKernelChoiceResult {
    if (
        !object(value) ||
        value.success !== true ||
        value.canLoad !== true ||
        !selection(value.selection) ||
        value.selection.kernel !== 'compat' ||
        value.selection.kernel !== input.kernel ||
        value.selection.riskAccepted !== input.riskAccepted ||
        value.selection.riskVersion !== input.riskVersion
    ) {
        return invalidResponse(value);
    }

    return { success: true, selection: value.selection, canLoad: true };
}
