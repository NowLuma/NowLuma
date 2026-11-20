// Listener changes apply after restart; environment overrides remain authoritative.
import { useEffect, useId, useRef, useState } from 'react';
import { desktopLink, normalizeVncUrl } from '@nowluma/common/desktop-url';
import {
    Database,
    Download,
    Loader2,
    Lock,
    Monitor,
    Pencil,
    Save,
    Server,
    ShieldCheck,
    Trash2,
    Upload,
} from 'lucide-react';
import { Group, SettingRow } from '@/components/settings/settings-controls';
import { Badge } from '@/components/ui/badge';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DesktopButton } from '@/components/desktop-button';
import { DeploymentDiagnostics } from '@/components/settings/deployment-diagnostics';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useApi } from '@/lib/api';
import { useFlashMessage } from '@/hooks/use-flash-message';
import { cn, downloadBlob } from '@/lib/utils';
import type { SystemSettingsResponse } from '@/types';

export function SystemPanel() {
    const id = useId();
    const api = useApi();
    const { runAction } = useActionFeedback();
    const [data, setData] = useState<SystemSettingsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { msg, flash, setMsg } = useFlashMessage(4000);

    // editable form state
    const [port, setPort] = useState('');
    const [host, setHost] = useState('127.0.0.1');
    const [trustProxy, setTrustProxy] = useState('');
    const [tlsEnabled, setTlsEnabled] = useState(false);
    const [vncPort, setVncPort] = useState('0');
    const [vncUrl, setVncUrl] = useState('');
    const [hookAutoLoad, setHookAutoLoad] = useState(false);
    const [certPem, setCertPem] = useState('');
    const [keyPem, setKeyPem] = useState('');
    // When a cert is already installed we hide the PEM inputs (sensitive) and
    // show a "已安装" summary + 更改 button; editing reveals the inputs again.
    const [editingCert, setEditingCert] = useState(false);

    // backup / restore
    const [exportCreds, setExportCreds] = useState(false);
    const [restoreCreds, setRestoreCreds] = useState(false);
    const [confirmDeleteCert, setConfirmDeleteCert] = useState(false);
    const [pendingBackup, setPendingBackup] = useState<File | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const load = async (): Promise<boolean> => {
        try {
            const res = await api.systemSettings.get();
            setData(res);
            setPort(String(res.settings.webuiPort));
            setHost(res.settings.webuiHost);
            setTrustProxy(res.settings.trustProxy);
            setTlsEnabled(res.settings.tlsEnabled);
            setVncPort(String(res.effective?.vncPort ?? res.settings.vncPort));
            setVncUrl(res.effective?.vncUrl ?? res.settings.vncUrl ?? '');
            setHookAutoLoad(res.effective?.hookAutoLoad ?? res.settings.hookAutoLoad === true);
            return true;
        } catch (error) {
            console.error('load system settings failed', error);
            setMsg({ kind: 'err', text: error instanceof Error ? error.message : '加载系统设置失败' });
            return false;
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const overridden = (field: string) => data?.envOverrides.includes(field) ?? false;

    const saveSettings = async () => {
        const portNum = Number(port);

        if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) {
            flash('err', '端口必须是 1–65535 的整数');
            return;
        }

        const vncNum = Number(vncPort);

        if (!Number.isInteger(vncNum) || vncNum < 0 || vncNum > 65535) {
            flash('err', 'QQ 桌面端口必须是 0–65535 的整数');
            return;
        }

        try {
            normalizeVncUrl(vncUrl);
        } catch (error) {
            flash('err', error instanceof Error ? error.message : '桌面地址无效');
            return;
        }

        setSaving(true);

        try {
            await runAction(
                {
                    title: '正在更新服务设置',
                    detail: `${host.trim()}:${portNum}`,
                    successTitle: '服务设置已更新',
                    successDetail: '重启 Nowluma 后生效',
                    errorTitle: '服务设置更新失败',
                },
                () =>
                    api.systemSettings.save({
                        webuiPort: portNum,
                        webuiHost: host.trim(),
                        trustProxy,
                        tlsEnabled,
                        vncPort: overridden('vncPort') ? undefined : vncNum,
                        vncUrl: overridden('vncUrl') ? undefined : vncUrl.trim(),
                        hookAutoLoad: overridden('hookAutoLoad') ? undefined : hookAutoLoad,
                    }),
            );
            const refreshed = await load();
            if (refreshed) {
                flash('ok', '已保存，重启 Nowluma 后生效');
            } else {
                setMsg({ kind: 'err', text: '已保存，但状态刷新失败；请手动刷新页面，重启后应用。' });
            }
        } catch (e) {
            setMsg({ kind: 'err', text: e instanceof Error ? e.message : '保存失败' });
        } finally {
            setSaving(false);
        }
    };

    const uploadCert = async () => {
        if (!certPem.trim() || !keyPem.trim()) {
            flash('err', '请同时填入证书与私钥');
            return;
        }

        setSaving(true);

        try {
            await runAction(
                {
                    title: '正在更新 TLS 证书',
                    detail: '正在校验证书与私钥',
                    successTitle: 'TLS 证书已更新',
                    successDetail: '重启 Nowluma 后生效',
                    errorTitle: 'TLS 证书更新失败',
                },
                () => api.systemSettings.uploadCert(certPem, keyPem),
            );
            setCertPem('');
            setKeyPem('');
            setEditingCert(false);
            setData((previous) => previous && !previous.hasCert ? { ...previous, hasCert: true } : previous);
            const refreshed = await load();
            if (refreshed) {
                flash('ok', '证书已保存，重启后生效');
            } else {
                setMsg({ kind: 'err', text: '证书已保存，但状态刷新失败；请手动刷新页面，重启后应用。' });
            }
        } catch (e) {
            setMsg({ kind: 'err', text: e instanceof Error ? e.message : '证书保存失败' });
        } finally {
            setSaving(false);
        }
    };

    const deleteCert = async () => {
        setSaving(true);

        try {
            await runAction(
                {
                    title: '正在删除 TLS 证书',
                    detail: '正在移除服务器上的证书与私钥',
                    successTitle: 'TLS 证书已删除',
                    errorTitle: 'TLS 证书删除失败',
                },
                () => api.systemSettings.deleteCert(),
            );
            setEditingCert(false);
            setData((previous) => previous?.hasCert ? { ...previous, hasCert: false } : previous);
            const refreshed = await load();
            if (refreshed) {
                flash('ok', '证书已删除');
            } else {
                setMsg({ kind: 'err', text: '证书已删除，但状态刷新失败；请手动刷新页面。' });
            }
        } catch (e) {
            setMsg({ kind: 'err', text: e instanceof Error ? e.message : '删除失败' });
            throw e;
        } finally {
            setSaving(false);
        }
    };

    const exportBackup = async () => {
        setSaving(true);

        try {
            const bundle = await runAction(
                {
                    title: '正在导出配置备份',
                    detail: exportCreds ? '包含敏感配置' : '不包含敏感配置',
                    successTitle: '配置备份已导出',
                    errorTitle: '配置备份导出失败',
                },
                () => api.systemSettings.exportBackup(exportCreds),
            );
            downloadBlob(
                new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
                `nowluma-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
            );
            flash('ok', '已导出备份');
        } catch (e) {
            setMsg({ kind: 'err', text: e instanceof Error ? e.message : '导出失败' });
        } finally {
            setSaving(false);
        }
    };

    const importBackup = async (file: File) => {
        setSaving(true);

        try {
            const text = await file.text();
            let parsed: Record<string, unknown>;

            try {
                parsed = JSON.parse(text);
            } catch {
                throw new Error('文件不是有效的 JSON');
            }

            const res = await runAction(
                {
                    title: '正在恢复配置备份',
                    detail: file.name,
                    successTitle: '配置备份已恢复',
                    successDetail: '恢复结果已写入服务器',
                    errorTitle: '配置备份恢复失败',
                },
                () => api.systemSettings.importBackup(parsed, restoreCreds),
            );
            const parts = res.restored.length
                ? [`已恢复 ${res.restored.length} 项`]
                : ['没有可恢复的配置'];

            if (res.skipped.length) {
                parts.push(`跳过 ${res.skipped.length} 项（敏感配置，含 OneBot 配置）`);
            }

            if (res.migrated.length) {
                parts.push(`兼容转换 ${res.migrated.length} 项`);
            }

            const summary = `${parts.join('，')}${res.restartRequiredToApply ? '，重启后生效' : ''}`;
            const refreshed = await load();
            if (refreshed) {
                flash('ok', summary);
            } else {
                setMsg({ kind: 'err', text: `${summary}；但界面状态刷新失败，请手动刷新页面` });
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : '恢复失败';
            const refreshed = await load();
            setMsg({ kind: 'err', text: refreshed ? message : `${message}；界面状态刷新失败，请手动刷新页面` });
            throw e;
        } finally {
            setSaving(false);

            if (fileRef.current) {
                fileRef.current.value = '';
            }
        }
    };

    if (loading || !data) {
        return (
            <SkeletonSwap
                ready={!loading}
                lines={7}
                lineHeight={26}
                reserve={182}
                label="系统设置"
                className={!loading ? 'skeleton-swap-fluid min-h-[182px]' : ''}
            >
                {!loading && !data ? (
                    <div
                        role="alert"
                        className="flex flex-wrap items-center justify-between gap-3 border-b py-4 text-sm text-destructive"
                    >
                        <span>{msg?.text ?? '加载系统设置失败'}</span>
                        <Button
                            variant="glass"
                            size="sm"
                            onClick={() => {
                                setLoading(true);
                                void load();
                            }}
                        >
                            重试
                        </Button>
                    </div>
                ) : null}
            </SkeletonSwap>
        );
    }

    const effectiveDesktop = data.effective ?? data.settings;
    let desktopError = '';

    try {
        desktopLink(effectiveDesktop.vncPort, effectiveDesktop.vncUrl ?? '', window.location.href);
    } catch (error) {
        desktopError = error instanceof Error ? error.message : '桌面地址无效';
    }

    const EnvBadge = ({ field }: { field: string }) =>
        overridden(field) ? (
            <Badge variant="secondary" className="gap-1 text-micro">
                <Lock className="h-3 w-3" /> 运行值由环境变量覆盖
            </Badge>
        ) : null;

    return (
        <SkeletonSwap
            ready
            lines={7}
            lineHeight={26}
            reserve={182}
            label="系统设置"
            className="skeleton-swap-fluid min-h-[182px]"
        >
            <div className="flex min-w-0 flex-col gap-7">
                <p className="text-xs leading-relaxed text-muted-foreground">
                    监听、桌面入口与 HTTPS 设置保存后需重启 Nowluma。本机不会自动重启。
                </p>

                {msg && (
                    <div
                        role={msg.kind === 'ok' ? 'status' : 'alert'}
                        className={cn(
                            'text-xs',
                            msg.kind === 'ok' ? 'text-success' : 'text-destructive',
                        )}
                    >
                        {msg.text}
                    </div>
                )}

                <Group
                    title="服务监听"
                    icon={Server}
                    description={<>当前监听端口：<code className="font-mono">{data.listeningPort}</code>。下方编辑保存配置。</>}
                >
                    <SettingRow label="端口" hint={<EnvBadge field="webuiPort" />}>
                        <Input
                            id={`${id}-port`}
                            aria-label="端口"
                            value={port}
                            onChange={(e) => setPort(e.target.value)}
                            inputMode="numeric"
                            disabled={saving}
                            placeholder="5099"
                            className="max-w-xs tabular-nums"
                        />
                    </SettingRow>
                    <SettingRow label="绑定地址" hint={<EnvBadge field="webuiHost" />}>
                        <div className="flex min-w-0 flex-col gap-2">
                            <Input
                                id={`${id}-host`}
                                aria-label="绑定地址"
                                value={host}
                                onChange={(event) => setHost(event.target.value)}
                                placeholder="127.0.0.1"
                                spellCheck={false}
                                disabled={saving}
                            />
                            <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="glass" size="sm" disabled={saving} onClick={() => setHost('127.0.0.1')}>
                                    仅本机
                                </Button>
                                <Button type="button" variant="glass" size="sm" disabled={saving} onClick={() => setHost('0.0.0.0')}>
                                    所有网卡
                                </Button>
                            </div>
                            <p className={cn('text-xs leading-relaxed', host.trim() === '0.0.0.0' ? 'text-warning' : 'text-muted-foreground')}>
                                {host.trim() === '0.0.0.0'
                                    ? '允许局域网访问；建议启用 HTTPS 并使用强访问凭据。'
                                    : '默认仅本机访问，也可填写明确的绑定地址。'}
                            </p>
                        </div>
                    </SettingRow>
                    <SettingRow label="信任代理 (trust-proxy)" hint={<EnvBadge field="trustProxy" />}>
                        <div className="flex min-w-0 flex-col gap-2">
                            <Input
                                id={`${id}-proxy`}
                                aria-label="信任代理 (trust-proxy)"
                                value={trustProxy}
                                onChange={(e) => setTrustProxy(e.target.value)}
                                disabled={saving}
                                placeholder="留空=只信任 socket 对端；1=信任反代头"
                            />
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                仅在受信任反向代理之后设置 1 / loopback / IP 列表。
                            </p>
                        </div>
                    </SettingRow>
                    <SettingRow
                        label="自动连接已打开的 QQ"
                        hint={<><EnvBadge field="hookAutoLoad" /> QQ 登录仍在客户端完成。</>}
                        layout="inline"
                    >
                        <ToggleSwitch
                            value={hookAutoLoad}
                            onChange={setHookAutoLoad}
                            ariaLabel="自动连接已打开的 QQ"
                            disabled={saving || overridden('hookAutoLoad')}
                        />
                    </SettingRow>
                </Group>

                <Group title="QQ 桌面" icon={Monitor} description="只设置入口，不改变桌面服务监听端口。">
                    <SettingRow label="noVNC 端口" hint={<EnvBadge field="vncPort" />}>
                        <Input
                            id={`${id}-desktop-port`}
                            aria-label="noVNC 端口"
                            value={vncPort}
                            onChange={(e) => setVncPort(e.target.value)}
                            inputMode="numeric"
                            placeholder="0"
                            disabled={saving || overridden('vncPort')}
                            className="max-w-xs tabular-nums"
                        />
                    </SettingRow>
                    <SettingRow label="桌面地址（可选）" hint={<EnvBadge field="vncUrl" />}>
                        <Input
                            id={`${id}-desktop-url`}
                            aria-label="桌面地址（可选）"
                            value={vncUrl}
                            onChange={(e) => setVncUrl(e.target.value)}
                            placeholder="/desktop/vnc.html 或 https://地址/vnc.html"
                            disabled={saving || overridden('vncUrl')}
                        />
                    </SettingRow>
                    <SettingRow label="当前桌面" hint="端口为 0 且地址留空时隐藏入口。">
                        <DesktopButton />
                    </SettingRow>
                    {desktopError && <p role="alert" className="py-3 text-xs text-destructive">{desktopError}</p>}
                    <details className="py-3 text-xs text-muted-foreground">
                        <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            桌面地址与认证
                        </summary>
                        <p className="max-w-prose leading-relaxed">
                            地址留空时使用当前主机名和发布端口；同源 HTTPS 反向代理请填代理地址。
                            入口不传递控制台令牌或 QQ 密码。Docker 桌面使用当前控制台会话，
                            QQ 扫码与自动登录仍在客户端完成。
                        </p>
                    </details>
                </Group>

                <Group
                    title="HTTPS / TLS"
                    icon={ShieldCheck}
                    description={data.hasCert ? '证书与私钥已安装。' : '启用前需安装有效的 PEM 证书与私钥。'}
                >
                    <SettingRow label="启用 HTTPS" hint={<EnvBadge field="tlsEnabled" />} layout="inline">
                        <ToggleSwitch value={tlsEnabled} onChange={setTlsEnabled} ariaLabel="启用 HTTPS" disabled={saving} />
                    </SettingRow>
                    {data.hasCert && !editingCert ? (
                        <SettingRow label="已安装证书" hint="私钥不回显；未编辑时保留原内容。">
                            <div className="flex flex-wrap gap-2">
                                <Button variant="glass" disabled={saving} onClick={() => setEditingCert(true)}>
                                    <Pencil className="size-4" /> 更改证书
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => setConfirmDeleteCert(true)}
                                    disabled={saving}
                                    className="text-destructive hover:text-destructive"
                                >
                                    <Trash2 className="size-4" /> 删除证书
                                </Button>
                            </div>
                        </SettingRow>
                    ) : (
                        <div className="flex min-w-0 flex-col gap-3 py-3">
                            <div className="grid min-w-0 gap-3 md:grid-cols-2">
                                <div className="flex min-w-0 flex-col gap-1.5">
                                    <Label htmlFor={`${id}-cert`}>证书 (cert.pem)</Label>
                                    <Textarea
                                        id={`${id}-cert`}
                                        className="min-h-28 rounded-[4px] font-mono text-xs"
                                        value={certPem}
                                        onChange={(e) => setCertPem(e.target.value)}
                                        placeholder="-----BEGIN CERTIFICATE-----"
                                        disabled={saving}
                                    />
                                </div>
                                <div className="flex min-w-0 flex-col gap-1.5">
                                    <Label htmlFor={`${id}-key`}>私钥 (key.pem)</Label>
                                    <Textarea
                                        id={`${id}-key`}
                                        className="min-h-28 rounded-[4px] font-mono text-xs"
                                        value={keyPem}
                                        onChange={(e) => setKeyPem(e.target.value)}
                                        placeholder="-----BEGIN PRIVATE KEY-----"
                                        disabled={saving}
                                    />
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="glass" onClick={uploadCert} disabled={saving}>
                                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                                    保存证书
                                </Button>
                                {data.hasCert && editingCert && (
                                    <Button
                                        variant="glass"
                                        disabled={saving}
                                        onClick={() => {
                                            setEditingCert(false);
                                            setCertPem('');
                                            setKeyPem('');
                                        }}
                                    >
                                        取消
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                    <details className="py-3 text-xs text-muted-foreground">
                        <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            TLS 校验与私钥存储
                        </summary>
                        <p className="max-w-prose leading-relaxed">
                            私钥仅写入服务器 <code className="font-mono">config/key.pem</code>（0600 权限）。
                            无效证书会被拒绝。启用 TLS 后若证书无法加载，WebUI 将停止启动，不会降级为 HTTP。
                        </p>
                    </details>
                </Group>

                <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                    <Button variant="glass" onClick={saveSettings} disabled={saving}>
                        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                        保存服务设置
                    </Button>
                    <span className="text-xs text-muted-foreground">监听、桌面入口与 HTTPS · 重启后应用</span>
                </div>

                <Group title="服务配置备份" icon={Database}>
                    <SettingRow label="导出备份" hint="外观、服务设置与证书；不含消息数据库。">
                        <div className="flex min-w-0 flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-3">
                                <ToggleSwitch value={exportCreds} onChange={setExportCreds} ariaLabel="导出包含敏感配置" disabled={saving} />
                                <span className="text-xs">包含敏感配置</span>
                                <Button variant="glass" onClick={exportBackup} disabled={saving}>
                                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                                    导出备份
                                </Button>
                            </div>
                            {exportCreds && (
                                <p className="text-xs leading-relaxed text-destructive">
                                    包含 WebUI 登录状态、TLS 私钥、通知渠道地址与 OneBot 访问令牌，请妥善保管。
                                </p>
                            )}
                        </div>
                    </SettingRow>
                    <SettingRow label="恢复备份" hint="选择文件后确认覆盖。恢复完成需重启。">
                        <div className="flex min-w-0 flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-3">
                                <ToggleSwitch value={restoreCreds} onChange={setRestoreCreds} ariaLabel="恢复包含敏感配置" disabled={saving} />
                                <span className="text-xs">恢复敏感配置</span>
                                <Button variant="glass" onClick={() => fileRef.current?.click()} disabled={saving}>
                                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                                    选择备份文件
                                </Button>
                            </div>
                            {restoreCreds && (
                                <p className="text-xs leading-relaxed text-destructive">
                                    将覆盖 WebUI 登录状态、TLS 私钥、通知渠道地址与 OneBot 访问令牌；
                                    不知道备份中的口令可能无法登录。
                                </p>
                            )}
                            <input
                                ref={fileRef}
                                type="file"
                                accept="application/json,.json"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        setPendingBackup(file);
                                    }
                                    e.target.value = '';
                                }}
                            />
                        </div>
                    </SettingRow>
                    <details className="py-3 text-xs text-muted-foreground">
                        <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            备份范围与恢复方式
                        </summary>
                        <p className="max-w-prose leading-relaxed">
                            通知渠道与 OneBot 配置仅随敏感配置导出。恢复前先校验，写入出错会回滚；
                            成功后删除临时快照。
                        </p>
                    </details>
                </Group>

                <DeploymentDiagnostics />

                <ConfirmDialog
                    open={confirmDeleteCert}
                    onOpenChange={setConfirmDeleteCert}
                    title="删除 TLS 证书？"
                    description="将移除服务器上的证书与私钥。若 HTTPS 仍处于启用状态，下次启动将无法继续使用当前证书。"
                    confirmText="删除证书"
                    destructive
                    onConfirm={deleteCert}
                />

                <ConfirmDialog
                    open={pendingBackup !== null}
                    onOpenChange={(open) => {
                        if (!open) {
                            setPendingBackup(null);
                        }
                    }}
                    title="恢复配置备份？"
                    description={
                        pendingBackup
                            ? `将从 ${pendingBackup.name} 覆盖当前系统配置${restoreCreds ? '，包括敏感配置、TLS 私钥与 OneBot 配置' : ''}。成功后需要重启 Nowluma。`
                            : ''
                    }
                    confirmText="确认恢复"
                    destructive
                    onConfirm={async () => {
                        if (!pendingBackup) {
                            return;
                        }

                        await importBackup(pendingBackup);
                        setPendingBackup(null);
                    }}
                />
            </div>
        </SkeletonSwap>
    );
}
