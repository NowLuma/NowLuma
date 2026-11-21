import type { TutorialSurface, TutorialTarget } from './tutorial-lessons';

// Targets are compiled lesson definitions, never supplied by query strings or a parent.
export function findTutorialTarget(
    target: TutorialTarget,
    root: ParentNode = document,
): HTMLElement | null {
    for (const element of root.querySelectorAll<HTMLElement>(target.selector)) {
        if (
            target.text &&
            element.textContent?.trim() !== target.text &&
            element.getAttribute('aria-label') !== target.text
        ) {
            continue;
        }

        if (
            target.rowLabel &&
            element.parentElement?.querySelector('p')?.textContent?.trim() !== target.rowLabel
        ) {
            continue;
        }

        if (element.closest('[hidden], [inert], [aria-hidden="true"]')) {
            continue;
        }

        const style = element.ownerDocument.defaultView?.getComputedStyle(element);

        if (style?.display === 'none' || style?.visibility === 'hidden') {
            continue;
        }

        // Sr-only radio/checkbox inputs highlight their real visible label instead.
        return element.matches('input[type="radio"], input[type="checkbox"]')
            ? (element.closest<HTMLElement>('label') ?? element)
            : element;
    }

    return null;
}

export function readTutorialSurface(root: ParentNode = document): TutorialSurface {
    const present = (selector: string) => findTutorialTarget({ selector }, root) !== null;
    const filter = root.querySelector<HTMLInputElement>(
        '.demo-console input[aria-label="搜索消息 / 模块 / 级别"]',
    );
    const logRows = root.querySelector('.demo-console [aria-label="日志内容"]');
    return {
        console: present('.demo-console main .workspace-display-title'),
        process: present('.demo-console [aria-label="进程详情"] .cp-facts'),
        accountConfig: present('#config-panel-general'),
        httpConfig: present('#config-panel-httpServers'),
        logs: present('.demo-console [aria-label="日志内容"] .cp-log-row'),
        logFiltered:
            filter?.value.trim().toUpperCase() === 'DEMO' &&
            present('.demo-console [aria-label="日志内容"] .cp-log-row') &&
            (logRows?.textContent?.includes('DEMO') ?? false),
        debug: present('.demo-console [aria-label="运行调用"]'),
        appearance: present('.demo-console [aria-label="外观"] [aria-label="动效"]'),
        service: present('.demo-console [aria-label="服务"] [aria-label="端口"]'),
        storage: present('.demo-console [aria-label="存储管理"] [aria-label="保留天数"]'),
        diagnostics:
            findTutorialTarget({ selector: '.demo-console button', text: '复制诊断' }, root) !==
                null &&
            (root
                .querySelector('.demo-console [aria-label="服务"]')
                ?.textContent?.includes('当前服务 HOME') ??
                false),
    };
}
