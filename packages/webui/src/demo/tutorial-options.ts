export const TUTORIAL_IDS = [
    'index',
    'introduction',
    'install-docker',
    'install-native',
    'first-run',
    'overview',
    'qq-connection',
    'onebot-config',
    'logs',
    'debug',
    'settings-console',
    'settings-runtime',
    'access-network',
    'data-backup',
    'troubleshooting',
    'demo',
    'planned',
    'developing',
] as const;

export type TutorialId = (typeof TUTORIAL_IDS)[number];
export type TutorialLanguage = 'zh' | 'en';
export type TutorialOptions = Readonly<{
    tutorial?: TutorialId;
    lang: TutorialLanguage;
    embed: boolean;
}>;

// Read only these three keys, once, before the isolation boundary removes secrets.
// Duplicate values are ambiguous and are rejected, even when one value is valid.
export function parseTutorialOptions(search: string): TutorialOptions {
    const params = new URLSearchParams(search);
    const single = (key: string) => (params.getAll(key).length === 1 ? params.get(key) : null);
    const tutorial = single('tutorial');
    return {
        ...(TUTORIAL_IDS.some((id) => id === tutorial) ? { tutorial: tutorial as TutorialId } : {}),
        lang: single('lang') === 'en' ? 'en' : 'zh',
        embed: single('embed') === '1',
    };
}

export function tutorialSearch(options: TutorialOptions): string {
    if (!options.tutorial) {
        return '';
    }

    const params = new URLSearchParams({ tutorial: options.tutorial, lang: options.lang });

    if (options.embed) {
        params.set('embed', '1');
    }

    return `?${params}`;
}
