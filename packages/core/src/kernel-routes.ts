import { createLogger } from '@nowluma/common/logger';
import { isRealUin } from '@nowluma/common/uin';
import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { kernelCatalog, KernelPolicyError, type KernelPolicyStore } from './kernel-policy';

const log = createLogger('KernelPolicy');

export function registerKernelRoutes(app: Hono, store?: KernelPolicyStore): void {
    app.get('/api/kernel/catalog', (c) => c.json(kernelCatalog()));
    app.use(
        '/api/kernel/accounts/*',
        bodyLimit({
            maxSize: 4096,
            onError: (c) => c.json({ success: false, message: '请求体过大' }, 413),
        }),
    );
    app.get('/api/kernel/accounts/:uin', (c) => {
        const uin = c.req.param('uin');

        if (!isRealUin(uin)) {
            return c.json({ success: false, message: 'invalid uin' }, 400);
        }

        if (!store) {
            return c.json({ success: false, message: '内核策略未配置' }, 503);
        }

        try {
            const selection = store.get(uin);
            return c.json({
                selection,
                options: kernelCatalog().options,
                canLoad: store.canLoad(selection),
            });
        } catch (error) {
            log.error('read kernel policy failed: %s', error);
            return c.json(
                { success: false, message: '账号内核选择配置读取失败，请检查服务器日志' },
                500,
            );
        }
    });
    app.post('/api/kernel/accounts/:uin', async (c) => {
        const uin = c.req.param('uin');

        if (!isRealUin(uin)) {
            return c.json({ success: false, message: 'invalid uin' }, 400);
        }

        if (!store) {
            return c.json({ success: false, message: '内核策略未配置' }, 503);
        }

        let input: unknown;

        try {
            input = await c.req.json();
        } catch {
            return c.json({ success: false, message: '请求格式错误' }, 400);
        }

        try {
            const selection = store.save(uin, input);
            return c.json({ success: true, selection, canLoad: store.canLoad(selection) });
        } catch (error) {
            if (error instanceof KernelPolicyError) {
                return c.json({ success: false, message: error.message }, error.status);
            }

            log.error('save kernel policy failed: %s', error);
            return c.json(
                { success: false, message: '账号内核选择配置保存失败，请检查服务器日志' },
                500,
            );
        }
    });
}
