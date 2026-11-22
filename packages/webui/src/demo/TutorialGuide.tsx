import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, BookOpen, Check, Crosshair, PanelTop } from 'lucide-react';
import { translator } from '@/i18n';
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
    onNavigate,
}: {
    api: DemoApi;
    lesson: TutorialLesson;
    language: TutorialLanguage;
    open: boolean;
    onNavigate: (route: string) => void;
}) {
    const [index, setIndex] = useState(0);
    const [verified, setVerified] = useState(false);
    const [targetPresent, setTargetPresent] = useState(false);
    const [complete, setComplete] = useState(false);
    const target = useRef<HTMLElement | null>(null);
    const message = useRef<HTMLElement | null>(null);
    const focusNewStep = useRef(false);
    const [completedSteps, setCompletedSteps] = useState(() => new Set<number>());
    const revision = useSyncExternalStore(
        api.subscribe,
        () => api.tutorialRevision,
        () => api.tutorialRevision,
    );
    const step = lesson.steps[index];
    const t = translator(language);
    const section = TUTORIAL_SECTION_ANCHORS[lesson.id][step.id];
    const reading = step.proof === 'reading';
    const last = index === lesson.steps.length - 1;
    const showSectionLink = section && typeof window !== 'undefined' && window.parent !== window;
    const previousLabel = complete ? t('重看上一步', 'Review last step') : t('上一步', 'Previous step');
    const locateLabel = targetPresent ? t('定位控件', 'Find control') : t('打开操作页', 'Open task page');
    const readLabel = t('阅读本节', 'Read section');

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
                completedSteps.has(index) ||
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
    }, [api, step, index, open, complete, completedSteps, revision]);

    useEffect(() => {
        if (!open || !focusNewStep.current) {
            return;
        }

        focusNewStep.current = false;

        const region = message.current;
        if (region) {
            region.scrollTop = 0;
            region.focus({ preventScroll: true });
        }
    }, [index, complete, open]);

    const selectStep = (next: number) => {
        focusNewStep.current = true;
        setVerified(completedSteps.has(next));
        setComplete(false);
        setIndex(next);
        onNavigate(lesson.steps[next].route);
    };

    const continueStep = () => {
        if (
            !reading &&
            !completedSteps.has(index) &&
            !tutorialStepComplete(step.proof, api.tutorialSnapshot, readTutorialSurface())
        ) {
            setVerified(false);
            return;
        }

        setCompletedSteps((steps) => steps.has(index) ? steps : new Set(steps).add(index));

        if (last) {
            focusNewStep.current = true;
            setComplete(true);
        } else {
            selectStep(index + 1);
        }
    };

    const locateControl = () => {
        const element = target.current;

        if (!element?.isConnected) {
            onNavigate(step.route);
            return;
        }

        const selector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]';
        element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        const control = element.matches(selector) ? element : element.querySelector<HTMLElement>(selector);
        control?.focus({ preventScroll: true });
    };

    const readSection = () => {
        const request: TutorialSectionRequest = {
            type: 'nowluma-tutorial-section',
            tutorial: lesson.id,
            step: step.id,
            lang: language,
        };
        window.parent.postMessage(request, window.location.origin);
    };

    if (!open) {
        return null;
    }

    return (
        <aside
            id="demo-guide"
            className="demo-tutorial-guide ui-glass-raised"
            aria-label={t('本章引导', 'Chapter guide')}
            data-tutorial-lesson={lesson.id}
            data-tutorial-step={complete ? 'complete' : step.id}
            data-tutorial-verified={verified ? 'true' : 'false'}
            data-tutorial-section={section?.[language]}
        >
            <div className="demo-tutorial-meter">
                <span>
                    <span className="sr-only">{t('步骤', 'Step')} </span>
                    <strong>{index + 1}</strong>
                    {' / '}
                    {lesson.steps.length}
                </span>
                <progress
                    value={completedSteps.size}
                    max={lesson.steps.length}
                    aria-label={t('已完成步骤', 'Completed steps')}
                />
            </div>
            <section
                ref={message}
                className="demo-tutorial-message"
                aria-labelledby="tutorial-objective"
                aria-describedby={complete ? undefined : 'tutorial-hint'}
                data-tutorial-complete={complete ? 'true' : undefined}
                role={complete ? 'status' : undefined}
                tabIndex={0}
            >
                <h2 id="tutorial-objective">
                    {complete ? t('本章练习已完成', 'Chapter complete') : tutorialText(step.title, language)}
                </h2>
                {!complete && <p id="tutorial-hint">{tutorialText(step.hint, language)}</p>}
            </section>
            <div className="demo-tutorial-actions">
                <button
                    type="button"
                    className="demo-button demo-icon-button"
                    disabled={!complete && index === 0}
                    onClick={() => selectStep(complete ? lesson.steps.length - 1 : index - 1)}
                    aria-label={previousLabel}
                    title={previousLabel}
                >
                    <ArrowLeft aria-hidden="true" />
                </button>
                {!complete && (
                    <>
                        {!reading && (
                            <button
                                type="button"
                                className="demo-button demo-tutorial-tool"
                                onClick={locateControl}
                                aria-label={locateLabel}
                                title={locateLabel}
                            >
                                {targetPresent ? <Crosshair aria-hidden="true" /> : <PanelTop aria-hidden="true" />}
                                <span>{locateLabel}</span>
                            </button>
                        )}
                        {showSectionLink && (
                            <button
                                type="button"
                                className="demo-button demo-icon-button"
                                data-tutorial-read-section="true"
                                aria-label={readLabel}
                                title={readLabel}
                                onClick={readSection}
                            >
                                <BookOpen aria-hidden="true" />
                            </button>
                        )}
                        {!reading && (
                            <span id="tutorial-proof" className="sr-only" role="status" data-tutorial-proof={step.proof}>
                                {verified ? t('操作已完成', 'Task done') : t('待完成当前操作', 'Awaiting the current task')}
                            </span>
                        )}
                        <button
                            type="button"
                            className="demo-button demo-primary-button"
                            disabled={!reading && !verified}
                            data-tutorial-continue="true"
                            aria-describedby={reading ? 'tutorial-hint' : 'tutorial-proof'}
                            onClick={continueStep}
                        >
                            {verified && !reading && <Check aria-hidden="true" />}
                            {reading
                                ? t('继续', 'Continue')
                                : last
                                  ? t('完成', 'Finish')
                                  : t('下一步', 'Next')}
                        </button>
                    </>
                )}
            </div>
        </aside>
    );
}
