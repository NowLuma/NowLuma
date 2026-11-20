import { afterEach, describe, expect, it, vi } from 'vitest';
import os from 'os';
import { CACHED_ARCH_LABEL, createCpuLoadSampler, normalizeArch } from '../src/webui/system-info';

interface CpuTimes {
    user: number;
    nice: number;
    sys: number;
    idle: number;
    irq: number;
}

function cpuAt(idle: number, busy: number): os.CpuInfo {
    const times: CpuTimes = { user: busy, nice: 0, sys: 0, idle, irq: 0 };
    return { model: 'test', speed: 0, times };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('normalizeArch', () => {
    it('maps Node arch names to operator labels and passes unknown values through', () => {
        expect(normalizeArch('x64')).toBe('x86_64');
        expect(normalizeArch('arm64')).toBe('ARM64');
        expect(normalizeArch('loong64')).toBe('LoongArch');
        expect(normalizeArch('riscv64')).toBe('RISC-V');
        expect(normalizeArch('ia32')).toBe('x86');
        expect(normalizeArch('mips')).toBe('MIPS');
        expect(normalizeArch('ppc64le')).toBe('PowerPC64 (LE)');
        expect(normalizeArch('weird-arch')).toBe('weird-arch');
    });

    it('derives the cached label from the running process arch', () => {
        expect(CACHED_ARCH_LABEL).toBe(normalizeArch(os.arch()));
    });
});

describe('createCpuLoadSampler', () => {
    it('returns zeros on the first sample and a delta afterwards', () => {
        const cpus = vi.spyOn(os, 'cpus');
        cpus.mockReturnValueOnce([cpuAt(100, 100)]);
        cpus.mockReturnValueOnce([cpuAt(150, 150)]);

        const sampler = createCpuLoadSampler();
        expect(sampler.sample()).toEqual([0]);
        expect(sampler.sample()).toEqual([50]);
    });

    it('treats a non-advancing clock as zero load', () => {
        vi.spyOn(os, 'cpus').mockReturnValue([cpuAt(100, 100)]);
        const sampler = createCpuLoadSampler();
        sampler.sample();
        expect(sampler.sample()).toEqual([0]);
    });

    it('keeps independent baselines for two samplers in one process', () => {
        const cpus = vi.spyOn(os, 'cpus');
        cpus.mockReturnValueOnce([cpuAt(100, 100)]); // A baseline
        cpus.mockReturnValueOnce([cpuAt(120, 120)]); // B baseline
        cpus.mockReturnValueOnce([cpuAt(150, 170)]); // A delta: idle 50, total 120
        cpus.mockReturnValueOnce([cpuAt(160, 180)]); // B delta: idle 40, total 100

        const a = createCpuLoadSampler();
        const b = createCpuLoadSampler();
        expect(a.sample()).toEqual([0]);
        expect(b.sample()).toEqual([0]);
        expect(a.sample()[0]).toBeCloseTo(58.3333);
        expect(b.sample()).toEqual([60]);
    });

    it('resets the baseline when the core count changes', () => {
        const cpus = vi.spyOn(os, 'cpus');
        cpus.mockReturnValueOnce([cpuAt(100, 100), cpuAt(100, 100)]);
        cpus.mockReturnValueOnce([cpuAt(100, 200), cpuAt(100, 200), cpuAt(100, 200)]);

        const sampler = createCpuLoadSampler();
        expect(sampler.sample()).toEqual([0, 0]);
        expect(sampler.sample()).toEqual([0, 0, 0]);
    });
});
