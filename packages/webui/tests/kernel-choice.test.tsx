import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormEvent, ReactElement } from 'react';
import {
    KernelCatalogPreview,
    KernelChoiceDialog,
    KernelChoiceForm,
} from '../src/components/kernel-choice';
import { demoKernelCatalog } from '../src/demo/fixtures';
import { elements, hookHost } from './helpers/hook-host';

vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));

const catalog = demoKernelCatalog();
afterEach(() => vi.restoreAllMocks());

function formCallbacks(onConfirm = vi.fn(async () => undefined)) {
    const host = hookHost();
    const onCancel = vi.fn();
    const render = () =>
        host.render(() => KernelChoiceForm({ uin: '10001', catalog, onConfirm, onCancel }));

    const select = (value: 'compat' | 'rewrite') => {
        const options = elements(render()).find(
            (element) =>
                typeof element.type === 'function' && element.type.name === 'KernelOptions',
        )!;
        (options.props.onSelect as (value: string) => void)(value);
    };

    const acknowledge = () => {
        const checkbox = elements(render()).find((element) => element.props.type === 'checkbox')!;
        (checkbox.props.onChange as (event: unknown) => void)({ target: { checked: true } });
    };

    const submit = () =>
        (render().props.onSubmit as (event: FormEvent) => void)({
            preventDefault: vi.fn(),
        } as unknown as FormEvent);
    const submitButton = () =>
        elements(render()).find((element) => element.props.type === 'submit')!;
    return { render, select, acknowledge, submit, submitButton, onConfirm, onCancel };
}

describe('KernelChoiceForm', () => {
    it('starts unselected and unchecked, names the real account/risk version and disables rewrite', () => {
        const onConfirm = vi.fn();
        const html = renderToStaticMarkup(
            <KernelChoiceForm uin="10001" catalog={catalog} onConfirm={onConfirm} />,
        );
        expect(html).toContain('选择接入内核');
        expect(html).toContain('兼容内核');
        expect(html).toContain('重写内核');
        expect(html).toContain('暂不可用');
        expect(html).toContain(`风险说明版本 ${catalog.riskVersion} · 仅对 QQ 10001 生效`);
        expect(html).toContain('不免除依法不可免除的责任');
        expect(html).toContain('不改变 GPL 源码许可');
        expect(html).not.toContain('checked=""');
        expect(html).toMatch(
            /<input(?=[^>]*type="radio")(?=[^>]*value="rewrite")(?=[^>]*disabled="")[^>]*>/,
        );
        expect(html).toMatch(
            /<input(?=[^>]*type="checkbox")(?=[^>]*aria-describedby=)(?=[^>]*disabled="")[^>]*>/,
        );
        expect(html).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*disabled="")[^>]*>/);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('needs both an explicit compat selection and a new active acknowledgment before one exact save', async () => {
        const form = formCallbacks();
        form.submit();
        form.select('rewrite');
        expect(form.submitButton().props.disabled).toBe(true);
        form.select('compat');
        expect(form.submitButton().props.disabled).toBe(true);
        form.acknowledge();
        expect(form.submitButton().props.disabled).toBe(false);
        form.submit();
        form.submit();
        await vi.waitFor(() => expect(form.onConfirm).toHaveBeenCalledTimes(1));
        expect(form.onConfirm).toHaveBeenCalledWith({
            kernel: 'compat',
            riskAccepted: true,
            riskVersion: catalog.riskVersion,
        });
    });

    it('cancel does not submit, and a failed save remains visible without automatic retry', async () => {
        const form = formCallbacks(vi.fn().mockRejectedValue(new Error('策略存储失败')));
        const cancel = elements(form.render()).find(
            (element) => element.props.onClick === form.onCancel,
        )!;
        (cancel.props.onClick as () => void)();
        expect(form.onCancel).toHaveBeenCalledTimes(1);
        expect(form.onConfirm).not.toHaveBeenCalled();
        form.select('compat');
        form.acknowledge();
        form.submit();
        await vi.waitFor(() =>
            expect(
                elements(form.render()).find((element) => element.props.role === 'alert')?.props
                    .children,
            ).toContain('策略存储失败'),
        );
        expect(form.onConfirm).toHaveBeenCalledTimes(1);
        expect(form.submitButton().props.disabled).toBe(false);
    });

    it('another account form never inherits the previous acknowledgment', () => {
        const form = formCallbacks();
        form.select('compat');
        form.acknowledge();
        expect(form.submitButton().props.disabled).toBe(false);
        vi.restoreAllMocks();
        const html = renderToStaticMarkup(
            <KernelChoiceForm uin="20002" catalog={catalog} onConfirm={vi.fn()} />,
        );
        expect(html).toContain('仅对 QQ 20002 生效');
        expect(html).not.toContain('checked=""');
        expect(html).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*disabled="")[^>]*>/);
    });

    it('an accountless catalog preview has no acknowledgment or selectable input', () => {
        const html = renderToStaticMarkup(<KernelCatalogPreview catalog={catalog} />);
        expect(html.match(/type="radio"/g)).toHaveLength(2);
        expect(html.match(/disabled=""/g)).toHaveLength(2);
        expect(html).not.toContain('type="checkbox"');
    });
});

describe('KernelChoiceDialog', () => {
    it('uses the accessible house Modal and routes every close path to the same cancellation', () => {
        const host = hookHost();
        const cancel = vi.fn();
        const tree = host.render(() =>
            KernelChoiceDialog({
                choice: {
                    target: { pid: 4242, path: '/DEMO/QQ', uin: '10001', nickname: 'A' },
                    catalog,
                    cancel,
                    confirm: vi.fn(),
                },
            }),
        );
        expect(tree.props.open).toBe(true);
        expect(tree.props.title).toBe('选择接入内核');
        expect(tree.props.description).toContain('10001');
        expect(tree.props.closeLabel).toBe('取消内核选择');
        expect(tree.props.closeOnEscape).toBe(true);
        expect(tree.props.closeOnBackdrop).toBe(true);
        tree.props.onClose();
        expect(cancel).toHaveBeenCalledTimes(1);
        const child = tree.props.children as ReactElement<{ onCancel: () => void }>;
        child.props.onCancel();
        expect(cancel).toHaveBeenCalledTimes(2);
    });
});
