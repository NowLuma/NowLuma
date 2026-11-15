/**
 * Pure decoders for Qzone CGI response bodies: raw JSON, JSONP wrappers and the
 * object-literal subset emitted by feeds3_html_more.
 *
 * Data only: this module owns the envelope grammar, never transport, cookies,
 * logging or Qzone business state. Callers in ./qzone interpret the decoded
 * envelopes and perform their own effects.
 */

const QZONE_API_ERROR = 'invalid response from qzone api';

/** `\xNN` / `\uNNNN` are the only escapes the CGI emits with a hex value. */
const HEX_ESCAPE = /^[0-9A-Fa-f]+$/;
/** JSON number grammar — decimal only; identifiers and non-finite values are not data. */
const NUMBER_TOKEN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const SIMPLE_ESCAPES: Record<string, string> = {
    n: '\n',
    t: '\t',
    r: '\r',
    b: '\b',
    f: '\f',
    v: '\v',
    '0': '\0',
};

function isWhitespace(c: string | undefined): boolean {
    return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
}

function isKeyChar(c: string | undefined): boolean {
    return c !== undefined && /[A-Za-z0-9_$]/.test(c);
}

function isValueDelimiter(c: string | undefined): boolean {
    return c === undefined || c === ',' || c === '}' || c === ']' || c === ':' || isWhitespace(c);
}

function objectSlice(text: string, start: number, end: number): string | null {
    return start !== -1 && end > start ? text.slice(start, end + 1) : null;
}

/**
 * One parser instance owns one source string and its cursor. The CGIs only ever
 * hand us a value, so parsing stops after the first complete value and ignores
 * the trailing `);`.
 */
class QzoneLiteralParser {
    private index = 0;

    constructor(private readonly source: string) {}

    parse(): unknown {
        return this.readValue();
    }

    private skipWhitespace(): void {
        while (isWhitespace(this.source[this.index])) {
            this.index++;
        }
    }

    private readValue(): unknown {
        this.skipWhitespace();
        const c = this.source[this.index];

        if (c === undefined) {
            throw new Error('unexpected end of qzone feeds payload');
        }

        if (c === '{') {
            return this.readObject();
        }

        if (c === '[') {
            return this.readArray();
        }

        if (c === '"' || c === "'") {
            return this.readString(c);
        }

        return this.readToken();
    }

    private readObject(): Record<string, unknown> {
        this.index++; // {
        const object: Record<string, unknown> = {};
        this.skipWhitespace();

        if (this.source[this.index] === '}') {
            this.index++;
            return object;
        }

        for (;;) {
            const key = this.readKey();
            this.skipWhitespace();

            if (this.source[this.index] !== ':') {
                throw new Error('expected ":" in qzone feeds payload');
            }

            this.index++;
            const value = this.readValue();

            // Assignment would invoke Object.prototype's __proto__ setter.
            if (key !== '__proto__') {
                object[key] = value;
            }

            this.skipWhitespace();
            const c = this.source[this.index];

            if (c === ',') {
                this.index++;
                this.skipWhitespace();

                if (this.source[this.index] === '}') {
                    this.index++;
                    return object;
                }

                continue;
            }

            if (c === '}') {
                this.index++;
                return object;
            }

            throw new Error('expected "," or "}" in qzone feeds payload');
        }
    }

    private readArray(): unknown[] {
        this.index++; // [
        const array: unknown[] = [];
        this.skipWhitespace();

        if (this.source[this.index] === ']') {
            this.index++;
            return array;
        }

        for (;;) {
            array.push(this.readValue());
            this.skipWhitespace();
            const c = this.source[this.index];

            if (c === ',') {
                this.index++;
                this.skipWhitespace();

                if (this.source[this.index] === ']') {
                    this.index++;
                    return array;
                }

                continue;
            }

            if (c === ']') {
                this.index++;
                return array;
            }

            throw new Error('expected "," or "]" in qzone feeds payload');
        }
    }

    private readKey(): string {
        this.skipWhitespace();
        const first = this.source[this.index];

        if (first === '"' || first === "'") {
            return this.readString(first);
        }

        let key = '';

        while (isKeyChar(this.source[this.index])) {
            key += this.source[this.index];
            this.index++;
        }

        if (!key) {
            throw new Error('expected object key in qzone feeds payload');
        }

        return key;
    }

    private readString(quote: string): string {
        this.index++; // opening quote
        let out = '';

        for (;;) {
            const c = this.source[this.index];

            if (c === undefined) {
                throw new Error('unterminated string in qzone feeds payload');
            }

            if (c === quote) {
                this.index++;
                return out;
            }

            if (c === '\\') {
                out += this.readEscape();
                continue;
            }

            out += c;
            this.index++;
        }
    }

    private readEscape(): string {
        const escape = this.source[this.index + 1];

        if (escape === undefined) {
            throw new Error('unterminated string in qzone feeds payload');
        }

        if (escape === 'x' || escape === 'u') {
            return this.readHexEscape(escape, escape === 'x' ? 2 : 4);
        }

        this.index += 2;
        // Unknown escapes are identity escapes in JS: `\/` → `/`, `\'` → `'`.
        return SIMPLE_ESCAPES[escape] ?? escape;
    }

    private readHexEscape(kind: 'x' | 'u', length: 2 | 4): string {
        const start = this.index + 2;
        const digits = this.source.slice(start, start + length);

        if (digits.length !== length || !HEX_ESCAPE.test(digits)) {
            throw new Error(`invalid \\${kind} escape in qzone feeds payload`);
        }

        this.index = start + length;
        return String.fromCharCode(parseInt(digits, 16));
    }

    private readToken(): unknown {
        let token = '';

        while (!isValueDelimiter(this.source[this.index])) {
            token += this.source[this.index];
            this.index++;
        }

        if (token === 'true') {
            return true;
        }

        if (token === 'false') {
            return false;
        }

        if (token === 'null') {
            return null;
        }

        if (token === 'undefined') {
            return undefined;
        }

        if (NUMBER_TOKEN.test(token)) {
            return Number(token);
        }

        throw new Error('unexpected token in qzone feeds payload: ' + token.slice(0, 20));
    }
}

/**
 * Parse a Qzone CGI body that may be raw JSON or a JSONP callback wrapper
 * (`_Callback({...});`, `frameElement.callback({...});`, `back({...});`).
 * Throws if no JSON object body is present (e.g. an HTML error page).
 */
export function parseQzoneJson<T>(text: string): T {
    const back = text.lastIndexOf('back(');
    const backEnd = back === -1 ? -1 : text.indexOf(');', back);
    const candidates = [
        objectSlice(text, text.indexOf('{'), text.lastIndexOf('}')),
        objectSlice(
            text,
            back === -1 ? -1 : text.indexOf('{', back),
            text.lastIndexOf('}', backEnd === -1 ? undefined : backEnd),
        ),
    ];
    let parseError: unknown;

    for (const candidate of candidates) {
        if (candidate === null) {
            continue;
        }

        try {
            return JSON.parse(candidate) as T;
        } catch (error) {
            parseError = error;
        }
    }

    throw new Error(QZONE_API_ERROR, { cause: parseError });
}

/**
 * Extract the object a Qzone feeds JSONP body hands to its callback, parsed as
 * data. feeds3_html_more emits a JS object literal (unquoted keys,
 * single-quoted strings, `\xNN` escapes, `undefined`) that JSON.parse rejects,
 * and no output format makes the CGI emit real JSON. Descending the literal can
 * only ever produce a value, never run code, so it cannot execute a tampered
 * body the way an in-process JS sandbox could.
 *
 * Handles objects (unquoted or quoted keys), arrays (including trailing commas
 * and `undefined`), single/double-quoted strings with JS escapes, decimal
 * numbers and `true|false|null|undefined`. `__proto__` keys are dropped.
 */
export function parseQzoneCallback<T>(text: string): T {
    const start = text.indexOf('{');

    if (start === -1) {
        throw new Error('invalid feeds response from qzone api');
    }

    const value = new QzoneLiteralParser(text.slice(start)).parse();

    if (value === null || typeof value !== 'object') {
        throw new Error('invalid feeds response from qzone api');
    }

    return value as T;
}
