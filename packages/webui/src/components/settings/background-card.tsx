import { useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import {
    Group,
    Segmented,
    SettingRow,
    SliderSettingRow,
    type Opt,
} from '@/components/settings/settings-controls';
import { Button } from '@/components/ui/button';
import { GRADIENT_OPTIONS, type BackgroundType, type useTheme } from '@/contexts/ThemeContext';
import { cn, toColorInputValue } from '@/lib/utils';

const BG_TYPE_OPTIONS: Opt<BackgroundType>[] = [
    { value: 'none', label: '无' },
    { value: 'solid', label: '纯色' },
    { value: 'gradient', label: '渐变' },
    { value: 'image', label: '图片' },
];

export function BackgroundCard({
    appearance: a,
    setAppearance,
    uploadBackground,
    removeBackground,
}: {
    appearance: ReturnType<typeof useTheme>['appearance'];
    setAppearance: ReturnType<typeof useTheme>['setAppearance'];
    uploadBackground: ReturnType<typeof useTheme>['uploadBackground'];
    removeBackground: ReturnType<typeof useTheme>['removeBackground'];
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];

        if (fileRef.current) {
            fileRef.current.value = '';
        }

        if (!file) {
            return;
        }

        setUploading(true);
        setErr(null);

        try {
            await uploadBackground(file);
        } catch (ex) {
            setErr(ex instanceof Error ? ex.message : '上传失败');
        } finally {
            setUploading(false);
        }
    };

    const onRemove = async () => {
        setBusy(true);
        setErr(null);

        try {
            await removeBackground();
        } catch {
            setErr('删除失败');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Group
            title="背景"
            icon={ImageIcon}
            description="纯色、渐变或自定义壁纸，会显示在卡片之间与登录页。"
        >
            <SettingRow label="背景类型">
                <Segmented
                    value={a.background.type}
                    options={BG_TYPE_OPTIONS}
                    onChange={(type) => setAppearance({ background: { type } })}
                />
            </SettingRow>

            {a.background.type === 'solid' && (
                <SettingRow label="背景颜色">
                    <div className="flex items-center gap-3">
                        <label
                            className="relative size-10 cursor-pointer overflow-hidden rounded-lg border"
                            style={{ backgroundColor: a.background.color }}
                        >
                            <input
                                type="color"
                                value={toColorInputValue(a.background.color)}
                                onChange={(e) =>
                                    setAppearance({ background: { color: e.target.value } })
                                }
                                className="absolute inset-0 cursor-pointer opacity-0"
                                aria-label="背景颜色"
                            />
                        </label>
                        <span className="font-mono text-sm text-muted-foreground">
                            {a.background.color}
                        </span>
                    </div>
                </SettingRow>
            )}

            {a.background.type === 'gradient' && (
                <SettingRow label="渐变预设" layout="stack">
                    <div className="flex flex-wrap gap-2">
                        {GRADIENT_OPTIONS.map((g) => {
                            const active = a.background.gradient === g.id;
                            return (
                                <button
                                    key={g.id}
                                    type="button"
                                    onClick={() =>
                                        setAppearance({ background: { gradient: g.id } })
                                    }
                                    title={g.label}
                                    aria-label={g.label}
                                    className={cn(
                                        'h-12 w-20 rounded-lg border transition-colors cursor-pointer',
                                        active
                                            ? 'border-foreground/30 ring-2 ring-primary'
                                            : 'border-border',
                                    )}
                                    style={{ backgroundImage: g.css }}
                                />
                            );
                        })}
                    </div>
                </SettingRow>
            )}

            {a.background.type === 'image' && (
                <>
                    <SettingRow
                        label="壁纸"
                        hint="支持 PNG / JPEG / WebP，最大 5MB。"
                        layout="stack"
                    >
                        <div className="flex flex-wrap items-center gap-3">
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={onFile}
                                className="hidden"
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => fileRef.current?.click()}
                                disabled={uploading}
                            >
                                {uploading ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <Upload className="size-4" />
                                )}
                                {a.background.hasImage ? '更换图片' : '上传图片'}
                            </Button>
                            {a.background.hasImage && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onRemove}
                                    disabled={busy}
                                    className="text-destructive hover:text-destructive"
                                >
                                    <Trash2 className="size-4" /> 移除
                                </Button>
                            )}
                        </div>
                        {a.background.hasImage && (
                            <div className="overflow-hidden rounded-lg border">
                                <img
                                    src={`/ui-asset/background?v=${a.background.imageVersion}`}
                                    alt="背景预览"
                                    className="h-32 w-full object-cover"
                                />
                            </div>
                        )}
                    </SettingRow>

                    {a.background.hasImage && (
                        <>
                            <SliderSettingRow
                                label="遮罩强度"
                                hint="越高越能盖住壁纸、提升前景可读性。"
                                min={0}
                                max={1}
                                step={0.05}
                                value={a.background.imageOpacity}
                                valueLabelFormat={(nextValue) => `${Math.round(nextValue * 100)}%`}
                                onValueChange={(imageOpacity) =>
                                    setAppearance({ background: { imageOpacity } })
                                }
                                aria-valuetext={`${Math.round(a.background.imageOpacity * 100)}%`}
                            />
                            <SliderSettingRow
                                label="背景模糊"
                                min={0}
                                max={40}
                                step={1}
                                value={a.background.imageBlur}
                                valueLabelFormat={(nextValue) => `${nextValue}px`}
                                onValueChange={(imageBlur) =>
                                    setAppearance({ background: { imageBlur } })
                                }
                                aria-valuetext={`${a.background.imageBlur} 像素`}
                            />
                        </>
                    )}
                </>
            )}

            {err && <p className="px-5 py-3 text-[12px] text-destructive">{err}</p>}
        </Group>
    );
}
