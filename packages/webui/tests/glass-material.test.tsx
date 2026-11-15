import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GlassMaterial } from '../src/components/ui/glass-material';
import { Button } from '../src/components/ui/button';
import { Card } from '../src/components/ui/card';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replaceAll("'", '"');

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

    it('has explicit opaque and host-owned fallbacks, not a misleading blur-only full renderer', () => {
        expect(css).toMatch(
            /\.ui-glass-material\[data-glass-renderer="solid"\]\s*\{\s*background: var\(--popover\);\s*-webkit-backdrop-filter: none;\s*backdrop-filter: none;/,
        );
        expect(css).toMatch(/html\[data-webui-target\] \.ui-glass-material\s*\{\s*display: none;/);
        expect(css).toMatch(
            /@media \(prefers-reduced-transparency: reduce\),\s*\(forced-colors: active\)/,
        );
        // Motion preference only stops animation; static refraction stays available.
        expect(css).not.toMatch(/html\[data-reduce-motion="1"\] \.ui-glass-material/);
        expect(css).not.toMatch(/html\[data-no-motion="1"\] \.ui-glass-material/);
        // Low performance skips the displacement pass, not the frosted material.
        expect(css).not.toMatch(/html\[data-low-performance="1"\] \.ui-glass-material/);
        expect(css).toMatch(
            /html\[data-low-performance="1"\] \.ui-line-field-lines\s*\{\s*animation: none !important;/,
        );
    });

    it('keeps paper actions static and reserves press scaling for glass chrome', () => {
        const card = renderToStaticMarkup(
            <Card>
                <Button>编辑</Button>
            </Card>,
        );
        expect(card).toContain('ui-card');
        expect(card).toContain('bg-card');
        expect(card).not.toContain('active:scale');
        expect(card).not.toContain('backdrop-blur');
        expect(css).toMatch(
            /html:not\(\[data-webui-target\]\) \.ui-glass \[data-press-scale\]:active:not\(:disabled\)\s*\{\s*scale: 0\.96;\s*transition-duration: 110ms;/,
        );
        expect(css).toContain('scale 420ms cubic-bezier(0.16, 1, 0.3, 1)');
        expect(renderToStaticMarkup(<Button static>编辑</Button>)).not.toContain(
            'data-press-scale',
        );
    });

    it('keeps high-contrast variables valid rather than referencing themselves', () => {
        const block = css.match(/html\[data-contrast="high"\]\s*\{([^}]+)\}/)?.[1];
        expect(block).toBeDefined();

        for (const variable of ['--border', '--input', '--muted-foreground', '--sidebar-border']) {
            const declaration = block!.match(new RegExp(`${variable}:([^;]+);`))?.[1];
            expect(declaration).toBeDefined();
            expect(declaration).not.toContain(`var(${variable})`);
            expect(declaration).toContain('var(--foreground)');
        }
    });
});
