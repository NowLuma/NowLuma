import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { shouldWarnAboutInsecureRemoteAccess } from '@/lib/transport-security';
import { useT } from '@/i18n';

const DISMISS_KEY = 'nowluma.insecure-remote-access.dismissed.v1';

function readDismissed(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    try {
        return window.localStorage.getItem(DISMISS_KEY) === '1';
    } catch (error) {
        console.warn('failed to read insecure transport notice preference', error);
        return false;
    }
}

export function InsecureRemoteAccessBanner() {
    const [dismissed, setDismissed] = useState(readDismissed);
    const t = useT();
    const visible =
        typeof window !== 'undefined' &&
        shouldWarnAboutInsecureRemoteAccess(window.location) &&
        !dismissed;

    if (!visible) {
        return null;
    }

    const dismiss = () => {
        setDismissed(true);

        try {
            window.localStorage.setItem(DISMISS_KEY, '1');
        } catch (error) {
            console.warn('failed to persist insecure transport notice preference', error);
        }
    };

    return (
        <div
            role="alert"
            className="relative z-[100] flex max-h-[35dvh] shrink-0 items-start justify-center gap-3 overflow-y-auto border-b border-amber-500/35 bg-amber-100 px-4 py-2.5 text-sm text-amber-950 shadow-sm dark:bg-amber-950 dark:text-amber-100"
        >
            <AlertTriangle className="mt-1 size-4 shrink-0" aria-hidden="true" />
            <p className="max-w-4xl leading-relaxed">
                {t(
                    '远程 HTTP 未加密。请启用 HTTPS 或通过 SSH 隧道访问控制台。',
                    'Remote HTTP is unencrypted. Use HTTPS or an SSH tunnel to access the console.',
                )}
            </p>
            <button
                type="button"
                aria-label={t('关闭远程 HTTP 访问提醒', 'Dismiss remote HTTP access warning')}
                className="-my-1 ml-auto inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
                onClick={dismiss}
            >
                <X className="size-4" aria-hidden="true" />
            </button>
        </div>
    );
}
