export const DEMO_JOURNEY = [
    {
        id: 'setup',
        title: { zh: '首次设置', en: 'First-run setup' },
        route: '/',
        control: {
            zh: '访问密码 → 使用与隐私 → 新密码 → 显示效果 → 选择接入内核',
            en: 'Access password → Usage and privacy → New password → Display effects → Choose a connection kernel',
        },
        description: {
            zh: '用示例密码登录，依次阅读说明、设置新密码和选择显示效果。查看内核选项后，点「继续」。',
            en: 'Sign in with the sample password, read the notices, set a new password, and choose display effects. Review the kernel options, then choose Continue.',
        },
    },
    {
        id: 'desktop',
        title: { zh: 'QQ 桌面与扫码', en: 'Mock desktop and scan' },
        route: '/processes',
        control: { zh: '打开 QQ 桌面 → 模拟扫码', en: 'Open QQ desktop → Simulate scan' },
        description: {
            zh: '点「打开 QQ 桌面」，再点「模拟扫码」。在「QQ 会话」查看示例账号 10001。',
            en: 'Choose Open QQ desktop, then Simulate scan. Find sample account 10001 in QQ sessions.',
        },
    },
    {
        id: 'gate',
        title: { zh: '选择账号内核', en: 'Account kernel' },
        route: '/processes',
        control: {
            zh: '加载 → 选择接入内核 → 勾选风险确认 → 确认并接入',
            en: 'Load → Choose attachment kernel → Acknowledge risks → Confirm and attach',
        },
        description: {
            zh: '在 PID 4242 的详情中点「加载」，选择兼容内核并确认风险，然后点「确认并接入」。卸载后，点「加载」可重新接入。',
            en: 'Choose Load for PID 4242, select the compatible kernel, acknowledge the risks, and choose Confirm and attach. To reconnect after unloading, choose Load.',
        },
    },
    {
        id: 'connection',
        title: { zh: '账号与连接', en: 'Account and connection' },
        route: '/config',
        control: {
            zh: 'DEMO 小光 → HTTP 接口 → 立即保存',
            en: 'Account 10001 → HTTP API → Save now',
        },
        description: {
            zh: '选中账号 10001，编辑 HTTP 接口后点「立即保存」。要练习处理保存失败，先点「模拟一次保存失败」。',
            en: 'Select account 10001, edit its HTTP API, and choose Save now. To practise handling an error, select Simulate a failed save first.',
        },
    },
    {
        id: 'action',
        title: { zh: '接口与消息', en: 'Actions and messages' },
        route: '/debug',
        control: {
            zh: '接口调用 → send_private_msg → 运行调用',
            en: 'Action tester → send_private_msg → Run action',
        },
        description: {
            zh: '用账号 10001 调用 send_private_msg，填入 user_id 10002 和消息 #nl。再用返回的 message_id 调用 get_msg。',
            en: 'Run send_private_msg from account 10001 with user_id 10002 and message #nl. Use the returned message_id to run get_msg.',
        },
    },
    {
        id: 'logs',
        title: { zh: '日志', en: 'Logs' },
        route: '/logs',
        control: { zh: '日志级别 → 导出完整 TRACE', en: 'Log level → Export full TRACE' },
        description: {
            zh: '按级别或关键词筛选日志，暂停跟随，或导出当前视图与完整 TRACE。开启服务端 TRACE 时，按提示确认。',
            en: 'Filter by level or keyword, pause auto-scroll, or export the view or full TRACE. Confirm when enabling server TRACE.',
        },
    },
    {
        id: 'storage',
        title: { zh: '存储', en: 'Storage' },
        route: '/settings?tab=storage',
        control: {
            zh: '日志保留 → 保存并应用；清理日志 → 确认清理',
            en: 'Log retention → Save and apply; Clean up logs → Confirm cleanup',
        },
        description: {
            zh: '设置日志保留天数，或选择一类数据清理。清理账号数据前先将相关账号下线；清理全部账号时，输入「清理全部账号」。',
            en: 'Set log retention or choose a category to clean up. Take the affected accounts offline before cleaning their data. For all accounts, enter 清理全部账号.',
        },
    },
    {
        id: 'settings',
        title: { zh: '设置', en: 'Settings' },
        route: '/settings?tab=appearance',
        control: {
            zh: '偏好设置 → 外观 / 账号安全 / 服务',
            en: 'Settings → Appearance / Account security / Service',
        },
        description: {
            zh: '在「外观」选择动效和玻璃材质。在「账号安全」体验双重验证，示例验证码为 123456。',
            en: 'Choose motion and glass material in Appearance. Try two-factor authentication in Account security with code 123456.',
        },
    },
    {
        id: 'reset',
        title: { zh: '重置与刷新', en: 'Reset and refresh' },
        route: '/settings?tab=advanced',
        control: {
            zh: '顶部「重置」；偏好设置 → 高级 → 重置全部',
            en: 'Reset in the banner; Settings → Advanced → Reset all',
        },
        description: {
            zh: '点顶部「重置」或刷新页面可重新开始练习。要恢复界面偏好，在「高级」点「重置全部」。',
            en: 'Choose Reset in the banner or reload to start over. To restore interface preferences, choose Reset all in Advanced.',
        },
    },
] as const;
