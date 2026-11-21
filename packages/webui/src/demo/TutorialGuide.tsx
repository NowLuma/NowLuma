import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import type { DemoApi } from './api';
import { findTutorialTarget, readTutorialSurface } from './tutorial-dom';
import { tutorialStepComplete, tutorialText, type TutorialLesson } from './tutorial-lessons';
import type { TutorialLanguage } from './tutorial-options';
import { TUTORIAL_SECTION_ANCHORS, type TutorialSectionRequest } from './tutorial-sections';

export function TutorialGuide({
    api,
    lesson,
    language,
    open,
    onClose,
    onRestart,
    onNavigate,
}: {
    api: DemoApi;
    lesson: TutorialLesson;
    language: TutorialLanguage;
    open: boolean;
    onClose: () => void;
    onRestart: () => void;
    onNavigate: (route: string) => void;
}) {
    const [index, setIndex] = useState(0);
    const [verified, setVerified] = useState(false);
    const [targetPresent, setTargetPresent] = useState(false);
    const [complete, setComplete] = useState(false);
    const target = useRef<HTMLElement | null>(null);
    const completedSteps = useRef(new Set<number>());
    const revision = useSyncExternalStore(
        api.subscribe,
        () => api.tutorialRevision,
        () => api.tutorialRevision,
    );
    const step = lesson.steps[index];
    const en = language === 'en';
    const section = TUTORIAL_SECTION_ANCHORS[lesson.id][step.id];

    useEffect(() => {
        if (!open || complete) {
            return;
        }

        const inspect = () => {
            const nextTarget = findTutorialTarget(step.target);

            if (target.current !== nextTarget) {
                target.current?.removeAttribute('data-tutorial-focus');
                target.current = nextTarget;
                nextTarget?.setAttribute('data-tutorial-focus', step.id);
            }

            setTargetPresent(nextTarget !== null);
            setVerified(
                completedSteps.current.has(index) ||
                    tutorialStepComplete(step.proof, api.tutorialSnapshot, readTutorialSurface()),
            );
        };

        const observer = new MutationObserver(inspect);
        observer.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: [
                'aria-selected',
                'aria-checked',
                'aria-pressed',
                'hidden',
                'disabled',
                'value',
            ],
        });
        document.addEventListener('input', inspect, true);
        document.addEventListener('change', inspect, true);
        inspect();

        return () => {
            observer.disconnect();
            document.removeEventListener('input', inspect, true);
            document.removeEventListener('change', inspect, true);
            target.current?.removeAttribute('data-tutorial-focus');
            target.current = null;
        };
    }, [api, step, index, open, complete, revision]);

    const selectStep = (next: number) => {
        setVerified(completedSteps.current.has(next));
        setComplete(false);
        setIndex(next);
        onNavigate(lesson.steps[next].route);
    };

    if (!open) {
        return null;
    }

    return (
        <aside
            id="demo-guide"
            className="demo-tutorial-guide"
            aria-label={en ? 'Chapter guide' : '本章操作引导'}
            data-tutorial-lesson={lesson.id}
            data-tutorial-step={complete ? 'complete' : step.id}
            data-tutorial-verified={verified ? 'true' : 'false'}
            data-tutorial-section={section?.[language]}
        >
            <div className="demo-tutorial-heading">
                <strong>
                    {en ? 'Step' : '步骤'} {complete ? lesson.steps.length : index + 1} /{' '}
                    {lesson.steps.length}
                </strong>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={en ? 'Close chapter guide' : '收起本章引导'}
                >
                    ×
                </button>
            </div>
            <p className="demo-tutorial-baseline" data-tutorial-baseline={lesson.baseline}>
                {lesson.baseline === 'clean'
                    ? en
                        ? 'First setup'
                        : '首次设置'
                    : en
                      ? `Sample account preloaded · ${lesson.baseline}`
                      : `已预置示例账号 · ${lesson.baseline}`}
            </p>
            <progress
                value={complete ? lesson.steps.length : index}
                max={lesson.steps.length}
                aria-label={en ? 'Completed practice steps' : '已完成练习步骤'}
            />
            {complete ? (
                <div role="status" data-tutorial-complete="true">
                    <h2>{en ? 'Chapter practice completed' : '本章练习已完成'}</h2>
                    <p>
                        {en
                            ? 'All chapter steps are complete. Continue reading below, or repeat an earlier step.'
                            : '本章步骤已完成。可继续阅读下方正文，或返回重看。'}
                    </p>
                </div>
            ) : (
                <section aria-labelledby="tutorial-objective">
                    <h2 id="tutorial-objective">{tutorialText(step.title, language)}</h2>
                    <p id="tutorial-hint">{tutorialText(step.hint, language)}</p>
                    <p
                        className="demo-tutorial-proof"
                        role="status"
                        data-tutorial-proof={step.proof}
                    >
                        {step.proof === 'reading'
                            ? en
                                ? 'Read, then acknowledge to continue.'
                                : '阅读后确认，继续下一步。'
                            : verified
                              ? en
                                  ? 'Result confirmed.'
                                  : '已确认操作结果。'
                              : en
                                ? 'Complete the current operation to continue.'
                                : '完成当前操作后继续。'}
                    </p>
                </section>
            )}
            <div className="demo-tutorial-actions">
                <Button
                    size="sm"
                    variant="outline"
                    disabled={!complete && index === 0}
                    onClick={() => selectStep(complete ? lesson.steps.length - 1 : index - 1)}
                >
                    {en ? 'Previous / repeat' : '上一步 / 重看'}
                </Button>
                {!complete && (
                    <>
                        <Button size="sm" variant="outline" onClick={() => onNavigate(step.route)}>
                            {en ? 'Open console page' : '打开操作页'}
                        </Button>
                        {typeof window !== 'undefined' && window.parent !== window && section && (
                            <Button
                                size="sm"
                                variant="outline"
                                data-tutorial-read-section="true"
                                onClick={() => {
                                    const request: TutorialSectionRequest = {
                                        type: 'nowluma-tutorial-section',
                                        tutorial: lesson.id,
                                        step: step.id,
                                        lang: language,
                                    };
                                    window.parent.postMessage(request, window.location.origin);
                                }}
                            >
                                {en ? 'Read this section' : '阅读对应小节'}
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={!targetPresent}
                            onClick={() => {
                                const element = target.current;

                                if (!element) {
                                    return;
                                }

                                element.scrollIntoView({ block: 'center', behavior: 'instant' });
                                const control = element.matches(
                                    'button, input, select, textarea, a, [tabindex]',
                                )
                                    ? element
                                    : element.querySelector<HTMLElement>(
                                          'button, input:not([disabled]), select, textarea, a, [tabindex]',
                                      );
                                control?.focus({ preventScroll: true });
                            }}
                        >
                            {en ? 'Find highlighted control' : '定位高亮操作'}
                        </Button>
                        <Button
                            size="sm"
                            disabled={step.proof !== 'reading' && !verified}
                            data-tutorial-continue="true"
                            onClick={() => {
                                if (
                                    step.proof !== 'reading' &&
                                    !completedSteps.current.has(index) &&
                                    !tutorialStepComplete(
                                        step.proof,
                                        api.tutorialSnapshot,
                                        readTutorialSurface(),
                                    )
                                ) {
                                    setVerified(false);
                                    return;
                                }

                                completedSteps.current.add(index);

                                if (index === lesson.steps.length - 1) {
                                    setComplete(true);
                                } else {
                                    selectStep(index + 1);
                                }
                            }}
                        >
                            {step.proof === 'reading'
                                ? en
                                    ? 'I understand, continue'
                                    : '我已理解，继续'
                                : index === lesson.steps.length - 1
                                  ? en
                                      ? 'Finish'
                                      : '完成'
                                  : en
                                    ? 'Continue'
                                    : '下一步'}
                        </Button>
                    </>
                )}
                <Button size="sm" variant="outline" onClick={onRestart}>
                    {en ? 'Restart chapter' : '重新练习本章'}
                </Button>
            </div>
        </aside>
    );
}
