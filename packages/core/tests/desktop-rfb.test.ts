import { createServer } from 'node:net';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
    connectAuthenticatedVnc,
    readVncBytes,
    RFB_VERSION,
    vncChallengeResponse,
} from '../src/webui/desktop-rfb';

describe('private VNC authentication', () => {
    it('matches the published DES known-answer vector after VNC bit reversal', () => {
        const password = Buffer.from('c82cea9ed93dfb8f', 'hex');
        const challenge = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
        expect(vncChallengeResponse(password, challenge).toString('hex')).toBe(
            '85e813540f0ab40585e813540f0ab405',
        );
        expect(() => vncChallengeResponse(Buffer.alloc(7), challenge)).toThrow();
        expect(() => vncChallengeResponse(password, Buffer.alloc(15))).toThrow();
    });

    it.each(['none', 'bad-password', 'truncated'] as const)(
        'rejects %s instead of falling back to an unauthenticated desktop',
        async (mode) => {
            const server = createServer((socket) => {
                void (async () => {
                    socket.write(RFB_VERSION);
                    await readVncBytes(socket, 12);

                    if (mode === 'none') {
                        socket.end(Buffer.from([1, 1]));
                        return;
                    }

                    socket.write(Buffer.from([1, 2]));
                    await readVncBytes(socket, 1);

                    if (mode === 'truncated') {
                        socket.end(Buffer.alloc(3));
                        return;
                    }

                    socket.write(Buffer.alloc(16));
                    await readVncBytes(socket, 16);
                    socket.end(Buffer.from([0, 0, 0, 1]));
                })().catch(() => socket.destroy());
            });
            server.listen(0, '127.0.0.1');
            await once(server, 'listening');
            const port = (server.address() as { port: number }).port;

            try {
                await expect(
                    connectAuthenticatedVnc(
                        Buffer.from('secret!!'),
                        new AbortController().signal,
                        port,
                    ),
                ).rejects.toThrow();
            } finally {
                await new Promise<void>((resolve) => server.close(() => resolve()));
            }
        },
    );
});
