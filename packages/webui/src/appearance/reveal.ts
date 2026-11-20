// Light/dark reveal (View Transitions API). Where the user last clicked, so the
// theme reveal emanates from there.
import { flushSync } from 'react-dom';

let lastPointer: { x: number; y: number } | null = null;

/** Track the last pointer-down so the reveal can emanate from it. */
export function trackRevealOrigin(): () => void {
    const onDown = (e: PointerEvent) => {
        lastPointer = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('pointerdown', onDown, { capture: true });
    return () => window.removeEventListener('pointerdown', onDown, { capture: true });
}

/** Run `apply` (a synchronous state commit) inside a circular light/dark
 *  reveal centered on the last click. flushSync forces the DOM to update inside
 *  the transition callback so the "after" snapshot is captured. Falls back to
 *  an instant apply where View Transitions aren't supported (e.g. Firefox). */
export function runThemeReveal(apply: () => void): void {
    const doc = document as Document & {
        startViewTransition?: (cb: () => void) => { finished?: Promise<unknown> };
    };
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (
        typeof doc.startViewTransition !== 'function' ||
        document.visibilityState === 'hidden' ||
        reduced
    ) {
        apply();
        return;
    }

    const root = document.documentElement;
    const x = lastPointer?.x ?? window.innerWidth / 2;
    const y = lastPointer?.y ?? window.innerHeight / 2;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    root.style.setProperty('--vt-x', `${x}px`);
    root.style.setProperty('--vt-y', `${y}px`);
    root.style.setProperty('--vt-r', `${r}px`);

    try {
        const transition = doc.startViewTransition(() => flushSync(apply));
        void (transition?.finished ?? Promise.resolve()).catch(() => {});
    } catch {
        apply();
    }
}
