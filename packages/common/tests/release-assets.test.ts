import { describe, expect, it } from 'vitest';
import { assetName, RELEASE_DOCUMENTS } from '../src/release-assets';

describe('release inputs', () => {
    it.each([
        ['win32-x64', 'Nowluma-v2.5.0-rc.1-win-x64-lite.zip'],
        ['linux-x64', 'Nowluma-v2.5.0-rc.1-linux-x64-lite.tar.gz'],
        ['linux-arm64', 'Nowluma-v2.5.0-rc.1-linux-arm64-lite.tar.gz'],
    ])('keeps the updater archive name for %s', (target, expected) => {
        expect(assetName('2.5.0-rc.1', target)).toBe(expected);
    });

    it('ships the GPL text, linking permission and both usage documents', () => {
        expect(RELEASE_DOCUMENTS).toEqual(['LICENSE', 'LICENSING.md', 'EULA.md', 'PRIVACY.md']);
    });
});
