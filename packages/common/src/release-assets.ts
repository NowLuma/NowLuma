/** Documents that must accompany a current runtime release. */
export const RELEASE_DOCUMENTS = ['LICENSE', 'LICENSING.md', 'EULA.md', 'PRIVACY.md'] as const;

/** Archive names are shared by the publisher and the runtime update client. */
export function assetName(version: string, target: string): string {
    const platform = target.replace('win32', 'win');
    return `Nowluma-v${version}-${platform}-lite.${target.startsWith('win32') ? 'zip' : 'tar.gz'}`;
}
