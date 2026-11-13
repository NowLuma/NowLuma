import { Monitor } from 'lucide-react';
import { desktopLink } from '@nowluma/common/desktop-url';
import { useAppState } from '@/contexts/AppStateContext';
import { Button } from '@/components/ui/button';

/** Open an already-running desktop; this does not log into QQ or expose a session token. */
export function DesktopButton() {
    const { systemInfo } = useAppState();
    const desktop = systemInfo?.deployment;

    if (!desktop || (desktop.vncPort === 0 && !desktop.vncUrl)) {
        return null;
    }

    let href: string | null;

    try {
        href = desktopLink(desktop.vncPort, desktop.vncUrl, window.location.href);
    } catch {
        return (
            <span role="alert" className="text-xs text-destructive">
                桌面地址无效，请检查系统设置。
            </span>
        );
    }

    if (!href) {
        return null;
    }

    return (
        <Button size="sm" variant="outline" asChild>
            <a href={href} target="_blank" rel="noopener noreferrer">
                <Monitor className="size-3.5" /> 打开 QQ 桌面
            </a>
        </Button>
    );
}
