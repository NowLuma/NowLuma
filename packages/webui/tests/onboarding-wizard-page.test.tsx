import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingWizardPage } from '../src/components/pages/onboarding-wizard-page';

vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        appearance: { palette: 'default', reduceMotion: true, disableMotion: true },
        mode: 'system',
        setMode: vi.fn(),
    }),
    paletteResolved: () => false,
}));
vi.mock('@/contexts/ActionFeedbackContext', () => ({
    useActionFeedback: () => ({ runAction: vi.fn() }),
    actionErrorMessage: (error: unknown) => String(error),
}));

const callbacks = {
    agreementVersion: 'fixture-agreements-version',
    onAccept: vi.fn(async () => ({ success: true })),
    onConsentComplete: vi.fn(),
    onDecline: vi.fn(),
    checkStrength: vi.fn(async () => ({ rules: [], valid: false })),
    submitPassword: vi.fn(async () => ({ success: true })),
    onPasswordComplete: vi.fn(),
    onComplete: vi.fn(),
};
const documents = [
    {
        id: 'eula' as const,
        title: '使用说明',
        declaredVersion: '1.0',
        effectiveDate: '2026-06-19',
        text: '# 阅读使用说明\n\n说明正文保持为主要阅读内容。',
    },
    {
        id: 'privacy' as const,
        title: '隐私说明',
        declaredVersion: '1.0',
        effectiveDate: '2026-06-19',
        text: '# 阅读隐私说明',
    },
];

describe('OnboardingWizardPage document workspace', () => {
    it('starts with readable instructions and keeps acknowledgment before passwords', () => {
        const html = renderToStaticMarkup(
            <OnboardingWizardPage
                {...callbacks}
                documents={documents}
                needsConsent
                mustChangePassword
            />,
        );
        expect(html).toContain('workspace-onboarding-document');
        expect(html).toContain('workspace-auth-artwork');
        expect(html).toContain('完成首次使用设置');
        expect(html).toContain('aria-label="首次使用设置步骤"');
        expect(html).toContain('aria-current="step"');
        expect(html).toContain('阅读使用说明');
        expect(html).toContain('说明正文保持为主要阅读内容。');
        expect(html).toContain('aria-label="使用说明正文"');
        expect(html).toContain('aria-label="说明文档"');
        expect(html).toContain('隐私说明');
        expect(html).toContain('tabindex="0"');
        expect(html).toContain('aria-pressed="false"');
        expect(html).toContain('我已阅读《使用说明》和《隐私说明》');
        expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?确认并继续/);
        expect(html).toContain('退出');
        expect(html).not.toContain('同意并继续');
        expect(html).not.toContain('不同意并退出');
        expect(html).not.toContain('跳过');
        expect(html).not.toContain('id="onboarding-cpw-new"');
    });

    it('uses instruction labels with the existing eula and privacy identifiers', () => {
        const html = renderToStaticMarkup(
            <OnboardingWizardPage
                {...callbacks}
                documents={documents.map((document) => ({
                    ...document,
                    title: document.id === 'eula' ? '用户协议 / EULA' : '隐私政策 / Privacy',
                }))}
                needsConsent
                mustChangePassword={false}
            />,
        );
        expect(html).toContain('aria-label="说明文档"');
        expect(html).toContain('aria-label="使用说明正文"');
        expect(html).toContain('我已阅读《使用说明》和《隐私说明》');
        expect(html).not.toContain('用户协议');
        expect(html).not.toContain('隐私政策');
    });

    it('keeps password fields, validation owner and the responsive action footer after consent', () => {
        const html = renderToStaticMarkup(
            <OnboardingWizardPage
                {...callbacks}
                documents={documents}
                needsConsent={false}
                mustChangePassword
                knownOldPassword="Fixture-Password-1!"
            />,
        );
        expect(html).toContain('id="onboarding-cpw-new"');
        expect(html).toContain('id="onboarding-cpw-confirm"');
        expect(html).not.toContain('id="onboarding-cpw-old"');
        expect(html).not.toContain('Fixture-Password-1!');
        expect(html).toContain('autoComplete="new-password"');
        expect(html).toContain('workspace-onboarding-actions');
        expect(html).toContain('保存并完成');
        expect(html).not.toContain('跳过');
        expect(html).not.toContain('说明正文保持为主要阅读内容。');
    });

    it('does not create a shell for completed onboarding and retains optional extension steps', () => {
        expect(
            renderToStaticMarkup(
                <OnboardingWizardPage
                    {...callbacks}
                    documents={documents}
                    needsConsent={false}
                    mustChangePassword={false}
                />,
            ),
        ).toBe('');
        const html = renderToStaticMarkup(
            <OnboardingWizardPage
                {...callbacks}
                documents={documents}
                needsConsent={false}
                mustChangePassword={false}
                additionalSteps={[
                    {
                        id: 'optional',
                        label: '可选步骤',
                        content: <p>已有扩展步骤</p>,
                        canSkip: true,
                    },
                ]}
            />,
        );
        expect(html).toContain('已有扩展步骤');
        expect(html).toContain('跳过');
    });
});
