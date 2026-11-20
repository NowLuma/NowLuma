import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mapFeeds, parseQzoneCallback } from '@nowluma/protocol/web/qzone';

// Real feeds3_html_more response captured live (issue #182). Its `data` value
// is a JS object literal (unquoted keys, single-quoted strings, \xNN escapes,
// trailing `undefined`) — JSON.parse throws on it; parseQzoneCallback must not.
const SAMPLE = readFileSync(
    fileURLToPath(new URL('./fixtures/qzone-feeds-sample.jsonp', import.meta.url)),
    'utf8',
);

interface RawFeeds {
    code?: number;
    data?: { data?: unknown[]; hasmore?: number | string };
}

describe('qzone feeds JS-literal parsing (issue #182)', () => {
    it('JSON.parse chokes on the real body (regression baseline)', () => {
        const inner = SAMPLE.slice(SAMPLE.indexOf('{'), SAMPLE.lastIndexOf('}') + 1);
        expect(() => JSON.parse(inner)).toThrow();
    });

    it('parseQzoneCallback evaluates the JS-literal payload', () => {
        const data = parseQzoneCallback<RawFeeds>(SAMPLE);
        expect(data.code).toBe(0);
        expect(Array.isArray(data.data?.data)).toBe(true);
        // The array carries a trailing `undefined` hole alongside the real feed.
        expect(data.data!.data!.length).toBe(2);
        expect(data.data!.data!.some((x) => x === undefined)).toBe(true);
    });

    it('mapFeeds drops the undefined hole and normalises the feed', () => {
        const data = parseQzoneCallback(SAMPLE);
        const result = mapFeeds(data as any);
        expect(result.feeds).toHaveLength(1);
        const f = result.feeds[0]!;
        expect(f.uin).toBe(20050606);
        expect(f.nickname).toBe('官方Qzone');
        expect(f.appid).toBe(311);
        expect(f.time).toBe(1780711209);
        expect(f.key).toBe('aef23101297f236ae4f10600');
        // \xNN escapes decoded by the JS eval, html passed through verbatim.
        expect(f.html).toContain('<li class="f-single f-s-s"');
        expect(f.html).toContain('官方Qzone');
        expect(f.tid).toBe(f.key);
        expect(f.content).toContain('QQ空间');
        expect(f.content).not.toContain('展开全文');
        expect(f.content_complete).toBe(false);
        expect(f.images).toEqual([]);
        expect(f.like_count).toBe(3173513);
        expect(f.comment_count).toBeNull();
        expect(result.has_more).toBe(false);
    });

    it('parses as inert data — never resolves identifiers or executes code', () => {
        // The parser has no notion of globals, member access, or calls: any such
        // token is rejected, so a tampered body cannot reach `process`/`Function`
        // etc. (the whole reason we do NOT eval this payload).
        expect(() => parseQzoneCallback('_preloadCallback({x: process})')).toThrow();
        expect(() => parseQzoneCallback('_preloadCallback({x: callback.constructor})')).toThrow();
        expect(() =>
            parseQzoneCallback('_preloadCallback({x: (function(){return 1})()})'),
        ).toThrow();
        expect(() => parseQzoneCallback('_preloadCallback(eval("1+1"))')).toThrow();
    });

    it('does not pollute Object.prototype via a __proto__ key', () => {
        parseQzoneCallback('_preloadCallback({"__proto__":{"polluted":1},"code":0})');
        expect(({} as any).polluted).toBeUndefined();
    });

    it('decodes JS string escapes (\\xNN, \\/) literally, not as markup', () => {
        const d = parseQzoneCallback<{ s?: string }>("_preloadCallback({s:'\\x3Cb\\x3E&\\/x'})");
        expect(d.s).toBe('<b>&/x');
    });

    it.each([
        ['truncated \\x escape', '_preloadCallback({s:"\\x4"})'],
        ['non-hex \\x escape', '_preloadCallback({s:"\\xZZ"})'],
        ['truncated \\u escape', '_preloadCallback({s:"\\u12"})'],
        ['non-hex \\u escape', '_preloadCallback({s:"\\uZZZZ"})'],
    ])('rejects a %s instead of decoding it to NUL/partial text', (_name, body) => {
        expect(() => parseQzoneCallback(body)).toThrow(/invalid \\[xu] escape/);
    });

    it.each([
        ['identifier', '_preloadCallback({x: process})'],
        ['identifier with member access', '_preloadCallback({x: callback.constructor})'],
        ['true, but misspelled', '_preloadCallback({x: trueish})'],
        ['infinite number', '_preloadCallback({x: Infinity})'],
        ['negative infinite number', '_preloadCallback({x: -Infinity})'],
        ['hex number', '_preloadCallback({x: 0x10})'],
        ['NaN', '_preloadCallback({x: NaN})'],
    ])('rejects an unsupported %s value', (_name, body) => {
        expect(() => parseQzoneCallback(body)).toThrow(/unexpected token in qzone feeds payload/);
    });

    it('drops prototype keys at every depth, including escaped spellings', () => {
        const parsed = parseQzoneCallback<{ a?: Record<string, unknown>; code?: number }>(
            '_preloadCallback({"__proto__":{"polluted":1},"a":{"__pro\\u0074o__":{"polluted":2}},"code":0})',
        );

        expect(({} as any).polluted).toBeUndefined();
        expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
        expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(false);
        expect(Object.getPrototypeOf(parsed.a)).toBe(Object.prototype);
        expect(Object.prototype.hasOwnProperty.call(parsed.a, '__proto__')).toBe(false);
        expect(parsed.code).toBe(0);
    });

    it('keeps the response parser a data-only module', () => {
        // The parser is the only owner of Qzone's JSON/JSONP envelope grammar;
        // it must stay free of transport, credentials, logging and code execution.
        const source = readFileSync(
            fileURLToPath(new URL('../../src/web/qzone-response.ts', import.meta.url)),
            'utf8',
        );

        expect(source).not.toMatch(/^\s*import\s/m);
        expect(source).not.toMatch(
            /\beval\s*\(|\bnew\s+Function\b|\bnode:vm\b|RequestUtil|createLogger/,
        );
    });

    it('rejects a body that captures no object', () => {
        expect(() => parseQzoneCallback('_preloadCallback(42)')).toThrow('invalid feeds response');
        expect(() => parseQzoneCallback('void 0')).toThrow('invalid feeds response');
    });
});
