export { NOWLUMA_ACTIONS, isKnownAction } from './actions.js';
export type { NowlumaKnownAction } from './actions.js';
export { NowlumaApiClient } from './client/api-client.js';
export { createHttpClient, NowlumaHttpClient } from './client/http-client.js';
export type { NowlumaHttpClientOptions } from './client/http-client.js';
export { createWebSocketClient, NowlumaWebSocketClient } from './client/websocket-client.js';
export {
    createNowlumaApiError,
    NowlumaAbortError,
    NowlumaApiError,
    NowlumaAuthError,
    NowlumaConnectionError,
    NowlumaError,
    NowlumaMediaSendError,
    NowlumaParseError,
    NowlumaTimeoutError,
    NowlumaTransportError,
} from './errors.js';
export {
    createEventContext,
    isBotStatusEvent,
    isGroupMessageEvent,
    isMessageEvent,
    isMetaEvent,
    isNoticeEvent,
    isPrivateMessageEvent,
    isRequestEvent,
    matchCommand,
    noticeType,
    requestType,
} from './events/index.js';
export {
    at,
    atAll,
    br,
    chain,
    contact,
    escapeCqParam,
    escapeCqText,
    face,
    forward,
    fromCQString,
    image,
    json,
    location,
    message,
    MessageChain,
    music,
    node,
    normalizeMessage,
    parseSegments,
    poke,
    quoteMessage,
    raw,
    record,
    reply,
    share,
    text,
    toCQString,
    video,
    xml,
} from './messages/index.js';

export type {
    EventWaitOptions,
    ReconnectOptions,
    NowlumaWebSocketClientOptions,
    NowlumaWebSocketEvents,
    WebSocketCloseInfo,
    WebSocketConstructor,
} from './client/websocket-client.js';

export type {
    CommandHandler,
    CommandMatch,
    CommandOptions,
    EventHandler,
    EventMiddleware,
    EventNext,
    EventPredicate,
    MaybePromise,
    RequestDecisionOptions,
    NowlumaEventContext,
    NowlumaEventContextWithQuote,
} from './events/index.js';

export type * from './types/index.js';
