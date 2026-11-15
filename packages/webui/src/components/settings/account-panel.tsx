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
        <div className="flex flex-col gap-5">
            <Group
                title="账号安全"
                icon={ShieldCheck}
                description="WebUI 仅有 admin 一个账号，密码以 scrypt 哈希持久化到 config/webui.json。"
            >
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
                    <Button variant="outline" size="sm" onClick={() => setShowChangePwd(true)}>
                        <KeyRound className="size-4" /> 修改密码
                    </Button>
                </SettingRow>
                <SettingRow label="退出登录" hint="立即清除当前浏览器的会话令牌。">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmLogout(true)}
                        className="text-destructive hover:text-destructive"
                    >
                        退出登录
                    </Button>
                </SettingRow>

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
            </Group>
            <TotpPanel />
        </div>
    );
}
