import { useRef, useState } from 'react';
import {
    AlertTriangle,
    Code2,
    Download,
    Loader2,
    Plus,
    RotateCcw,
    Trash2,
    Upload,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { DEFAULT_LAYOUT, DEFAULT_PAGES } from '@/contexts/LayoutContext';
import { DEFAULT_APPEARANCE, useTheme } from '@/contexts/ThemeContext';
import { useApi } from '@/lib/api';
import { cn, downloadBlob } from '@/lib/utils';

// ─────────────── 高级（自定义 CSS + 备份/重置） ───────────────

// Ready-made CSS snippets, inserted at the cursor / appended. Plain string
// constants (no editor library) — the operator tweaks them in the textarea and
// native Cmd/Ctrl+Z undoes. Each is a complete, valid rule.
const CSS_SNIPPETS: { label: string; css: string }[] = [
    { label: '侧栏字号', css: '.text-sidebar-foreground {\n  font-size: 1.05em;\n}' },
    {
        label: '卡片毛玻璃',
        css: '.bg-card {\n  -webkit-backdrop-filter: blur(8px);\n  backdrop-filter: blur(8px);\n  background-color: color-mix(in oklab, var(--card) 80%, transparent);\n}',
    },
    {
        label: '隐藏滚动条',
        css: '* {\n  scrollbar-width: none;\n}\n*::-webkit-scrollbar {\n  width: 0;\n  height: 0;\n}',
    },
    { label: '加粗标题', css: 'h1, h2, h3 {\n  font-weight: 700;\n  letter-spacing: -0.01em;\n}' },
    { label: '紧凑卡片', css: '.rounded-xl {\n  border-radius: 0.5rem;\n}' },
];

// On-blur sanity check: parse the CSS once and surface a gentle warning if it
// looks broken (unbalanced braces, or non-empty input that parses to zero
// rules). Best-effort — returns null when parsing isn't available or the CSS
// looks fine. Never blocks saving; the operator can always ?safe-mode=1.
function validateCss(css: string): string | null {
    const trimmed = css.trim();

    if (!trimmed) {
        return null;
    }

    const opens = (trimmed.match(/\{/g) ?? []).length;
    const closes = (trimmed.match(/\}/g) ?? []).length;

    if (opens !== closes) {
        return `括号不匹配（${opens} 个 “{” / ${closes} 个 “}”）— 可能有规则未闭合。`;
    }

    if (opens === 0) {
        return '没有检测到任何 CSS 规则（缺少 “{ … }”）。';
    }

    try {
        if (typeof CSSStyleSheet === 'function' && 'replaceSync' in CSSStyleSheet.prototype) {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(trimmed);

            if (sheet.cssRules.length === 0) {
                return '未解析出有效规则，请检查语法。';
            }
        }
    } catch {
        return 'CSS 解析失败，请检查语法。';
    }

    return null;
}

export function AdvancedPanel() {
    const { savedAppearance: appearance, setAppearance, managedBy } = useTheme();
    const { runAction } = useActionFeedback();
    const cssRef = useRef<HTMLTextAreaElement>(null);
    const [cssWarn, setCssWarn] = useState<string | null>(null);
    const api = useApi();
    const fileRef = useRef<HTMLInputElement>(null);
    const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
    const [confirmReset, setConfirmReset] = useState(false);
    const [pendingImport, setPendingImport] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);

    const onExport = async () => {
        setMsg(null);

        try {
            const config = await runAction(
                {
                    title: '正在导出界面配置',
                    detail: '外观、布局与自定义 CSS',
                    successTitle: '界面配置已导出',
                    errorTitle: '界面配置导出失败',
                },
                () => api.ui.get(),
            );
            downloadBlob(
                new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }),
                'nowluma-ui-config.json',
            );
        } catch (error) {
            console.error('export UI config failed', error);
            setMsg({ kind: 'err', text: '导出失败' });
        }
    };

    const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];

        if (fileRef.current) {
            fileRef.current.value = '';
        }

        if (!file) {
            return;
        }

        if (file.size > 256 * 1024) {
            setMsg({ kind: 'err', text: '导入失败：文件过大（上限 256KB）' });
            return;
        }

        setPendingImport(file);
    };

    const importUiConfig = async (file: File) => {
        setMsg(null);
        setBusy(true);

        try {
            const parsed = JSON.parse(await file.text()) as unknown;

            if (typeof parsed !== 'object' || parsed === null) {
                throw new Error('shape');
            }

            await runAction(
                {
                    title: '正在导入界面配置',
                    detail: file.name,
                    successTitle: '界面配置已导入',
                    successDetail: '即将重新载入界面',
                    errorTitle: '界面配置导入失败',
                    surviveReload: true,
                },
                () => api.ui.save(parsed as Parameters<typeof api.ui.save>[0]),
            );
            // The server normalized it; reload so appearance + layout both re-read.
            window.location.reload();
        } catch (error) {
            setBusy(false);
            setMsg({
                kind: 'err',
                text:
                    error instanceof SyntaxError ||
                    (error instanceof Error && error.message === 'shape')
                        ? '导入失败：不是有效的配置 JSON'
                        : `导入失败：${error instanceof Error ? error.message : '未知错误'}`,
            });
            throw error;
        }
    };

    const doReset = async () => {
        setBusy(true);

        try {
            await runAction(
                {
                    title: '正在重置界面配置',
                    detail: '恢复外观、布局、导航与自定义 CSS',
                    successTitle: '界面配置已重置',
                    successDetail: '即将重新载入界面',
                    errorTitle: '界面配置重置失败',
                    surviveReload: true,
                },
                () =>
                    api.ui.save({
                        appearance: DEFAULT_APPEARANCE,
                        layout: DEFAULT_LAYOUT,
                        pages: DEFAULT_PAGES,
                    }),
            );
            window.location.reload();
        } catch (error) {
            setBusy(false);
            setMsg({ kind: 'err', text: '重置失败' });
            throw error;
        }
    };

    // Insert a template at the cursor (or append), then re-validate.
    const insertSnippet = (snippet: string) => {
        const ta = cssRef.current;
        const cur = appearance.customCss;
        let next: string;

        if (ta && ta.selectionStart != null) {
            const before = cur.slice(0, ta.selectionStart);
            const after = cur.slice(ta.selectionEnd ?? ta.selectionStart);
            const sep = before && !before.endsWith('\n') ? '\n' : '';
            next = `${before}${sep}${snippet}\n${after}`;
        } else {
            next = cur ? `${cur}\n${snippet}\n` : `${snippet}\n`;
        }

        setAppearance({ customCss: next.slice(0, 50000) });
        setCssWarn(validateCss(next));
    };

    return (
        <div className="flex flex-col gap-5">
            {managedBy && (
                <p className="text-sm text-muted-foreground">
                    自定义 CSS 已保留，跟随{managedBy}外观期间暂停应用。
                </p>
            )}
            <fieldset disabled={!!managedBy} className="contents" aria-label="自定义 CSS">
                <Card>
                    <CardHeader className="gap-1">
                        <CardTitle className="flex items-center gap-2 text-[15px]">
                            <Code2 className="size-4 text-primary" /> 自定义 CSS
                        </CardTitle>
                        <CardDescription className="text-[12px] leading-relaxed">
                            高级用户可注入自定义样式，登录后全局生效（登录页不受影响）。
                            若改坏了界面，在地址后加{' '}
                            <code className="rounded bg-muted px-1 py-0.5 font-mono text-meta">
                                ?safe-mode=1
                            </code>{' '}
                            可临时禁用自定义 CSS 进来修复。
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="mr-1 text-xs text-muted-foreground">插入模板：</span>
                            {CSS_SNIPPETS.map((s) => (
                                <button
                                    key={s.label}
                                    type="button"
                                    onClick={() => insertSnippet(s.css)}
                                    className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors cursor-pointer outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
                                >
                                    <Plus className="size-3" /> {s.label}
                                </button>
                            ))}
                        </div>
                        <Textarea
                            ref={cssRef}
                            value={appearance.customCss}
                            onChange={(e) => {
                                setAppearance({ customCss: e.target.value });

                                if (cssWarn) {
                                    setCssWarn(null);
                                }
                            }}
                            onBlur={(e) => setCssWarn(validateCss(e.target.value))}
                            maxLength={50000}
                            spellCheck={false}
                            placeholder={
                                '/* 例如：放大侧栏字号 */\n.text-sidebar-foreground { font-size: 1.05em; }'
                            }
                            className="h-64 resize-y rounded-lg bg-card/40 p-3 font-mono text-base leading-relaxed md:text-[12px]"
                        />
                        {cssWarn && (
                            <p className="flex items-start gap-1.5 text-xs text-warning">
                                <AlertTriangle className="mt-px size-3.5 shrink-0" /> {cssWarn}
                            </p>
                        )}
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-meta text-muted-foreground">
                                {appearance.customCss.length} / 50000 字符
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setAppearance({ customCss: '' });
                                    setCssWarn(null);
                                }}
                                disabled={!appearance.customCss}
                                className="text-destructive hover:text-destructive"
                            >
                                <Trash2 className="size-4" /> 清空
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </fieldset>
            <Card>
                <CardHeader className="gap-1">
                    <CardTitle className="text-[15px]">备份与重置</CardTitle>
                    <CardDescription className="text-[12px] leading-relaxed">
                        导出 / 导入全部界面配置（外观 + 布局 + 自定义
                        CSS）。背景图片需另行重新上传。
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            ref={fileRef}
                            type="file"
                            accept="application/json,.json"
                            onChange={onImportFile}
                            className="hidden"
                        />
                        <Button variant="outline" size="sm" onClick={onExport} disabled={busy}>
                            <Download className="size-4" /> 导出
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fileRef.current?.click()}
                            disabled={busy}
                        >
                            {busy ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Upload className="size-4" />
                            )}{' '}
                            导入
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmReset(true)}
                            disabled={busy}
                            className="text-destructive hover:text-destructive"
                        >
                            <RotateCcw className="size-4" /> 重置全部
                        </Button>
                    </div>
                    {msg && (
                        <span
                            className={cn(
                                'text-xs',
                                msg.kind === 'ok' ? 'text-success' : 'text-destructive',
                            )}
                        >
                            {msg.text}
                        </span>
                    )}
                </CardContent>
            </Card>

            <ConfirmDialog
                open={confirmReset}
                onOpenChange={setConfirmReset}
                title="重置全部界面配置"
                description="将外观、仪表盘布局、导航与自定义 CSS 全部恢复为默认。此操作不可撤销。"
                confirmText="重置"
                destructive
                onConfirm={doReset}
            />

            <ConfirmDialog
                open={pendingImport !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingImport(null);
                    }
                }}
                title="导入并覆盖界面配置？"
                description={
                    pendingImport
                        ? `将使用 ${pendingImport.name} 覆盖当前外观、布局、导航与自定义 CSS，随后重新载入界面。`
                        : ''
                }
                confirmText="确认导入"
                destructive
                onConfirm={async () => {
                    if (!pendingImport) {
                        return;
                    }

                    await importUiConfig(pendingImport);
                    setPendingImport(null);
                }}
            />
        </div>
    );
}
