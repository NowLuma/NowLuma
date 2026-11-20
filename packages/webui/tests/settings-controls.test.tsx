import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as segmentedControl from '../src/components/interior/segmented-control';
import { Group, Segmented, SettingRow } from '../src/components/settings/settings-controls';

afterEach(() => vi.restoreAllMocks());

describe('settings-controls', () => {
    it('keeps the row label and numeric option values across the shared segmented control', () => {
        const control = vi.spyOn(segmentedControl, 'SegmentedControl');
        const onChange = vi.fn();
        const html = renderToStaticMarkup(
            <Group title="数据刷新">
                <SettingRow label="轮询间隔">
                    <Segmented
                        value={0}
                        options={[
                            { value: 0, label: '暂停' },
                            { value: 5000, label: '5 秒' },
                        ]}
                        onChange={onChange}
                    />
                </SettingRow>
            </Group>,
        );
        const props = control.mock.calls[0][0];
        expect(props.label).toBe('轮询间隔');
        expect(props.value).toBe('0');
        expect(html).toContain('role="radiogroup" aria-label="轮询间隔"');
        const labelId = html.match(/<p id="([^"]+)"/)?.[1];
        expect(labelId).toBeDefined();
        expect(html).toContain(`aria-labelledby="${labelId}"`);

        props.onValueChange?.('5000');
        props.onValueChange?.('0');
        props.onValueChange?.('unknown');
        expect(onChange.mock.calls).toEqual([[5000], [0]]);
    });

    it('keeps the standalone accessible name and disables every option', () => {
        const control = vi.spyOn(segmentedControl, 'SegmentedControl');
        const html = renderToStaticMarkup(
            <Segmented
                value="dark"
                options={[
                    { value: 'light', label: '浅色' },
                    { value: 'dark', label: '深色' },
                ]}
                onChange={() => undefined}
                disabled
            />,
        );
        const props = control.mock.calls[0][0];
        expect(props.label).toBe('选项');
        expect(props.options.every((option) => option.disabled)).toBe(true);
        expect(html).toContain('role="radiogroup" aria-label="选项"');
        expect(html.match(/role="radio"[^>]+aria-disabled="true"/g)).toHaveLength(2);
    });
});
