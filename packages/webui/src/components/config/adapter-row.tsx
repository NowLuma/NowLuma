// One adapter row in the per-kind table: identity + flags, the projected
// endpoint summary with its live runtime status, and the row actions. Real
// editing always goes through the dialog — there are no live-typed inputs here.

import { useState } from 'react';
import { Copy, Settings2, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { cn } from '@/lib/utils';
import type { AdapterCommon } from './defaults';
import type { AdapterStatus } from '@/types';

const LIVE_STYLE: Record<AdapterStatus['status'], string> = {
    ok: 'text-success',
    warn: 'text-warning',
    down: 'text-destructive',
    degraded: 'text-destructive',
    disabled: 'text-muted-foreground',
};
const LIVE_LABEL: Record<AdapterStatus['status'], string> = {
    ok: '运行中',
    warn: '待检查',
    down: '未连接',
    degraded: '应用失败',
    disabled: '未启用',
};

interface AdapterRowProps<T extends AdapterCommon> {
    item: T;
    summary: string;
    duplicateName: boolean;
    busy: boolean;
    /** Live runtime status from the OneBot manager, matched by adapter name. */
    liveStatus?: AdapterStatus;
    onToggleEnabled: (next: boolean) => void;
    onEdit: () => void;
    onCopy: () => void;
    onDelete: () => Promise<void>;
}

export function AdapterRow<T extends AdapterCommon>({
    item,
    summary,
    duplicateName,
    busy,
    liveStatus,
    onToggleEnabled,
    onEdit,
    onCopy,
    onDelete,
}: AdapterRowProps<T>) {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const enabled = item.enabled !== false;
    const blankName = !item.name?.trim();

    return (
        <div className="cp-tablerow">
            <div className="cp-tablerow-identity min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <span
                        className={cn('break-all font-semibold', blankName && 'text-destructive')}
                    >
                        {item.name || '(未命名)'}
                    </span>
                    {duplicateName && (
                        <Badge variant="destructive" className="font-normal">
                            名称重复
                        </Badge>
                    )}
                    {!enabled && (
                        <Badge variant="secondary" className="font-normal">
                            已停用
                        </Badge>
                    )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{item.messageFormat === 'string' ? 'CQ 码' : '数组'}</span>
                    <span aria-hidden className="text-border">
                        ·
                    </span>
                    <span>{item.reportSelfMessage ? '含自身消息' : '不含自身消息'}</span>
                    <span aria-hidden className="text-border">
                        ·
                    </span>
                    <span>{item.accessToken ? '令牌已设置' : '未设令牌'}</span>
                </div>
            </div>

            <div className="cp-tablerow-summary min-w-0">
                <div
                    className="break-all font-mono text-xs leading-relaxed text-muted-foreground tabular-nums"
                    title={summary}
                >
                    {summary}
                </div>
                {liveStatus && (
                    <span
                        className={cn(
                            'mt-2 inline-block max-w-full break-words text-xs font-medium',
                            LIVE_STYLE[liveStatus.status],
                        )}
                        title={
                            liveStatus.lastError
                                ? `${liveStatus.detail}\n${liveStatus.lastErrorAt ? new Date(liveStatus.lastErrorAt).toLocaleString() : '时间未知'} · ${liveStatus.lastError}`
                                : liveStatus.detail
                        }
                    >
                        {LIVE_LABEL[liveStatus.status]} · {liveStatus.detail}
                    </span>
                )}
                {liveStatus?.lastError && (
                    <p role="alert" className="mt-1 break-words text-xs text-destructive">
                        {liveStatus.lastError}
                    </p>
                )}
            </div>

            <div className="cp-tablerow-actions flex flex-wrap items-center gap-2">
                <ToggleSwitch
                    value={enabled}
                    onChange={onToggleEnabled}
                    ariaLabel={`启用 ${item.name || '该节点'}`}
                    disabled={busy}
                />
                <Button
                    variant="glass"
                    size="sm"
                    disabled={busy}
                    onClick={onEdit}
                    aria-label={`编辑 ${item.name || '该节点'}`}
                >
                    <Settings2 className="size-4" /> 编辑
                </Button>
                <div className="flex items-center gap-0.5">
                    <Button
                        variant="glass"
                        size="icon-sm"
                        onClick={onCopy}
                        aria-label="复制端点地址（不含凭据）"
                        title="复制连接地址，不包含访问令牌或查询参数"
                    >
                        <Copy className="size-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setConfirmDelete(true)}
                        disabled={busy}
                        aria-label={`删除 ${item.name || '该节点'}`}
                        className="text-muted-foreground hover:text-destructive"
                    >
                        <Trash2 className="size-4" />
                    </Button>
                </div>
            </div>
            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title={`删除连接 ${item.name || '(未命名)'}？`}
                description="将移除此连接的配置，并停止对应的协议服务。其他连接与消息记录不受影响。"
                confirmText="删除连接"
                destructive
                confirmDisabled={busy}
                onConfirm={onDelete}
            />
        </div>
    );
}
