import { accessSync, constants, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { RuntimeConfig } from '@nowluma/common/runtime';

/** Operational paths only; never return tokens, machine IDs, or QQ database contents. */
export function deploymentInfo(config: RuntimeConfig, desktopEnabled: boolean) {
    const home = homedir();
    const directories = {
        config: path.resolve('config'),
        data: path.resolve('data'),
        logs: path.resolve('logs'),
        qq: path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'QQ'),
    };
    const writable = Object.fromEntries(
        Object.entries(directories).map(([name, directory]) => {
            try {
                accessSync(directory, constants.W_OK);
                return [name, true];
            } catch {
                return [name, false];
            }
        }),
    );
    return {
        mode: existsSync('/.dockerenv') ? 'docker' : 'native',
        workingDirectory: process.cwd(),
        home,
        uid: process.getuid?.() ?? null,
        directories,
        writable,
        vncPort: config.vncPort ?? 0,
        vncUrl: config.vncUrl ?? '',
        // Applied capability, not a setting: the integrated gateway is served only
        // when this Linux server constructed it. A persisted vncUrl is not proof.
        desktopAvailable: desktopEnabled && process.platform === 'linux',
    };
}
