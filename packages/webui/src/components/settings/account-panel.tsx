import { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { ChangePasswordDialog } from '@/components/change-password-dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Group, SettingRow } from '@/components/settings/settings-controls';
import { TotpPanel } from '@/components/settings/totp-panel';
import { Button } from '@/components/ui/button';
import { useAppState } from '@/contexts/AppStateContext';

// ─────────────── 账号安全 ───────────────

export function AccountPanel() {
    const { onLogout } = useAppState();
    const [showChangePwd, setShowChangePwd] = useState(false);
    const [pwdSavedAt, setPwdSavedAt] = useState<number | null>(null);
    const [confirmLogout, setConfirmLogout] = useState(false);

    return (
        <div className="flex min-w-0 flex-col gap-7">
            <Group title="访问密码" icon={KeyRound}>
                <SettingRow
                    label="访问密码"
                    hint={
                        pwdSavedAt ? (
                            <span className="text-success">
                                已更新（{new Date(pwdSavedAt).toLocaleTimeString()}）—
                                其他设备的会话已失效。
                            </span>
                        ) : (
                            '修改后其他设备的会话将立即失效。'
                        )
                    }
                >
                    <Button variant="glass" size="sm" onClick={() => setShowChangePwd(true)}>
                        <KeyRound className="size-4" /> 修改密码
                    </Button>
                </SettingRow>
                <details className="py-3 text-xs text-muted-foreground">
                    <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        密码存储
                    </summary>
                    <p className="max-w-prose leading-relaxed">
                        管理员账号为 admin；密码以 scrypt 哈希保存在{' '}
                        <code className="font-mono">config/webui.json</code>。
                    </p>
                </details>

            </Group>

            <TotpPanel />

            <Group title="当前会话" icon={ShieldCheck}>
                <SettingRow label="退出登录" hint="清除当前浏览器的会话令牌。">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmLogout(true)}
                        className="text-destructive hover:text-destructive"
                    >
                        退出登录
                    </Button>
                </SettingRow>
            </Group>

            <ConfirmDialog
                open={confirmLogout}
                onOpenChange={setConfirmLogout}
                title="确认退出登录？"
                description="退出后将清除当前会话令牌，需要重新输入访问密码才能进入控制台。"
                confirmText="退出登录"
                destructive
                activity={{
                    title: '正在退出登录',
                    successTitle: '已退出登录',
                    errorTitle: '退出登录失败',
                }}
                onConfirm={onLogout}
            />
            <ChangePasswordDialog
                open={showChangePwd}
                onOpenChange={setShowChangePwd}
                onSuccess={() => setPwdSavedAt(Date.now())}
            />
        </div>
    );
}
