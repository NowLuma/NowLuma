import { Copy, Folder } from 'lucide-react';
import { useAppState } from '@/contexts/AppStateContext';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { Group } from '@/components/settings/settings-controls';
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
        <Group
            title="运行目录"
            icon={Folder}
            description={<>{info.mode === 'docker' ? 'Docker' : '原生运行'} · UID {info.uid ?? '不适用'}</>}
        >
            <div className="flex min-w-0 flex-col gap-3 py-3">
                {resources.systemInfo.error && (
                    <p role="alert" className="text-xs text-destructive">
                        {resources.systemInfo.error}；以下是上次读取结果。
                    </p>
                )}
                <dl className="divide-y divide-border/60">
                    {rows.map(([name, directory, writable]) => (
                        <div key={name} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-6">
                            <dt className="text-xs text-muted-foreground">{name}</dt>
                            <dd className="min-w-0">
                                <code className="break-all text-xs">{directory}</code>
                                {writable !== undefined && (
                                    <p className={`mt-1 text-xs ${writable ? 'text-success' : 'text-destructive'}`}>
                                        {writable ? '可写' : '未创建或不可写'}
                                    </p>
                                )}
                            </dd>
                        </div>
                    ))}
                </dl>
                <details className="text-xs text-muted-foreground">
                    <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        QQ 数据与诊断范围
                    </summary>
                    <p className="max-w-prose leading-relaxed">
                        QQ 自动登录由客户端保存到用户目录。Docker 需保留整个 HOME 卷，不要用 down -v 重启；
                        原生 QQ 目录取决于 QQ 进程的用户环境。复制诊断不包含令牌、密码或 QQ 登录库。
                    </p>
                </details>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="glass" onClick={() => void copy()}>
                        <Copy className="size-3.5" /> 复制诊断
                    </Button>
                    <Button size="sm" variant="glass" onClick={refreshSystem}>
                        刷新状态
                    </Button>
                </div>
            </div>
        </Group>
    );
}
