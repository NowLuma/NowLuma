import type { TutorialId, TutorialLanguage } from './tutorial-options';

export type TutorialSectionAnchors = Readonly<Record<TutorialLanguage, string>>;
export type TutorialSectionRequest = Readonly<{
    type: 'nowluma-tutorial-section';
    tutorial: TutorialId;
    step: string;
    lang: TutorialLanguage;
}>;

// Fixed native VitePress heading IDs in the current chapter only. Receivers must
// validate origin, their own iframe source, exact message keys and chapter/lang
// before looking up an own step key. Never accept an anchor or URL in a message.
export const TUTORIAL_SECTION_ANCHORS: Readonly<
    Record<TutorialId, Readonly<Record<string, TutorialSectionAnchors>>>
> = {
    index: {
        boundary: { zh: '阅读路线', en: 'reading-paths' },
        overview: { zh: '阅读路线', en: 'reading-paths' },
        process: { zh: '章节', en: 'chapters' },
    },
    introduction: {
        overview: { zh: '组成部分', en: 'components' },
        account: { zh: '三种不同的保存结果', en: 'three-kinds-of-save-result' },
        layers: { zh: '状态词', en: 'state-words' },
    },
    'install-docker': {
        'post-install': { zh: '安装向导', en: 'installer' },
        service: { zh: '端口与网络', en: 'ports-and-network' },
        diagnostics: { zh: '数据卷', en: 'volumes' },
        process: { zh: '首次进入', en: 'first-entry' },
    },
    'install-native': {
        'post-install': { zh: 'linux-lite', en: 'linux-lite' },
        service: { zh: '首次接入', en: 'first-attach' },
        diagnostics: { zh: '桌面与权限', en: 'desktop-and-permissions' },
        process: { zh: '首次接入', en: 'first-attach' },
    },
    'first-run': {
        login: { zh: '登录', en: 'login' },
        consent: { zh: '阅读使用说明', en: 'reading-the-notices' },
        password: { zh: '设置访问密码', en: 'setting-the-access-password' },
        effects: { zh: '显示效果', en: 'display-effects' },
        finish: { zh: '之后看到什么', en: 'what-happens-next' },
    },
    overview: {
        overview: { zh: '页面结构', en: 'page-structure' },
        process: { zh: '连接工作流', en: 'connection-workflow' },
        account: { zh: '连接工作流', en: 'connection-workflow' },
    },
    'qq-connection': {
        process: { zh: '进程状态', en: 'process-states' },
        kernel: { zh: '选择接入内核', en: 'choosing-the-access-kernel' },
        online: { zh: '保存选择不等于接入', en: 'saving-is-not-attaching' },
        stop: { zh: '卸载', en: 'unload' },
    },
    'onebot-config': {
        account: { zh: '页面结构', en: 'layout' },
        http: { zh: '四个连接页签', en: 'four-transports' },
        'save-config': { zh: '保存与生效', en: 'save-and-apply' },
        availability: { zh: '连接列表', en: 'connection-list' },
    },
    logs: {
        logs: { zh: '实时流', en: 'live-stream' },
        filter: { zh: '搜索与显示选项', en: 'search-and-display-options' },
        'trace-export': { zh: '导出与清空', en: 'export-and-clear' },
    },
    debug: {
        debug: { zh: '四个工作区', en: 'four-workspaces' },
        send: { zh: '接口调用', en: 'action-tester' },
        get: { zh: '接口调用', en: 'action-tester' },
    },
    'settings-console': {
        appearance: { zh: '外观', en: 'appearance' },
        'save-appearance': { zh: '显示效果', en: 'display-effects' },
    },
    'settings-runtime': {
        service: { zh: '服务监听', en: 'webui-listener' },
        'save-service': { zh: '服务监听', en: 'webui-listener' },
        diagnostics: { zh: '服务', en: 'services' },
    },
    'access-network': {
        service: { zh: '三种入口', en: 'three-entry-modes' },
        proxy: { zh: '反向代理', en: 'reverse-proxy' },
        http: { zh: '局域网', en: 'lan' },
        'save-config': { zh: '局域网', en: 'lan' },
    },
    'data-backup': {
        storage: { zh: '数据放在哪里', en: 'locations' },
        retention: { zh: '清理', en: 'cleanup' },
        cleanup: { zh: '清理', en: 'cleanup' },
        backup: { zh: '备份', en: 'backup' },
    },
    troubleshooting: {
        offline: { zh: 'qq-会话与账号内核', en: 'qq-sessions-and-account-kernel' },
        logs: { zh: '运行记录与调试', en: 'logs-and-debug' },
        filter: { zh: '运行记录与调试', en: 'logs-and-debug' },
        diagnostics: { zh: '先看哪里', en: 'where-to-look' },
    },
    demo: {
        limits: { zh: '打开方式', en: 'opening-it' },
        overview: { zh: '能做什么', en: 'what-you-can-practise' },
        account: { zh: '能做什么', en: 'what-you-can-practise' },
        http: { zh: '能做什么', en: 'what-you-can-practise' },
        'save-config': { zh: '能做什么', en: 'what-you-can-practise' },
    },
    planned: {
        process: { zh: '平台', en: 'platforms' },
        unavailable: { zh: '重写内核', en: 'rewrite-kernel' },
        diagnostics: { zh: '需要你自己验证', en: 'verify-yourself' },
    },
    developing: {
        diagnostics: { zh: '目录', en: 'layout' },
        evidence: { zh: '本地验证', en: 'local-validation' },
        account: { zh: '变更边界', en: 'change-boundaries' },
        'save-config': { zh: '变更边界', en: 'change-boundaries' },
    },
};
