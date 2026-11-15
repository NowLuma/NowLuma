// Forward-message actions: upload, single-message forward, and merged-forward
// send/get. The facade in ../extended.ts spreads these three ordered slices at
// the positions the actions historically occupied so the registry sequence and
// generated catalog stay byte-for-byte stable.
import { defineAction, groupAction, f, type JsonSchema } from '../../action-kit';
import {
    forwardNodeSchema,
    messageIdSchema,
    messageResultSchema,
} from '../../action-result-schemas';
import type { ForwardPreviewMeta } from '../../modules/message-actions';
import { RETCODE, failedResponse, okResponse, type JsonObject, type JsonValue } from '../../types';

const forwardMessagesField = f
    .message()
    .optional()
    .describe(
        '转发节点数组；节点 content 内的 reply.data.message 可提供自定义引用内容（字符串或消息段），qq/time/seq 可选；仅用于转发内引用预览。',
    );

const forwardPreviewParams = {
    source: f.string().optional(),
    summary: f.string().optional(),
    prompt: f.string().optional(),
    news: f.raw(),
};

/** messages and its historical alias message are one value; both absent is
 *  "not provided" and the action reports the same BAD_REQUEST. */
function forwardMessagesOf(p: {
    messages?: JsonValue;
    message?: JsonValue;
}): JsonValue | undefined {
    return p.messages ?? p.message;
}

function primitiveText(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    return '';
}

function integerFromDecimalString(value: string): number {
    if (value.trim() === '') {
        return 0;
    }

    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
}

// NapCat-compatible forward preview. All four fields are optional — if none
// are provided, the message module infers defaults from the node list.
function readForwardPreviewMeta(p: {
    source?: string;
    summary?: string;
    prompt?: string;
    news?: JsonValue;
}): ForwardPreviewMeta | undefined {
    const source = p.source || undefined;
    const summary = p.summary || undefined;
    const prompt = p.prompt || undefined;
    let news: Array<{ text: string }> | undefined;

    if (Array.isArray(p.news)) {
        const collected: Array<{ text: string }> = [];

        for (const item of p.news) {
            if (typeof item === 'string') {
                collected.push({ text: item });
            } else if (item && typeof item === 'object' && !Array.isArray(item)) {
                const text = primitiveText((item as Record<string, unknown>).text);

                if (text) {
                    collected.push({ text });
                }
            }
        }

        if (collected.length > 0) {
            news = collected;
        }
    }

    if (!source && !summary && !prompt && !news) {
        return undefined;
    }

    return { source, summary, prompt, news };
}

const forwardSendReturnsSchema: JsonSchema = {
    type: 'object',
    properties: {
        message_id: messageIdSchema,
        res_id: {
            type: 'string',
        },
        forward_id: {
            type: 'string',
        },
    },
    required: ['message_id', 'res_id', 'forward_id'],
};

/** upload_forward_msg echoes a positive group_id; the legacy typo alias never
 *  did, so the two return contracts are built from one shape with that switch. */
function forwardUploadReturnsSchema(echoGroupId: boolean): JsonSchema {
    return {
        type: 'object',
        properties: {
            res_id: {
                type: 'string',
            },
            forward_id: {
                type: 'string',
            },
            message_id: {
                const: 0,
                description: '仅上传资源，不代表已发送消息；0 不能用于消息查询或撤回',
            },
            ...(echoGroupId
                ? {
                      group_id: {
                          type: 'integer',
                          description: '仅请求提供正数 group_id 时出现',
                      },
                  }
                : {}),
        },
        required: ['res_id', 'forward_id', 'message_id'],
    };
}

export const forwardUploadActions = [
    // 转发消息。messages/message 互为别名键，两者皆缺省视为未提供。
    defineAction({
        name: 'upload_forward_msg',
        examples: [
            {
                summary: '上传转发消息',
                params: {
                    group_id: 20001,
                    messages: [
                        {
                            type: 'node',
                            data: {
                                user_id: 10001,
                                nickname: '示例用户',
                                content: [
                                    {
                                        type: 'text',
                                        data: {
                                            text: '转发内容',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
                notes: '仅上传合并转发资源，不发送聊天消息；message_id=0 是占位值，后续使用 res_id。',
            },
        ],
        returnsSchema: forwardUploadReturnsSchema(true),
        summary: '上传转发消息',
        params: {
            messages: forwardMessagesField,
            message: forwardMessagesField,
            group_id: f.groupId().optional(),
        },
        run: async (p, ctx) => {
            const messages = forwardMessagesOf(p);
            const groupId = p.group_id ?? 0;

            if (messages === undefined) {
                return failedResponse(RETCODE.BAD_REQUEST, 'message/messages is required');
            }

            // 群聊和私聊转发消息的 resId 是分开的（前者是 type=3+groupUin，后者是 type=1+selfUid），
            const result = await ctx.sendForwardMsg(messages, groupId > 0 ? groupId : undefined);
            const data: Record<string, unknown> = {
                res_id: result.forwardId,
                forward_id: result.forwardId,
                message_id: 0,
            };

            if (groupId > 0) {
                data.group_id = groupId;
            }

            return okResponse(data as JsonObject);
        },
    }),

    defineAction({
        name: 'upload_foward_msg',
        examples: [
            {
                summary: '上传转发消息（别名拼写）',
                params: {
                    messages: [
                        {
                            type: 'node',
                            data: {
                                user_id: 10001,
                                nickname: '示例用户',
                                content: [
                                    {
                                        type: 'text',
                                        data: {
                                            text: '转发内容',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
                notes: '历史拼写兼容接口，仅上传资源；message_id=0，返回值没有 group_id。',
            },
        ],
        returnsSchema: forwardUploadReturnsSchema(false),
        summary: '上传转发消息（别名拼写）',
        params: {
            messages: forwardMessagesField,
            message: forwardMessagesField,
            group_id: f.groupId().optional(),
        },
        run: async (p, ctx) => {
            const messages = forwardMessagesOf(p);
            const groupId = p.group_id ?? 0;

            if (messages === undefined) {
                return failedResponse(RETCODE.BAD_REQUEST, 'message/messages is required');
            }

            const result = await ctx.sendForwardMsg(messages, groupId > 0 ? groupId : undefined);
            return okResponse({
                res_id: result.forwardId,
                forward_id: result.forwardId,
                message_id: 0,
            });
        },
    }),
];

export const forwardSingleActions = [
    defineAction({
        name: 'forward_friend_single_msg',
        examples: [
            {
                summary: '转发单条消息给好友',
                params: {
                    message_id: -123456,
                    user_id: 10001,
                },
                notes: '使用消息事件或发送结果中的真实 message_id，负值合法；消息须在当前账号的消息存储中可查询。',
            },
        ],
        returnsSchema: messageResultSchema,
        summary: '转发单条消息给好友',
        params: {
            message_id: f.messageId(),
            user_id: f.userId(),
        },
        run: async (p, ctx) => {
            const result = await ctx.forwardSingleMsg(p.message_id, { userId: p.user_id });
            return okResponse({ message_id: result.messageId });
        },
    }),

    defineAction({
        name: 'forward_group_single_msg',
        examples: [
            {
                summary: '转发单条消息到群',
                params: {
                    message_id: -123456,
                    group_id: 20001,
                },
                notes: '使用消息事件或发送结果中的真实 message_id，负值合法；消息须在当前账号的消息存储中可查询。',
            },
        ],
        returnsSchema: messageResultSchema,
        summary: '转发单条消息到群',
        params: {
            message_id: f.messageId(),
            group_id: f.groupId(),
        },
        run: async (p, ctx) => {
            const result = await ctx.forwardSingleMsg(p.message_id, { groupId: p.group_id });
            return okResponse({ message_id: result.messageId });
        },
    }),
];

export const forwardSendActions = [
    defineAction({
        name: 'send_forward_msg',
        examples: [
            {
                summary: '发送合并转发（按 message_type/群号自动路由）',
                params: {
                    group_id: 20001,
                    messages: [
                        {
                            type: 'node',
                            data: {
                                user_id: 10001,
                                nickname: '示例用户',
                                content: [
                                    {
                                        type: 'text',
                                        data: {
                                            text: '转发内容',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
                notes: '替换目标群号；nodes 是自定义转发节点数组。send_forward_msg 不提供目标时仅上传资源并返回 message_id=0。',
            },
        ],
        returnsSchema: {
            type: 'object',
            properties: {
                message_id: {
                    anyOf: [
                        messageIdSchema,
                        {
                            const: 0,
                        },
                    ],
                    description: '已发送时是非零有符号消息 ID；未提供目标、仅上传资源时为 0',
                },
                res_id: {
                    type: 'string',
                },
                forward_id: {
                    type: 'string',
                },
            },
            required: ['message_id', 'res_id', 'forward_id'],
        },
        summary: '发送合并转发（按 message_type/群号自动路由）',
        returns: '{ message_id, res_id, forward_id }',
        // group_id/user_id are routing hints, not identity: 0 means "this branch
        // does not apply" and must not error. int({min:0}) optional, not groupId.
        params: {
            messages: forwardMessagesField,
            message: forwardMessagesField,
            message_type: f.string().optional(),
            group_id: f.int({ min: 0 }).optional(),
            user_id: f.int({ min: 0 }).optional(),
            ...forwardPreviewParams,
        },
        run: async (p, ctx) => {
            const messageType = p.message_type ?? '';
            const groupId = p.group_id ?? 0;
            const userId = p.user_id ?? 0;
            const messages = forwardMessagesOf(p);
            const meta = readForwardPreviewMeta(p);

            if (messages === undefined) {
                return failedResponse(RETCODE.BAD_REQUEST, 'message/messages is required');
            }

            if ((messageType === 'group' || groupId > 0) && ctx.sendGroupForwardMsg) {
                if (!groupId) {
                    return failedResponse(RETCODE.BAD_REQUEST, 'group_id is required');
                }

                const result = await ctx.sendGroupForwardMsg(groupId, messages, meta);
                return okResponse({
                    message_id: result.messageId,
                    res_id: result.forwardId,
                    forward_id: result.forwardId,
                });
            }

            if ((messageType === 'private' || userId > 0) && ctx.sendPrivateForwardMsg) {
                if (!userId) {
                    return failedResponse(RETCODE.BAD_REQUEST, 'user_id is required');
                }

                const result = await ctx.sendPrivateForwardMsg(userId, messages, meta);
                return okResponse({
                    message_id: result.messageId,
                    res_id: result.forwardId,
                    forward_id: result.forwardId,
                });
            }

            const result = await ctx.sendForwardMsg(messages);
            return okResponse({
                message_id: 0,
                res_id: result.forwardId,
                forward_id: result.forwardId,
            });
        },
    }),

    groupAction({
        name: 'send_group_forward_msg',
        examples: [
            {
                summary: '发送群合并转发',
                params: {
                    group_id: 20001,
                    messages: [
                        {
                            type: 'node',
                            data: {
                                user_id: 10001,
                                nickname: '示例用户',
                                content: [
                                    {
                                        type: 'text',
                                        data: {
                                            text: '转发内容',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
                notes: '替换目标群号；nodes 是自定义转发节点数组。send_forward_msg 不提供目标时仅上传资源并返回 message_id=0。',
            },
        ],
        returnsSchema: forwardSendReturnsSchema,
        summary: '发送群合并转发',
        returns: '{ message_id, res_id, forward_id }',
        params: {
            messages: forwardMessagesField,
            message: forwardMessagesField,
            ...forwardPreviewParams,
        },
        run: async (p, ctx) => {
            const messages = forwardMessagesOf(p);

            if (messages === undefined) {
                return failedResponse(RETCODE.BAD_REQUEST, 'message/messages is required');
            }

            const result = await ctx.sendGroupForwardMsg(
                p.group_id,
                messages,
                readForwardPreviewMeta(p),
            );
            return okResponse({
                message_id: result.messageId,
                res_id: result.forwardId,
                forward_id: result.forwardId,
            });
        },
    }),

    defineAction({
        name: 'send_private_forward_msg',
        examples: [
            {
                summary: '发送私聊合并转发',
                params: {
                    user_id: 10001,
                    messages: [
                        {
                            type: 'node',
                            data: {
                                user_id: 10001,
                                nickname: '示例用户',
                                content: [
                                    {
                                        type: 'text',
                                        data: {
                                            text: '转发内容',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
                notes: '替换目标好友 QQ 号。',
            },
        ],
        returnsSchema: forwardSendReturnsSchema,
        summary: '发送私聊合并转发',
        returns: '{ message_id, res_id, forward_id }',
        params: {
            user_id: f.userId(),
            messages: forwardMessagesField,
            message: forwardMessagesField,
            ...forwardPreviewParams,
        },
        run: async (p, ctx) => {
            const messages = forwardMessagesOf(p);

            if (messages === undefined) {
                return failedResponse(RETCODE.BAD_REQUEST, 'message/messages is required');
            }

            const result = await ctx.sendPrivateForwardMsg(
                p.user_id,
                messages,
                readForwardPreviewMeta(p),
            );
            return okResponse({
                message_id: result.messageId,
                res_id: result.forwardId,
                forward_id: result.forwardId,
            });
        },
    }),

    defineAction({
        name: 'get_forward_msg',
        examples: [
            {
                summary: '获取合并转发消息（id 或 message_id）',
                params: {
                    id: '<res-id-from-forward-message>',
                },
                notes: 'id 是合并转发资源标识，通常来自转发消息段或上传结果 res_id，不是普通数值 message_id。',
            },
        ],
        summary: '获取合并转发消息（id 或 message_id）',
        readOnly: true,
        returns:
            '{ messages }：转发内的消息节点数组（每项为 OneBot 消息事件）；reply 保留 id，有内嵌引用内容时附带 message 和可用的 qq/time/seq，可作为转发节点 content 再次发送。',
        returnsSchema: {
            type: 'object',
            properties: {
                messages: {
                    type: 'array',
                    description: '转发消息节点数组；节点标识与本地消息 ID 不是同一契约',
                    items: forwardNodeSchema,
                },
            },
            required: ['messages'],
        },
        params: { id: f.string().optional(), message_id: f.string().optional() },
        run: async (p, ctx) => {
            let id = p.id || '';

            if (!id && p.message_id !== undefined) {
                const numericMessageId = integerFromDecimalString(p.message_id);

                if (numericMessageId > 0) {
                    const event = await ctx.getMessage(numericMessageId);
                    const segments = Array.isArray(event?.message) ? event.message : [];

                    for (const seg of segments) {
                        if (typeof seg !== 'object' || seg === null || Array.isArray(seg)) {
                            continue;
                        }

                        const so = seg as Record<string, unknown>;

                        if (String(so.type ?? '') !== 'forward') {
                            continue;
                        }

                        const data =
                            typeof so.data === 'object' &&
                            so.data !== null &&
                            !Array.isArray(so.data)
                                ? (so.data as Record<string, unknown>)
                                : null;
                        const candidate =
                            primitiveText(data?.id) ||
                            primitiveText(data?.res_id) ||
                            primitiveText(data?.forward_id);

                        if (candidate) {
                            id = candidate;
                            break;
                        }
                    }
                }

                if (!id) {
                    id = p.message_id;
                }
            }

            if (!id) {
                return failedResponse(RETCODE.BAD_REQUEST, 'id or message_id is required');
            }

            const messages = await ctx.getForwardMsg(id);
            return okResponse({ messages });
        },
    }),
];
