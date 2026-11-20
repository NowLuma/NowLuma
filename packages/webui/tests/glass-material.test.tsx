import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GlassMaterial } from '../src/components/ui/glass-material';
import { Button } from '../src/components/ui/button';


describe('GlassMaterial', () => {
    it('starts with readable frost and keeps interactive content outside the decorative layer', () => {
        const markup = renderToStaticMarkup(
            <div className="ui-glass">
                <GlassMaterial />
                <Button aria-label="保存配置">保存</Button>
            </div>,
        );
        expect(markup).toContain(
            'aria-hidden="true" class="ui-glass-material" data-glass-renderer="frosted"',
        );
        expect(markup).toContain('aria-label="保存配置"');
        expect(markup).not.toContain('backdrop-filter:');
        expect(markup).not.toContain('<filter');
    });

});
