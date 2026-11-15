export const DEMO_JOURNEY = [
    {
        id: 'setup',
        title: '1 · 首次设置 / First setup',
        route: '/',
        control: '登录 → 同意并继续 → 保存并完成',
        description:
            'Use the public example password only. Read the practice agreement and change to the example new password. No actual credential is accepted.',
    },
    {
        id: 'desktop',
        title: '2 · QQ 桌面 / Mock desktop',
        route: '/processes',
        control: '打开 QQ 桌面 → Simulate scan → 加载',
        description:
            'Open the safe desktop mock below (or the console desktop button), simulate a scan, then use 加载 on DEMO process 4242. No physical VNC, account login or QQ network.',
    },
    {
        id: 'connection',
        title: '3 · 账号与连接 / Account & connection',
        route: '/config',
        control: 'DEMO 小光 → HTTP API → 保存',
        description:
            'Select account 10001 and inspect/edit the adapter. Save applies to memory only. Try Fail next write and inspect the failure before retrying.',
    },
    {
        id: 'action',
        title: '4 · #nl / Actions & messages',
        route: '/debug',
        control: '接口调用 → send_private_msg → 运行调用',
        description:
            'Choose account 10001, action send_private_msg, friend 10002, and text #nl. Use 运行调用 in the tester (运行流式调用 for streaming actions), then inspect get_msg with the returned message_id. Results prove simulation, not QQ delivery.',
    },
    {
        id: 'logs',
        title: '5 · 日志 / Logs',
        route: '/logs',
        control: '日志级别 / 导出完整 TRACE',
        description:
            'View DEMO action/failure records, filter levels, pause live updates, and export fake trace text. No operator logs are read.',
    },
    {
        id: 'storage',
        title: '6 · 存储 / Storage',
        route: '/settings?tab=storage',
        control: '存储管理 → 清理 → 确认',
        description:
            'Inspect pretend byte counts. Exercise cleanup confirmations and settings. Only sample counts change; no durable files or databases are touched.',
    },
    {
        id: 'settings',
        title: '7 · 设置 / Settings',
        route: '/settings?tab=appearance',
        control: '外观 / 通知 / 账号 / 关于',
        description:
            'Explore all real settings tabs: palette/layout, notifications, backup, TLS, updates, 2FA and onboarding replay. Tests/updates are simulated, custom CSS is disabled, TLS accepts DEMO CERTIFICATE / DEMO PRIVATE KEY only.',
    },
] as const;
