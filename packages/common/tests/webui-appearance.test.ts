import { describe, expect, it } from 'vitest';
import {
    DEFAULT_APPEARANCE,
    DEFAULT_BACKGROUND,
    UI_APPEARANCE_CACHE_KEY,
} from '../src/webui-appearance';

// The shared contract is the persisted `config/ui.json` appearance section.
// Keep the JSON shape and cache key stable so existing saved preferences and
// the index.html prepaint cache keep working.

describe('shared WebUI appearance contract', () => {
    it('keeps the persisted JSON shape and cache key unchanged', () => {
        expect(UI_APPEARANCE_CACHE_KEY).toBe('nowluma_ui_appearance');
        expect(Object.keys(DEFAULT_APPEARANCE)).toEqual([
            'mode',
            'accentMode',
            'accentPreset',
            'accentCustom',
            'accentScope',
            'darkIntensity',
            'palette',
            'sidebarStyle',
            'background',
            'fontSans',
            'fontSansCustom',
            'fontMono',
            'fontMonoCustom',
            'uiScale',
            'radius',
            'density',
            'reduceMotion',
            'disableMotion',
            'performanceMode',
            'customPointerSystem',
            'customContextMenu',
            'highContrast',
            'sidebarPinned',
            'timeFormat',
            'pollInterval',
            'customCss',
            'cssVars',
        ]);
        expect(Object.keys(DEFAULT_BACKGROUND)).toEqual([
            'type',
            'color',
            'gradient',
            'imageOpacity',
            'imageBlur',
            'hasImage',
            'imageMime',
            'imageVersion',
        ]);
        expect(JSON.parse(JSON.stringify(DEFAULT_APPEARANCE))).toEqual(DEFAULT_APPEARANCE);
        expect(DEFAULT_APPEARANCE).not.toHaveProperty('autoLow');
        expect(DEFAULT_APPEARANCE).not.toHaveProperty('target');
    });

    it('defaults to the neutral white/light base without purple', () => {
        expect(DEFAULT_APPEARANCE.mode).toBe('system');
        expect(DEFAULT_APPEARANCE.palette).toBe('default');
        expect(DEFAULT_APPEARANCE.accentMode).toBe('preset');
        expect(DEFAULT_APPEARANCE.accentPreset).toBe('neutral');
        expect(DEFAULT_APPEARANCE.accentCustom.toLowerCase()).not.toContain('8561bd');
        expect(DEFAULT_APPEARANCE.background.type).toBe('none');
        expect(DEFAULT_APPEARANCE.background.color.toLowerCase()).not.toContain('b99ae6');
    });
});
