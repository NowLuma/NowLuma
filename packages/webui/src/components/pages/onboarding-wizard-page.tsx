import { useState, type ReactNode } from 'react';
import { useReducedMotionConfig } from 'motion/react';
import { Check, Loader2, ScrollText, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { LineField } from '@/components/ui/line-field';
import { SegmentedControl } from '@/components/interior/segmented-control';
import {
    useWizardNavigation,
    WizardSteps,
    type WizardStep,
} from '@/components/interior/wizard-steps';
import { ChangePasswordForm, type PasswordRule } from '@/components/pages/change-password-form';
import {
    advanceOnboardingStep,
    buildRequiredOnboardingStepIds,
} from '@/components/pages/onboarding-steps';
import { Markdown } from '@/lib/markdown';
import { cn } from '@/lib/utils';
import type { AgreementDoc } from '@/lib/api/types';
import { BRAND_LOGO_URL } from '@/brand';
import { APP_NAME } from '@/types';
import { useTheme } from '@/contexts/ThemeContext';
import '@/styles/workspace.css';

export interface AdditionalOnboardingStep {
    id: string;
    label: string;
    content: ReactNode;
    canSkip: boolean;
    onSkip?: () => void;
    hideAdvance?: boolean;
}

interface OnboardingWizardPageProps {
    documents: AgreementDoc[];
    agreementVersion: string;
    needsConsent: boolean;
    mustChangePassword: boolean;
    knownOldPassword?: string;
    passwordMode?: 'change' | 'rehearsal';
    onAccept: () => Promise<{ success: boolean; message?: string }>;
    onConsentComplete: () => void;
    onDecline: () => void;
    checkStrength: (password: string) => Promise<{ rules: PasswordRule[]; valid: boolean }>;
    submitPassword: (
        oldPassword: string,
        newPassword: string,
    ) => Promise<{ success: boolean; message?: string }>;
    onPasswordComplete: () => void;
    onComplete: () => void;
    additionalSteps?: AdditionalOnboardingStep[];
}

const DOCUMENT_LABELS: Record<AgreementDoc['id'], string> = {
    eula: '使用说明',
    privacy: '隐私说明',
};

export function OnboardingWizardPage({
    documents,
    agreementVersion,
    needsConsent,
    mustChangePassword,
    knownOldPassword,
    passwordMode = 'change',
    onAccept,
    onConsentComplete,
    onDecline,
    checkStrength,
    submitPassword,
    onPasswordComplete,
    onComplete,
    additionalSteps = [],
}: OnboardingWizardPageProps) {
    const { appearance } = useTheme();
    const reduced = useReducedMotionConfig() || appearance.reduceMotion || appearance.disableMotion;
    const [requiredStepIds] = useState(() =>
        buildRequiredOnboardingStepIds({
            needsConsent,
            mustChangePassword,
        }),
    );
    const [index, setIndex] = useState(0);

    const total = requiredStepIds.length + additionalSteps.length;

    const advanceFrom = (stepId: string) => {
        const order = [...requiredStepIds, ...additionalSteps.map((step) => step.id)];
        const advance = advanceOnboardingStep(order, stepId);

        if (advance.complete) {
            onComplete();
            return;
        }

        setIndex(advance.nextIndex);
    };

    const required: WizardStep[] = requiredStepIds.map((stepId) => {
        if (stepId === 'agreements') {
            return {
                id: stepId,
                label: '阅读使用说明',
                canSkip: false,
                hideAdvance: true,
                hideBack: true,
                scrollMode: 'content',
                content: (
                    <AgreementStep
                        documents={documents}
                        version={agreementVersion}
                        onAccept={onAccept}
                        onDecline={onDecline}
                        onComplete={() => {
                            onConsentComplete();
                            advanceFrom(stepId);
                        }}
                    />
                ),
            };
        }

        return {
            id: stepId,
            label: '设置访问密码',
            canSkip: false,
            hideAdvance: true,
            hideBack: true,
            content: (
                <PasswordStep
                    knownOldPassword={knownOldPassword}
                    mode={passwordMode}
                    checkStrength={checkStrength}
                    submit={submitPassword}
                    onComplete={() => {
                        onPasswordComplete();
                        advanceFrom(stepId);
                    }}
                />
            ),
        };
    });

    const steps: WizardStep[] = [
        ...required,
        ...additionalSteps.map((step) => ({
            id: step.id,
            label: step.label,
            content: step.content,
            canSkip: step.canSkip,
            onSkip: step.onSkip,
            hideAdvance: step.hideAdvance,
        })),
    ];

    if (total === 0) {
        return null;
    }

    return (
        <div className="workspace-onboarding-shell bg-background antialiased">
            <header className="workspace-auth-masthead">
                <div className="workspace-auth-wordmark">
                    <img src={BRAND_LOGO_URL} alt="" className="size-7 rounded-md" />
                    <span>{APP_NAME}</span>
                </div>
                <div className="workspace-toolbar-scene">
                    <ThemeToggle />
                </div>
            </header>
            <div className="workspace-onboarding-layout">
                <aside className="workspace-onboarding-identity" aria-label="首次使用设置">
                    <div className="workspace-auth-artwork">
                        <LineField animated={!reduced} />
                        <div className="workspace-auth-artwork-caption">
                            <span>{APP_NAME}</span>
                            <span>开始连接</span>
                        </div>
                    </div>
                    <p className="workspace-eyebrow mt-6">从这里开始</p>
                    <p className="workspace-auth-statement">
                        连接之前，
                        <br />
                        准备就绪。
                    </p>
                </aside>
                <main className="workspace-onboarding-document">
                    <header className="workspace-onboarding-heading">
                        <p className="workspace-eyebrow">欢迎使用 {APP_NAME}</p>
                        <h1>完成首次使用设置</h1>
                    </header>
                    <WizardSteps
                        steps={steps}
                        index={index}
                        onIndexChange={setIndex}
                        onComplete={onComplete}
                        label="首次使用设置步骤"
                        backLabel="上一步"
                        nextLabel="下一步"
                        finishLabel="完成"
                        skipLabel="跳过"
                        spacious
                        fill
                    />
                </main>
            </div>
        </div>
    );
}

function AgreementStep({
    documents,
    version,
    onAccept,
    onDecline,
    onComplete,
}: {
    documents: AgreementDoc[];
    version: string;
    onAccept: () => Promise<{ success: boolean; message?: string }>;
    onDecline: () => void;
    onComplete: () => void;
}) {
    const [activeId, setActiveId] = useState(documents[0]?.id ?? 'eula');
    const [agreed, setAgreed] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const active = documents.find((document) => document.id === activeId) ?? documents[0];

    const accept = async () => {
        if (!agreed || submitting) {
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const result = await onAccept();

            if (result.success) {
                onComplete();
                return;
            }

            setError(result.message ?? '提交失败，请重试');
        } catch (caught) {
            console.error('record onboarding consent failed', caught);
            setError(caught instanceof Error ? caught.message : '网络错误，请重试');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-start gap-3 sm:gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20 sm:size-12 sm:rounded-2xl">
                    <ScrollText className="size-5 text-primary" />
                </div>
                <div className="min-w-0">
                    <h2 className="text-balance text-lg font-semibold tracking-tight sm:text-xl">
                        阅读使用说明
                    </h2>
                    <p className="mt-0.5 max-w-2xl text-pretty text-xs leading-relaxed text-muted-foreground sm:mt-1 sm:text-sm">
                        阅读后确认，即可继续设置。
                    </p>
                </div>
            </div>

            {documents.length > 1 ? (
                <div className="mt-3 max-w-full overflow-x-auto pb-1 sm:mt-4">
                    <SegmentedControl
                        label="说明文档"
                        value={activeId}
                        onValueChange={(next) => setActiveId(next as AgreementDoc['id'])}
                        options={documents.map((document) => ({
                            value: document.id,
                            label: DOCUMENT_LABELS[document.id],
                        }))}
                    />
                </div>
            ) : null}

            {active && (active.declaredVersion || active.effectiveDate) ? (
                <p className="mt-1.5 px-0.5 text-meta leading-relaxed text-muted-foreground">
                    {active.declaredVersion ? `版本 / Version ${active.declaredVersion}` : ''}
                    {active.declaredVersion && active.effectiveDate ? ' · ' : ''}
                    {active.effectiveDate ? `生效 / Effective ${active.effectiveDate}` : ''}
                </p>
            ) : null}

            <div
                className="workspace-agreement-reading mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[4px] border border-border bg-card p-3 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
                tabIndex={0}
                aria-label={active ? `${DOCUMENT_LABELS[active.id]}正文` : '说明正文'}
            >
                <div className="mx-auto max-w-[44.25rem]">
                    {active ? (
                        <Markdown content={active.text} />
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            未能加载说明文本，请刷新页面重试。
                        </p>
                    )}
                </div>
            </div>

            <button
                type="button"
                onClick={() => setAgreed((current) => !current)}
                aria-pressed={agreed}
                className={cn(
                    'mt-3 flex min-h-11 w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-start outline-none transition-[background-color,border-color,box-shadow] duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:min-h-12 sm:px-4 sm:py-3',
                    agreed
                        ? 'border-primary/60 bg-primary/5'
                        : 'border-border hover:border-primary/40 hover:bg-accent/40',
                )}
            >
                <span
                    className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors',
                        agreed
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/50 bg-background',
                    )}
                >
                    {agreed ? <Check className="size-3.5" strokeWidth={3} /> : null}
                </span>
                <span className="text-sm font-medium leading-relaxed">
                    我已阅读《使用说明》和《隐私说明》
                </span>
            </button>

            {error ? (
                <p role="alert" className="mt-2 text-xs text-destructive">
                    {error}
                </p>
            ) : null}

            <div className="mt-3 flex items-center gap-3 sm:justify-between">
                <span className="hidden text-micro text-muted-foreground/70 sm:inline">
                    说明版本 {version.slice(0, 8)}
                </span>
                <div className="workspace-onboarding-actions grid w-full grid-cols-2 gap-3 sm:ml-auto sm:flex sm:w-auto sm:items-center">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onDecline}
                        disabled={submitting}
                        className="h-11 w-full sm:w-auto"
                    >
                        退出
                    </Button>
                    <Button
                        type="button"
                        onClick={() => {
                            void accept();
                        }}
                        disabled={!agreed || submitting}
                        className="h-11 w-full sm:min-w-36 sm:w-auto"
                    >
                        <ShieldCheck className="size-4" />
                        {submitting ? '提交中…' : '确认并继续'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function PasswordStep({
    knownOldPassword,
    mode,
    checkStrength,
    submit,
    onComplete,
}: {
    knownOldPassword?: string;
    mode: 'change' | 'rehearsal';
    checkStrength: (password: string) => Promise<{ rules: PasswordRule[]; valid: boolean }>;
    submit: (
        oldPassword: string,
        newPassword: string,
    ) => Promise<{ success: boolean; message?: string }>;
    onComplete: () => void;
}) {
    const { back } = useWizardNavigation();

    return (
        <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-start py-2 sm:py-5">
            <div className="mb-8 flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                    <ShieldAlert className="size-5 text-primary" />
                </div>
                <div className="min-w-0">
                    <h2 className="text-balance text-lg font-semibold tracking-tight sm:text-xl">
                        设置新的访问密码
                    </h2>
                    <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
                        {mode === 'rehearsal'
                            ? '验证密码设置步骤的界面与规则；本次演练不会保存输入内容。'
                            : '将首次启动生成的临时密码替换为符合要求的强密码。'}
                    </p>
                </div>
            </div>
            <ChangePasswordForm
                knownOldPassword={knownOldPassword}
                mode={mode}
                checkStrength={checkStrength}
                submit={submit}
                onSuccess={onComplete}
                idPrefix="onboarding-cpw"
                submitLabel={mode === 'rehearsal' ? '完成演练' : '保存并完成'}
                className="gap-5"
                renderActions={({ canAttempt, submitting, submitLabel }) => (
                    <div className="workspace-onboarding-actions grid gap-3 pt-2 sm:flex sm:items-center">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={back}
                            disabled={submitting}
                            className="h-11 w-full sm:w-auto"
                        >
                            上一步
                        </Button>
                        <Button
                            type="submit"
                            disabled={!canAttempt}
                            className="h-11 w-full sm:ml-auto sm:min-w-36 sm:w-auto"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="size-4 animate-spin" /> 提交中…
                                </>
                            ) : (
                                submitLabel
                            )}
                        </Button>
                    </div>
                )}
            />
        </div>
    );
}
