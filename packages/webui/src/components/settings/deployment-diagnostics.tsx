import { Copy, Folder } from 'lucide-react';
import { useAppState } from '@/contexts/AppStateContext';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { copyText } from '@/lib/utils';

export function DeploymentDiagnostics() {
    const { systemInfo, resources, refreshSystem } = useAppState();
    const { runAction } = useActionFeedback();
    const info = systemInfo?.deployment;

    if (!info) {
        return null;
    }

    const rows: Array<[string, string, boolean | undefined]> = [
        ['程序工作目录', info.workingDirectory, undefined],
        ['当前服务 HOME', info.home, undefined],
        ['程序配置', info.directories.config, info.writable.config],
        ['消息与媒体', info.directories.data, info.writable.data],
        ['运行日志', info.directories.logs, info.writable.logs],
    ];

    if (systemInfo.platform === 'linux') {
        rows.push(['Linux 默认 QQ 配置', info.directories.qq, info.writable.qq]);
    }

    const report = JSON.stringify(
        {
            mode: info.mode,
            uid: info.uid,
            home: info.home,
            workingDirectory: info.workingDirectory,
            directories: info.directories,
            writable: info.writable,
        },
        null,
        2,
    );

    const copy = async () => {
        try {
            await runAction(
                { title: '正在复制运行诊断', successTitle: '诊断已复制', errorTitle: '复制失败' },
                async () => {
                    if (!(await copyText(report))) {
                        throw new Error('无法写入剪贴板，请手动复制路径');
                    }
                },
            );
        } catch {
            // The operation's persistent result notice owns its error.
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                    <Folder className="size-4" /> 运行环境与保存位置
                </CardTitle>
                <CardDescription>
                    {info.mode === 'docker' ? 'Docker' : '原生运行'} · UID {info.uid ?? '不适用'}
                    。这里不导出令牌、密码或 QQ 登录库。
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                {resources.systemInfo.error && (
                    <p role="alert" className="text-xs text-destructive">
                        {resources.systemInfo.error}；以下是上次读取结果。
                    </p>
                )}
                {rows.map(([name, directory, writable]) => (
                    <div
                        key={name}
                        className="flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                        <span className="text-muted-foreground">{name}</span>
                        <code className="break-all">{directory}</code>
                        {writable !== undefined && (
                            <span className={writable ? 'text-success' : 'text-destructive'}>
                                {writable ? '可写' : '未创建或不可写'}
                            </span>
                        )}
                    </div>
                ))}
                <p className="text-xs text-muted-foreground">
                    QQ 自动登录由客户端保存到用户目录。Docker 必须保留整个 HOME 卷；不要使用 down -v
                    来重启。非 Docker 的实际 QQ 目录还取决于 QQ 进程自己的用户环境。
                </p>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void copy()}>
                        <Copy className="size-3.5" /> 复制诊断
                    </Button>
                    <Button size="sm" variant="ghost" onClick={refreshSystem}>
                        刷新状态
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
