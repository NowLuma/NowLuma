import { useReducer, useState } from 'react';
import { AlertTriangle, Bug, RotateCcw } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DeveloperCrashProbe, developerCrashReducer } from '@/components/settings/developer-tools';
import { Group, SettingRow } from '@/components/settings/settings-controls';
import { Button } from '@/components/ui/button';
import { useSession } from '@/contexts/SessionContext';

// ─────────────── 开发者 ───────────────

export function DeveloperPanel() {
    const { restartOnboarding } = useSession();
    const [confirmOnboarding, setConfirmOnboarding] = useState(false);
    const [confirmCrash, setConfirmCrash] = useState(false);
    const [crashRequested, requestCrash] = useReducer(developerCrashReducer, false);

    return (
        <div className="flex flex-col gap-5">
            {/* Event-handler errors bypass React boundaries; the probe throws on render. */}
            <DeveloperCrashProbe requested={crashRequested} />
            <Group
                title="界面测试"
                icon={Bug}
                description="直接验证首次使用流程与页面级异常恢复；这些工具始终可见，不受环境开关限制。"
            >
                <SettingRow
                    label="首次使用引导"
                    hint="以演练模式重新进入完整引导，不会修改协议确认记录或真实访问密码。"
                >
                    <Button variant="outline" size="sm" onClick={() => setConfirmOnboarding(true)}>
                        <RotateCcw className="size-4" /> 重新进入
                    </Button>
                </SettingRow>
                <SettingRow
                    label="崩溃界面"
                    hint="主动抛出测试异常并交给页面错误边界；在崩溃界面点击“重试”即可返回。"
                >
                    <Button variant="destructive" size="sm" onClick={() => setConfirmCrash(true)}>
                        <AlertTriangle className="size-4" /> 触发崩溃
                    </Button>
                </SettingRow>
            </Group>

            <ConfirmDialog
                open={confirmOnboarding}
                onOpenChange={setConfirmOnboarding}
                title="重新进入首次使用引导？"
                description="将以演练模式展示完整流程，不会修改协议确认记录或真实访问密码。"
                confirmText="进入引导"
                onConfirm={restartOnboarding}
            />

            <ConfirmDialog
                open={confirmCrash}
                onOpenChange={setConfirmCrash}
                title="触发 WebUI 崩溃测试？"
                description="当前设置页面将主动抛出测试异常，并交由崩溃界面接管。"
                confirmText="触发崩溃"
                destructive
                onConfirm={() => requestCrash('confirm')}
            />
        </div>
    );
}
