import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CollapsibleBanner } from '../src/components/interior/collapsible-banner';
import { Button } from '../src/components/ui/button';
import { Card } from '../src/components/ui/card';
import { GlassSurface } from '../src/components/ui/glass-material';
import { Input } from '../src/components/ui/input';
import { Textarea } from '../src/components/ui/textarea';

describe('GlassMaterial', () => {
    it('starts with readable frost and keeps interactive content outside the decorative layer', () => {
        const markup = renderToStaticMarkup(
            <GlassSurface>
                <Button aria-label="保存配置">保存</Button>
            </GlassSurface>,
        );
        expect(markup).toContain(
            'aria-hidden="true" class="ui-glass-material" data-glass-renderer="frosted"',
        );
        expect(markup).toContain('aria-label="保存配置"');
        expect(markup).not.toContain('backdrop-filter:');
        expect(markup).not.toContain('<filter');
    });

    it('keeps repeated controls, their semantics and the slotted link free of optical mounts', () => {
        const markup = renderToStaticMarkup(
            <Card>
                <Input aria-label="Invalid field" aria-invalid />
                <Textarea aria-label="Disabled field" disabled />
                <Button asChild variant="glass">
                    <a href="/docs">Docs</a>
                </Button>
                <Button variant="destructive">Remove</Button>
            </Card>,
        );
        expect(markup).toContain('ui-glass-raised');
        expect(markup).toContain('ui-glass-field');
        expect(markup).toContain('aria-invalid="true"');
        expect(markup).toContain('disabled=""');
        expect(markup).toContain('href="/docs"');
        expect(markup).toContain('data-variant="destructive"');
        expect(markup).not.toContain('data-glass-renderer');
    });

    it('only mounts a lens for a notice opted into floating optics', () => {
        const matte = renderToStaticMarkup(<CollapsibleBanner title="Saved" />);
        const floating = renderToStaticMarkup(<CollapsibleBanner title="Saved" optical />);
        expect(matte).toContain('ui-glass-raised');
        expect(matte).not.toContain('data-glass-renderer');
        expect(floating).toContain('ui-glass-overlay');
        expect(floating).toContain('data-glass-renderer="frosted"');
    });
});
