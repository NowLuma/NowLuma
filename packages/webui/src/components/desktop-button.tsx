import { Monitor } from 'lucide-react';
import { useAppState } from '@/contexts/AppStateContext';
import { Button } from '@/components/ui/button';

/** Open the integrated desktop only when this server reports it is actually served. */
export function DesktopButton() {
    const { systemInfo } = useAppState();

    if (systemInfo?.deployment?.desktopAvailable !== true) {
        return null;
    }

    return (
        <Button size="sm" variant="outline" asChild>
            <a href="/desktop/" target="_blank" rel="noopener noreferrer">
                <Monitor className="size-3.5" /> 打开 QQ 桌面
            </a>
        </Button>
    );
}
