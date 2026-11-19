export const DEMO_JOURNEY = [
    {
        id: 'setup',
        title: '1 · 首次设置 / First-run setup',
        route: '/',
        control: '访问密码 → 阅读说明 → 设置密码 → 显示效果 → 选择接入内核',
        description:
            '用示例密码登录，依次完成四步：阅读并确认说明；两次填写示例新密码；主动选择动效与玻璃材质，点「保存并继续」；最后预览账号内核，没有账号时点「继续」。 / Log in with the example, then complete four stages: notices, password, explicit motion and glass choices, and the account kernel.',
    },
    {
        id: 'desktop',
        title: '2 · QQ 桌面与扫码 / Mock desktop & scan',
        route: '/processes',
        control: '打开 QQ 桌面 → 模拟扫码',
        description:
            '在进程页点「打开 QQ 桌面」，在模拟桌面点「模拟扫码」；也可用引导里的 Open mock desktop。只会识别演示账号 10001，不打开 VNC、不登录 QQ、不发起扫码请求。 / Open the mock desktop and simulate a scan. No VNC, QR login or QQ network is involved.',
    },
    {
        id: 'gate',
        title: '3 · 选择账号内核 / Account kernel',
        route: '/processes',
        control: '加载 → 选择接入内核 → 勾选风险确认 → 确认并接入',
        description:
            '对进程 4242 点「加载」，选择兼容内核并主动勾选风险确认，再点「确认并接入」。重写内核暂不可用。取消不会接入；卸载后保持停止，刷新不会恢复，只有再次「加载」才接入。 / Load process 4242, select the compat kernel and actively acknowledge its risks. Rewrite is unavailable. Cancel does not attach; unload stays stopped until another explicit load.',
    },
    {
        id: 'connection',
        title: '4 · 账号与连接 / Account & connection',
        route: '/config',
        control: 'DEMO 小光 → HTTP 接口 → 立即保存',
        description:
            '选择账号 10001，再配置「消息行为 / HTTP 接口 / HTTP 推送 / WebSocket 监听 / 反向 WebSocket」。改动自动保存，也可「立即保存」。用「下次写入失败」练习失败后重试；适配器只存在于内存。 / Select account 10001 and edit its adapters. Autosave or 立即保存 writes to memory only; Fail next write exercises a rejected save without opening any socket.',
    },
    {
        id: 'action',
        title: '5 · #nl / Actions & messages',
        route: '/debug',
        control: '接口调用 → send_private_msg → 运行调用',
        description:
            '在「接口调用」选账号 10001、send_private_msg、user_id 10002，消息填 #nl，点「运行调用」；用返回的 message_id 调 get_msg。也可练习流式调用与活动筛选。 / Use account 10001, send_private_msg, user 10002 and #nl, then inspect get_msg with the returned message_id. All action and stream results are simulated.',
    },
    {
        id: 'logs',
        title: '6 · 日志 / Logs',
        route: '/logs',
        control: '日志级别 → 导出完整 TRACE',
        description:
            '按级别和关键词筛选记录；可暂停跟随、导出当前视图或完整 DEMO TRACE。开启服务端 TRACE 仍需确认，「清空视图」不删除数据。 / Filter levels and text, pause following, and export current records or the full DEMO TRACE. Server TRACE asks for confirmation; clearing the view does not delete data.',
    },
    {
        id: 'storage',
        title: '7 · 存储 / Storage',
        route: '/settings?tab=storage',
        control: '存储管理 → 日志保留 → 保存并应用；清理全部日志 → 确认清理',
        description:
            '「日志保留」可保存总量上限、保留天数和按账号日志；清理日志或临时数据会先弹出「清理全部日志？」或「清理非活动临时数据？」，再点「确认清理」。账号数据库按分类清理；全部账号清理要求账号离线并输入「清理全部账号」。只有示例计数变化，不读写文件或数据库。 / Save log limits, then confirm log/temporary/account cleanups. All-accounts cleanup needs offline accounts and typing 清理全部账号. Only sample counts change; no file or database is touched.',
    },
    {
        id: 'settings',
        title: '8 · 设置 / Settings',
        route: '/settings?tab=appearance',
        control: '外观 / 数据与格式 / 账号安全 / 全局配置 / 存储管理 / 通知 / 服务 / 高级 / 开发者 / 关于',
        description:
            '十个设置分类使用真实组件。外观中的动效与玻璃材质由你手动选择；2FA 使用 123456，TLS 仅接受 DEMO CERTIFICATE / DEMO PRIVATE KEY。开发者演练只预览，不保存外观、密码或说明确认。 / Explore all ten real settings categories. Effects are manual; 2FA and TLS accept the public examples only. Onboarding replay never saves real preferences or credentials.',
    },
    {
        id: 'reset',
        title: '9 · 重置与刷新 / Reset & refresh',
        route: '/settings?tab=advanced',
        control: '设置 → 高级 → 重置全部 → 重置；Reset / 重置',
        description:
            '顶部「Reset / 重置」或刷新会清空练习数据并回到首次设置。高级页「重置全部」只恢复界面配置。生产控制台的手动显示选择会保存，模拟器仅保留本页内存。 / Reset or reload clears the simulator; Advanced → 重置全部 resets UI preferences only. Production persists manual effects, while this demo keeps them in memory.',
    },
] as const;
