import { describe, expect, it } from 'vitest';
import {
    COMPAT_RISK_TEXT,
    COMPAT_RISK_VERSION,
    NATIVE_KERNEL_LABEL,
    kernelDisplayCatalog,
} from '../src/kernel-display';

describe('kernel display catalog', () => {
    it('names the compat kernel after its native source and keeps the current risk version', () => {
        expect(NATIVE_KERNEL_LABEL).toMatch(/^[A-Za-z]{3,} 内核$/);
        expect(kernelDisplayCatalog()).toEqual({
            options: [
                { id: 'compat', label: NATIVE_KERNEL_LABEL, available: true, reason: '' },
                {
                    id: 'rewrite',
                    label: '重写内核',
                    available: false,
                    reason: '当前平台的重写内核尚未验证，暂不可使用',
                },
            ],
            riskVersion: 'compat-risk-1',
            riskText: COMPAT_RISK_TEXT,
        });
        expect(kernelDisplayCatalog().riskVersion).toBe(COMPAT_RISK_VERSION);
        expect(COMPAT_RISK_TEXT.startsWith(NATIVE_KERNEL_LABEL)).toBe(true);
        expect(COMPAT_RISK_TEXT).toContain('不改变 GPL 源码许可');
    });

    it('returns a fresh catalog so no caller can mutate the shared display state', () => {
        const first = kernelDisplayCatalog();
        first.options[0].label = 'mutated';
        first.options.length = 0;
        expect(kernelDisplayCatalog().options).toHaveLength(2);
        expect(kernelDisplayCatalog().options[0].label).toBe(NATIVE_KERNEL_LABEL);
    });
});
