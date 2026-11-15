import fs from 'node:fs';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPAT_RISK_VERSION, KernelPolicyStore } from '../src/kernel-policy';

let temporary: string;
let file: string;
let store: KernelPolicyStore;
const choice = { kernel: 'compat', riskAccepted: true, riskVersion: COMPAT_RISK_VERSION };
beforeEach(() => {
    temporary = mkdtempSync(path.join(os.tmpdir(), 'nowluma-kernel-policy-'));
    file = path.join(temporary, 'kernel-selections.json');
    store = new KernelPolicyStore(file);
});
afterEach(() => {
    vi.restoreAllMocks();
    rmSync(temporary, { recursive: true, force: true });
});

describe('KernelPolicyStore', () => {
    it('persists explicit consent per real account without granting other accounts permission', () => {
        expect(store.get('10001')).toBeNull();
        expect(() => store.authorize('10001')).toThrow('主动确认');
        const selection = store.save('10001', choice);
        expect(selection).toMatchObject(choice);
        expect(Date.parse(selection.acceptedAt)).toBeGreaterThan(0);
        const restarted = new KernelPolicyStore(file);
        expect(() => restarted.authorize('10001')).not.toThrow();
        expect(() => restarted.authorize('20002')).toThrow('主动确认');
        expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
            version: 1,
            accounts: { '10001': selection },
        });
    });

    it.each([
        null,
        [],
        {},
        { ...choice, riskAccepted: false },
        { ...choice, riskAccepted: 'true' },
        { ...choice, riskVersion: 'old' },
        { ...choice, kernel: 'rewrite' },
        { ...choice, extra: true },
    ])('rejects untrusted or unavailable choices: %j', (input) => {
        expect(() => store.save('10001', input)).toThrow();
        expect(store.get('10001')).toBeNull();
    });

    it.each(['0', '../10001', '1700000000000', 'invalid'])('rejects account key %s', (uin) => {
        expect(() => store.save(uin, choice)).toThrow('invalid uin');
    });

    it.each(['{broken', '{"version":2,"accounts":{}}', '{"version":1,"accounts":{"0":{}}}'])(
        'preserves damaged files on read and write',
        (raw) => {
            writeFileSync(file, raw);
            expect(() => store.get('10001')).toThrow();
            expect(() => store.save('10001', choice)).toThrow();
            expect(readFileSync(file, 'utf8')).toBe(raw);
        },
    );

    it('preserves existing account selections when atomic replacement fails', () => {
        store.save('10001', choice);
        const original = readFileSync(file, 'utf8');
        vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
            throw new Error('replace failed');
        });
        expect(() => store.save('20002', choice)).toThrow('replace failed');
        expect(readFileSync(file, 'utf8')).toBe(original);
        expect(fs.existsSync(`${file}.tmp`)).toBe(false);
        expect(store.get('20002')).toBeNull();
    });

    it('never falls back from a persisted rewrite selection or stale risk version', () => {
        const selection = { ...choice, acceptedAt: new Date().toISOString() };

        for (const next of [
            { ...selection, kernel: 'rewrite' },
            { ...selection, riskVersion: 'old' },
        ]) {
            writeFileSync(file, JSON.stringify({ version: 1, accounts: { '10001': next } }));
            expect(store.canLoad(store.get('10001'))).toBe(false);
            expect(() => store.authorize('10001')).toThrow();
        }
    });
});
