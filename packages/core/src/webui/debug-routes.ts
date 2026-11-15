// Debug console routes: action catalog, single/stream action invocation, upload,
// and the live merged event stream. Invocation shares one resolver so both
// endpoints reject malformed input in the same order and never touch an account
// before the body is parsed and validated.

import { collectActionDocs, collectCategories } from '@nowluma/onebot/action-docs';
import type { OneBotInstance } from '@nowluma/onebot/instance';
import type { OneBotManager } from '@nowluma/onebot/manager';
import type { JsonObject as OneBotJsonObject } from '@nowluma/onebot/types';
import { isRealUin } from '@nowluma/common/uin';
import type { Hono, Context } from 'hono';
import { createDroppingSender } from './debug-stream';
import { buildStreamInvokeResponse, streamUploadToDisk } from './debug-tools';
import { createSseResponder } from './sse-response';

export interface DebugRouteDependencies {
    manager: Pick<OneBotManager, 'getInstance' | 'getInstances'>;
    /** Aborted when the WebUI stops; ends every open debug stream. */
    shutdown: AbortSignal;
}

interface DebugInvokeInput {
    action: string;
    params: OneBotJsonObject;
}

export type DebugInvokeTarget =
    | { ok: true; instance: OneBotInstance; input: DebugInvokeInput }
    | { ok: false; status: 400 | 404; message: string };

/** Shared input + instance resolution for /invoke and /invoke-stream. */
export async function resolveDebugInvoke(
    c: Context,
    manager: Pick<OneBotManager, 'getInstance'>,
): Promise<DebugInvokeTarget> {
    let body: unknown;

    try {
        body = await c.req.json();
    } catch {
        return { ok: false, status: 400, message: '请求格式错误' };
    }

    const { uin, action, params } = (body ?? {}) as {
        uin?: unknown;
        action?: unknown;
        params?: unknown;
    };

    if (typeof uin !== 'string' || !isRealUin(uin)) {
        return { ok: false, status: 400, message: '无效的账号' };
    }

    if (typeof action !== 'string' || !action) {
        return { ok: false, status: 400, message: 'action 必填' };
    }

    if (
        params !== undefined &&
        (typeof params !== 'object' || params === null || Array.isArray(params))
    ) {
        return { ok: false, status: 400, message: 'params 必须是对象' };
    }

    const instance = manager.getInstance(uin);

    if (!instance) {
        return { ok: false, status: 404, message: '账号不在线' };
    }

    return {
        ok: true,
        instance,
        input: { action, params: (params ?? {}) as OneBotJsonObject },
    };
}

export function registerDebugRoutes(app: Hono, deps: DebugRouteDependencies): void {
    const sseResponse = createSseResponder(deps.shutdown);

    // Action schemas for the tester form (declarative actions only; legacy ones
    // are invoked freeform).
    app.get('/api/debug/actions', (c) =>
        c.json({ actions: collectActionDocs(), categories: collectCategories() }),
    );

    // Manually invoke an action against one account. Real side effects — gated by
    // the same /api/* auth.
    app.post('/api/debug/invoke', async (c) => {
        const target = await resolveDebugInvoke(c, deps.manager);

        if (!target.ok) {
            return c.json({ status: 'failed', message: target.message }, target.status);
        }

        return c.json(await target.instance.invokeAction(target.input.action, target.input.params));
    });

    // Invoke a Stream API action (or any action) and relay every frame to the
    // browser over an SSE body. The frontend uses fetch()+a stream reader so
    // the session token stays in a header on this POST. Frames are never dropped.
    app.post('/api/debug/invoke-stream', async (c) => {
        const target = await resolveDebugInvoke(c, deps.manager);

        if (!target.ok) {
            return c.json({ status: 'failed', message: target.message }, target.status);
        }

        const rawRequest = JSON.stringify(target.input);
        return buildStreamInvokeResponse(
            (rq, emit, alive) => target.instance.invokeStream(rq, emit, alive),
            rawRequest,
            AbortSignal.any([c.req.raw.signal, deps.shutdown]),
        );
    });

    // Stream a browser-selected file to a temp path on THIS server (the bot runs
    // here, not on the operator's machine), so the returned path can be fed to a
    // send action's file/image/record/video param. Raw bytes in the body,
    // `?filename=` for a human-readable suffix; streamed to disk with a byte cap.
    app.post('/api/debug/upload', async (c) => {
        try {
            const result = await streamUploadToDisk(
                c.req.raw.body as ReadableStream<Uint8Array> | null,
                c.req.query('filename'),
            );
            return c.json({ status: 'ok', path: result.path, size: result.size });
        } catch (err) {
            return c.json(
                { status: 'failed', message: err instanceof Error ? err.message : '上传失败' },
                400,
            );
        }
    });

    // Live merged SSE of OneBot events + action calls across all accounts. Taps
    // are attached only while a client is connected (on-demand). A slow client is
    // dropped (not back-pressured onto the bot) with a periodic drop marker.
    app.get('/api/debug/stream', (c) =>
        sseResponse(c, (ch) => {
            const send = createDroppingSender(ch);
            send({ kind: 'ready' });

            for (const inst of deps.manager.getInstances()) {
                const uin = inst.uin;
                ch.onClose(
                    inst.subscribeDebugEvents((event) => send({ kind: 'event', uin, event })),
                );
                ch.onClose(inst.observeActions((rec) => send({ kind: 'action', uin, ...rec })));
            }
        }),
    );
}
