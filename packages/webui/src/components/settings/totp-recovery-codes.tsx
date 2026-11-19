import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copyText } from '@/lib/utils';

export function TotpRecoveryCodes({
    codes,
    onConfirm,
}: {
    codes: string[];
    onConfirm: () => void;
}) {
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState(false);
    const [saved, setSaved] = useState(false);

    return (
        <div className="flex min-w-0 flex-col gap-4">
            <p className="text-sm text-muted-foreground">
                每个恢复码只能用一次。请立刻抄写或保存到离线位置，关闭后将无法再查看。
            </p>
            <ol className="grid min-w-0 gap-2 font-mono text-sm sm:grid-cols-2">
                {codes.map((code, index) => (
                    <li key={code} className="min-w-0">
                        <input
                            readOnly
                            value={code}
                            aria-label={`恢复码 ${index + 1}`}
                            className="min-h-11 w-full rounded-[4px] border bg-transparent px-3 py-2 text-center tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onFocus={(e) => e.currentTarget.select()}
                        />
                    </li>
                ))}
            </ol>
            <Button
                type="button"
                variant="glass"
                size="sm"
                className="self-start"
                onClick={async () => {
                    const ok = await copyText(codes.join('\n'));
                    setCopied(ok);
                    setCopyError(!ok);

                    if (ok) {
                        window.setTimeout(() => setCopied(false), 1600);
                    }
                }}
            >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? '已复制' : '复制全部'}
            </Button>
            {copyError && (
                <p role="alert" className="text-xs text-destructive">复制失败，请选择上方恢复码手动复制。</p>
            )}
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm">
                <input
                    type="checkbox"
                    checked={saved}
                    onChange={(e) => setSaved(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                我已把恢复码保存到安全的地方
            </label>
            <Button type="button" variant="glass" disabled={!saved} onClick={onConfirm}>
                完成
            </Button>
        </div>
    );
}
