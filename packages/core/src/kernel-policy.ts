import { isRealUin } from '@nowluma/common/uin';
import fs from 'node:fs';
import path from 'node:path';

export const COMPAT_RISK_VERSION = 'compat-risk-1';
export const COMPAT_RISK_TEXT =
    '兼容内核使用随包提供的原生组件，可能存在账号、数据安全与法律风险。请阅读相关说明，由用户主动确认使用与法律风险；确认不免除依法不可免除的责任，也不改变 GPL 源码许可。';

export function kernelCatalog() {
    return {
        options: [
            { id: 'compat', label: '兼容内核', available: true, reason: '' },
            {
                id: 'rewrite',
                label: '重写内核',
                available: false,
                reason: '当前平台的重写内核尚未验证，暂不可使用',
            },
        ],
        riskVersion: COMPAT_RISK_VERSION,
        riskText: COMPAT_RISK_TEXT,
    };
}

export interface KernelSelection {
    kernel: 'compat' | 'rewrite';
    riskAccepted: boolean;
    riskVersion: string;
    acceptedAt: string;
}

export class KernelPolicyError extends Error {
    constructor(
        message: string,
        readonly status: 400 | 409 = 409,
    ) {
        super(message);
    }
}

function object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, expected: string[]): boolean {
    return (
        Object.keys(value).length === expected.length &&
        expected.every((key) => Object.hasOwn(value, key))
    );
}

function validSelection(value: unknown): value is KernelSelection {
    return (
        object(value) &&
        keys(value, ['kernel', 'riskAccepted', 'riskVersion', 'acceptedAt']) &&
        (value.kernel === 'compat' || value.kernel === 'rewrite') &&
        typeof value.riskAccepted === 'boolean' &&
        (value.kernel !== 'compat' || value.riskAccepted === true) &&
        typeof value.riskVersion === 'string' &&
        value.riskVersion.length > 0 &&
        typeof value.acceptedAt === 'string' &&
        Number.isFinite(Date.parse(value.acceptedAt))
    );
}

/** Desired policy is read separately from live PID state; damaged files are never repaired implicitly. */
export class KernelPolicyStore {
    constructor(private readonly file = path.join('config', 'kernel-selections.json')) {}

    private read(): Record<string, KernelSelection> {
        let raw: string;

        try {
            raw = fs.readFileSync(this.file, 'utf8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return {};
            }

            throw new Error('无法读取账号内核选择配置', { cause: error });
        }

        let value: unknown;

        try {
            value = JSON.parse(raw);
        } catch (error) {
            throw new Error('账号内核选择配置损坏，未覆盖原文件', { cause: error });
        }

        if (
            !object(value) ||
            !keys(value, ['version', 'accounts']) ||
            value.version !== 1 ||
            !object(value.accounts) ||
            !Object.entries(value.accounts).every(
                ([uin, selection]) => isRealUin(uin) && validSelection(selection),
            )
        ) {
            throw new Error('账号内核选择配置格式无效，未覆盖原文件');
        }

        return value.accounts as Record<string, KernelSelection>;
    }

    get(uin: string): KernelSelection | null {
        this.assertUin(uin);
        return this.read()[uin] ?? null;
    }

    canLoad(selection: KernelSelection | null): boolean {
        return (
            selection?.kernel === 'compat' &&
            selection.riskAccepted === true &&
            selection.riskVersion === COMPAT_RISK_VERSION
        );
    }

    authorize(uin: string): void {
        const selection = this.get(uin);

        if (!this.canLoad(selection)) {
            throw new KernelPolicyError(
                selection?.kernel === 'rewrite'
                    ? '重写内核尚未验证，不会自动切换到兼容内核'
                    : '请为此 QQ 账号选择内核并主动确认兼容内核风险',
            );
        }
    }

    save(uin: string, input: unknown): KernelSelection {
        this.assertUin(uin);

        if (
            !object(input) ||
            !keys(input, ['kernel', 'riskAccepted', 'riskVersion']) ||
            (input.kernel !== 'compat' && input.kernel !== 'rewrite') ||
            typeof input.riskAccepted !== 'boolean' ||
            typeof input.riskVersion !== 'string'
        ) {
            throw new KernelPolicyError('内核选择请求格式无效', 400);
        }

        if (input.kernel === 'rewrite') {
            throw new KernelPolicyError('当前平台的重写内核尚未验证，暂不可使用');
        }

        if (input.riskAccepted !== true) {
            throw new KernelPolicyError('必须主动确认兼容内核风险', 400);
        }

        if (input.riskVersion !== COMPAT_RISK_VERSION) {
            throw new KernelPolicyError('风险说明版本已更新，请重新阅读并确认');
        }

        const accounts = this.read();
        const selection: KernelSelection = {
            kernel: 'compat',
            riskAccepted: true,
            riskVersion: COMPAT_RISK_VERSION,
            acceptedAt: new Date().toISOString(),
        };
        accounts[uin] = selection;
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const temporary = `${this.file}.tmp`;

        try {
            fs.writeFileSync(temporary, JSON.stringify({ version: 1, accounts }, null, 2), {
                encoding: 'utf8',
                mode: 0o600,
            });

            if (process.platform !== 'win32') {
                fs.chmodSync(temporary, 0o600);
            }

            fs.renameSync(temporary, this.file);
        } finally {
            fs.rmSync(temporary, { force: true });
        }

        return selection;
    }

    private assertUin(uin: string): void {
        if (!isRealUin(uin)) {
            throw new KernelPolicyError('invalid uin', 400);
        }
    }
}
