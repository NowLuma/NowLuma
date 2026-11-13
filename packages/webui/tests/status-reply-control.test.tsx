import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GeneralSettingsTab } from '../src/components/config/general-settings-tab';
import { normalizeOneBotConfig } from '../src/lib/onebot-config';

vi.mock('@/components/config/notification-opt-in', () => ({ NotificationOptIn: () => null }));

describe('status reply control', () => {
    it('renders the #nl switch with an explicit disabled state', () => {
        const config = normalizeOneBotConfig({ statusCommand: { enabled: false, trigger: '#nl' } });
        const html = renderToStaticMarkup(
            <GeneralSettingsTab config={config} onChange={() => {}} />,
        );
        expect(html).toContain('启用 #nl 状态命令');
        expect(html).toContain('aria-checked="false"');
        expect(html).toContain('关闭后完全不响应');
    });
});
