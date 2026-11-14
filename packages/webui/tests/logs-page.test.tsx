import { renderToStaticMarkup } from 'react-dom/server';
import { MotionConfig } from 'motion/react';
import { describe, expect, it, vi } from 'vitest';
import { LogsPage } from '../src/components/pages/logs-page';
import { TooltipProvider } from '../src/components/ui/tooltip';

vi.mock('@/contexts/LayoutContext', async (original) => {
    const actual = await original<typeof import('../src/contexts/LayoutContext')>();
    return { ...actual, useLayout: () => ({ pages: actual.DEFAULT_PAGES, setPages: vi.fn() }) };
});
vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        appearance: { reduceMotion: true, disableMotion: true },
        formatClock: (time: string) => time,
    }),
}));
vi.mock('@/contexts/ActionFeedbackContext', () => ({
    useActionFeedback: () => ({ runAction: vi.fn() }),
}));
vi.mock('@/lib/api', () => ({ useApi: () => ({}) }));
vi.mock('@/components/confirm-dialog', () => ({ ConfirmDialog: () => null }));

function render() {
    return renderToStaticMarkup(
        <MotionConfig reducedMotion="always">
            <TooltipProvider>
                <LogsPage />
            </TooltipProvider>
        </MotionConfig>,
    );
}

describe('LogsPage fused search chrome', () => {
    it('keeps search labelled and readable above a backdrop-only material', () => {
        const markup = render();
        expect(markup).toContain('ui-glass-search');
        expect(markup).toContain('data-glass-renderer="frosted"');
        expect(markup).toContain('type="search"');
        expect(markup).toContain('aria-label="搜索消息 / 模块 / 级别"');
        expect(markup).toContain('placeholder="搜索消息 / 模块 / 级别"');
        expect(markup).toContain('placeholder:text-popover-foreground/80');
    });

    it('retains level filters, exports, view controls and the loading state', () => {
        const markup = render();

        for (const label of [
            'TRACE',
            'DEBUG',
            'INFO',
            'SUCCESS',
            'WARN',
            'ERROR',
            '自动换行',
            '显示选项',
            '刷新',
            '导出当前视图',
            '导出完整 TRACE',
            '清空视图',
            '连接中',
        ]) {
            expect(markup).toContain(label);
        }

        expect(markup).toContain('aria-busy="true" aria-label="运行日志"');
        expect(markup).not.toContain('log-row-in');
    });
});
