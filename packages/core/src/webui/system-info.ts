// Host identity + CPU-load sampling for GET /api/system. Distro/arch detection
// is invariant over the process lifetime and therefore cached once at import;
// the CPU sampler is per-initWebUI so two servers in one process never share a
// baseline (which would report one server's load delta as the other's).

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import os from 'os';

function detectDistro(): string {
    // Helper: extract major.minor.patch from a kernel version string
    const parseKernel = (v: string): string | null => {
        const m = v.match(/(\d+\.\d+\.\d+)/);
        return m?.[1] ?? null;
    };

    // ── Linux ──────────────────────────────────────────────────────────
    if (os.platform() === 'linux') {
        const kernelRelease = os.release();
        const kernelVer = parseKernel(kernelRelease);

        // Normalize RHEL-family distro names before comparison.
        // /proc/version typically shows "Red Hat" (GCC build tag) even on
        // Rocky / Alma / Oracle Linux, while /etc/os-release carries the
        // actual distro name.  Treat the whole family as a single group so
        // they are never considered "disagreeing".
        const isRhelFamily = (name: string): boolean =>
            /^(red hat|centos|rocky|alma|oracle|scientific|anolis|tencentos|bclinux|opencloudos)/.test(
                name,
            );

        // Extract distro version from kernel release string.
        // Distros embed their version in the kernel ABI / build tag:
        //   Debian: "6.8.12-1-deb13-amd64"             → 13
        //   RHEL family: "4.18.0-513.el9.x86_64"        → 9
        //   Fedora: "6.8.12-300.fc40.x86_64"            → 40
        //   Amazon Linux: "6.1.158-178.288.amzn2023"    → 2023
        //   Mageia: "6.8.12-1.mga10"                    → 10
        const kernelDistroVer = (distro: string | null): string | null => {
            if (!distro) {
                return null;
            }

            const lr = kernelRelease.toLowerCase();
            const ld = distro.toLowerCase();

            if (ld === 'debian') {
                const m = lr.match(/deb(\d+)/);

                if (m) {
                    return m[1];
                }
            }

            if (isRhelFamily(ld)) {
                const m = lr.match(/el(\d+)/);

                if (m) {
                    return m[1];
                }
            }

            if (ld === 'fedora') {
                const m = lr.match(/fc(\d+)/);

                if (m) {
                    return m[1];
                }
            }

            if (ld === 'amazon' || ld.includes('amazon')) {
                const m = lr.match(/amzn(\d+)/);

                if (m) {
                    return m[1];
                }
            }

            if (ld === 'mageia') {
                const m = lr.match(/mga(\d+)/);

                if (m) {
                    return m[1];
                }
            }

            if (ld === 'armbian') {
                const m = lr.match(/armbian(\d+)/);

                if (m) {
                    return m[1];
                }
            }

            if (ld === 'dietpi') {
                const m = lr.match(/dietpi(\d+)/);

                if (m) {
                    return m[1];
                }
            }

            if (ld.includes('libreelec')) {
                const m = lr.match(/libreelec(\d+)/);

                if (m) {
                    return m[1];
                }
            }

            if (ld.includes('coreelec')) {
                const m = lr.match(/coreelec(\d+)/);

                if (m) {
                    return m[1];
                }
            }

            return null;
        };

        // Source A: /proc/version (host kernel build, crosses container boundary)
        let hostName: string | null = null;

        try {
            const raw = readFileSync('/proc/version', 'utf8').trim();
            const vm = raw.match(/^Linux version\s+(\S+)/);

            if (vm) {
                // Step 1: kernel release string — embedded distros embed their name
                // here (e.g. "6.6.16-armbian", "6.1.60-dietpi"). More reliable than
                // the GCC build tag, which often shows the cross-compilation toolchain
                // (e.g. "Ubuntu" for Armbian / DietPi) rather than the actual OS.
                const releaseStr = vm[1].toLowerCase();
                const releaseNameMatch = releaseStr.match(/(armbian|dietpi|libreelec|coreelec)/);

                if (releaseNameMatch) {
                    const nameMap: Record<string, string> = {
                        armbian: 'Armbian',
                        dietpi: 'DietPi',
                        libreelec: 'LibreELEC',
                        coreelec: 'CoreELEC',
                    };
                    hostName = nameMap[releaseNameMatch[1]] ?? releaseNameMatch[1];
                } else {
                    // Step 2: GCC build tag — matches the distribution that compiled
                    // the running kernel (e.g. "(Ubuntu ...)", "(Debian ...)",
                    // "(Red Hat ...)").
                    const dm = raw.match(
                        /\b(Debian|Ubuntu|Red Hat|CentOS|Fedora|Alpine|Arch|Gentoo|SUSE|Proxmox|OpenWrt|Deepin|Kylin|openEuler|Anolis|UOS|Linux Mint|Slackware|Manjaro|NixOS|Void|Mageia|Kali|Amazon|Solus|Alibaba|Armbian|DietPi|Raspbian)\b/i,
                    );
                    hostName = dm ? dm[1] : null;
                }
            }
        } catch {
            /* source A unavailable */
        }

        // Source B: /etc/os-release (container / local OS)
        let osReleaseName: string | null = null;
        let osReleaseVer: string | null = null;

        try {
            for (const f of ['/etc/os-release', '/usr/lib/os-release']) {
                if (!existsSync(f)) {
                    continue;
                }

                const raw = readFileSync(f, 'utf8');

                const get = (k: string) => {
                    const m = raw.match(new RegExp(`^${k}=("?)(.+?)\\1$`, 'm'));
                    return m?.[2] ?? null;
                };

                const pretty = get('PRETTY_NAME') || get('NAME');
                const ver = get('VERSION_ID');

                if (pretty) {
                    const nm = pretty.match(/^([^0-9]+)/);
                    osReleaseName = nm ? nm[1].trim() : pretty;
                    osReleaseVer = ver;
                    break;
                }
            }
        } catch {
            /* source B unavailable */
        }

        // Decide which source to trust for the distro name & version
        let finalName: string;
        let finalVer: string | null;

        if (hostName && osReleaseName) {
            // Normalize and compare: e.g. "Debian" vs "Debian GNU/Linux" → match.
            // RHEL family members (Red Hat, CentOS, Rocky, Alma, Oracle, Scientific)
            // are normalised to the same group — /proc/version usually shows "Red Hat"
            // (GCC build tag) even when the actual distro is Rocky / Alma / Oracle.
            const a = hostName.toLowerCase();
            const b = osReleaseName.toLowerCase();

            if (a.includes(b) || b.includes(a) || (isRhelFamily(a) && isRhelFamily(b))) {
                // Agree → prefer version from kernel release, fall back to os-release
                finalName = osReleaseName;
                finalVer = kernelDistroVer(hostName) ?? osReleaseVer;
            } else {
                // Disagree → host kernel build wins (crosses container boundary)
                finalName = hostName;
                finalVer = kernelDistroVer(hostName);
            }
        } else if (hostName) {
            finalName = hostName;
            finalVer = kernelDistroVer(hostName);
        } else if (osReleaseName) {
            finalName = osReleaseName;
            finalVer = kernelDistroVer(osReleaseName) ?? osReleaseVer;
        } else {
            // Source C: legacy release files
            for (const [path, prefix] of [
                ['/etc/alpine-release', 'Alpine Linux '],
                ['/etc/redhat-release', ''],
                ['/etc/debian_version', 'Debian '],
            ] as [string, string][]) {
                try {
                    if (existsSync(path)) {
                        const raw = prefix + readFileSync(path, 'utf8').trim();
                        return kernelVer ? `${raw} (kernel ${kernelVer})` : raw;
                    }
                } catch {
                    /* try next */
                }
            }

            return kernelVer ? `Linux (kernel ${kernelVer})` : 'Linux';
        }

        // Unified output: <Name> <version> (kernel <kernel>)
        const base = finalVer ? `${finalName} ${finalVer}` : finalName;
        return kernelVer ? `${base} (kernel ${kernelVer})` : base;
    }

    // ── Windows ────────────────────────────────────────────────────────
    if (os.platform() === 'win32') {
        try {
            const productName = execSync(
                'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" /v ProductName',
                { encoding: 'utf8', timeout: 3000, stdio: 'pipe' },
            );
            const m = productName.match(/ProductName\s+REG_SZ\s+(.+)/);
            let name = m ? m[1].trim() : `Windows ${os.release()}`;

            // ProductName is still "Windows 10 Pro" on Windows 11 — check build number.
            try {
                const buildOut = execSync(
                    'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" /v CurrentBuildNumber',
                    { encoding: 'utf8', timeout: 3000, stdio: 'pipe' },
                );
                const bm = buildOut.match(/CurrentBuildNumber\s+REG_SZ\s+(\d+)/);

                if (bm && parseInt(bm[1], 10) >= 22000) {
                    name = name.replace(/^Windows 10/, 'Windows 11');
                }
            } catch {
                /* keep name as-is */
            }

            return name;
        } catch {
            /* fall through */
        }

        return `Windows ${os.release()}`;
    }

    return os.platform();
}

export function normalizeArch(arch: string): string {
    const map: Record<string, string> = {
        loong64: 'LoongArch',
        riscv64: 'RISC-V',
        mips: 'MIPS',
        mipsel: 'MIPS (LE)',
        arm: 'ARM',
        arm64: 'ARM64',
        x64: 'x86_64',
        ia32: 'x86',
        s390: 'S/390',
        s390x: 'S/390x',
        ppc: 'PowerPC',
        ppc64: 'PowerPC64',
        ppc64le: 'PowerPC64 (LE)',
    };
    return map[arch] ?? arch;
}

export const CACHED_DISTRO = (() => {
    try {
        return detectDistro();
    } catch {
        return os.platform();
    }
})();

export const CACHED_ARCH_LABEL = normalizeArch(os.arch());

export interface CpuLoadSampler {
    /** Per-core busy percentage since the previous call; all zeros on the first. */
    sample(): number[];
}

/** One sampler per WebUI instance — sharing one would mix their baselines. */
export function createCpuLoadSampler(): CpuLoadSampler {
    let lastCpuTimes: { idle: number; total: number }[] | null = null;

    return {
        sample(): number[] {
            const cpus = os.cpus();
            const current = cpus.map((cpu) => {
                const t = cpu.times;
                const total = t.user + t.nice + t.sys + t.idle + t.irq;
                return { idle: t.idle, total };
            });

            if (!lastCpuTimes || lastCpuTimes.length !== current.length) {
                lastCpuTimes = current;
                return current.map(() => 0);
            }

            const usage = current.map((cur, i) => {
                const prev = lastCpuTimes![i];
                const totalDiff = cur.total - prev.total;
                const idleDiff = cur.idle - prev.idle;

                if (totalDiff <= 0) {
                    return 0;
                }

                return Math.max(0, Math.min(100, ((totalDiff - idleDiff) / totalDiff) * 100));
            });
            lastCpuTimes = current;
            return usage;
        },
    };
}
