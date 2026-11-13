import type { ApiResponse, UploadFileStreamComplete } from './types/index.js';

/** Base error for every exception intentionally thrown by the Nowluma SDK. */
export class NowlumaError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'NowlumaError';
    }
}

/** A one-step media operation failed. The original error is preserved as cause. */
export class NowlumaMediaSendError extends NowlumaError {
    readonly stage: 'upload' | 'send';
    /** Present after a completed upload, even when sending fails or is cancelled. */
    readonly upload?: UploadFileStreamComplete;

    constructor(stage: 'upload' | 'send', cause: unknown, upload?: UploadFileStreamComplete) {
        super(`Media ${stage} failed${cause instanceof Error ? `: ${cause.message}` : ''}`, {
            cause,
        });
        this.name = 'NowlumaMediaSendError';
        this.stage = stage;
        this.upload = upload;
    }
}

/** Transport-layer failures before a valid OneBot API response is available. */
export class NowlumaTransportError extends NowlumaError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'NowlumaTransportError';
    }
}

/** The request was cancelled by the caller's AbortSignal. */
export class NowlumaAbortError extends NowlumaTransportError {
    constructor(message = 'Nowluma request aborted', options?: ErrorOptions) {
        super(message, options);
        this.name = 'NowlumaAbortError';
    }
}

/** The request exceeded the configured timeout. */
export class NowlumaTimeoutError extends NowlumaTransportError {
    readonly timeoutMs: number;

    constructor(message: string, timeoutMs: number, options?: ErrorOptions) {
        super(message, options);
        this.name = 'NowlumaTimeoutError';
        this.timeoutMs = timeoutMs;
    }
}

/** The SDK could not establish or keep a connection to Nowluma. */
export class NowlumaConnectionError extends NowlumaTransportError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'NowlumaConnectionError';
    }
}

/** Nowluma returned a payload that could not be parsed as the expected protocol shape. */
export class NowlumaParseError extends NowlumaTransportError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'NowlumaParseError';
    }
}

/** A OneBot API response with status failed or a non-zero retcode. */
export class NowlumaApiError<TData = unknown> extends NowlumaError {
    readonly response: ApiResponse<TData>;
    readonly retcode: number;
    readonly wording?: string;

    constructor(response: ApiResponse<TData>) {
        super(response.wording || `Nowluma API failed with retcode ${response.retcode}`);
        this.name = 'NowlumaApiError';
        this.response = response;
        this.retcode = response.retcode;
        this.wording = response.wording;
    }
}

/** Authentication or authorization failure returned by Nowluma. */
export class NowlumaAuthError<TData = unknown> extends NowlumaApiError<TData> {
    constructor(response: ApiResponse<TData>) {
        super(response);
        this.name = 'NowlumaAuthError';
    }
}

export function createNowlumaApiError<TData>(
    response: ApiResponse<TData>,
): NowlumaApiError<TData> {
    return isAuthFailure(response)
        ? new NowlumaAuthError(response)
        : new NowlumaApiError(response);
}

function isAuthFailure(response: ApiResponse<unknown>): boolean {
    return response.retcode === 1401 || response.retcode === 401 || response.retcode === 403;
}
