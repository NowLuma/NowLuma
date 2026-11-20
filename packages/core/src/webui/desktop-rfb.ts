import { createCipheriv } from 'node:crypto';
import { createConnection, type Socket } from 'node:net';

const VERSION = Buffer.from('RFB 003.008\n');

/** VNC reverses the bits of each password byte. Repeated-key 3DES equals DES. */
export function vncChallengeResponse(password: Buffer, challenge: Buffer): Buffer {
    if (password.length !== 8 || challenge.length !== 16) {
        throw new Error('Invalid VNC credential or challenge length');
    }

    const key = Buffer.alloc(8);

    for (let i = 0; i < 8; i++) {
        let byte = password[i]!;

        for (let bit = 0; bit < 8; bit++) {
            key[i] = (key[i]! << 1) | (byte & 1);
            byte >>>= 1;
        }
    }

    const cipher = createCipheriv('des-ede3', Buffer.concat([key, key, key]), null);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(challenge), cipher.final()]);
}

/** Consume exactly one handshake field, leaving subsequent bytes in the socket. */
export function readVncBytes(socket: Socket, size: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            socket.off('readable', readable);
            socket.off('error', failed);
            socket.off('close', closed);
        };

        const failed = (error: Error) => {
            cleanup();
            reject(error);
        };

        const closed = () => failed(new Error('VNC closed during handshake'));

        const readable = () => {
            const chunk = socket.read(size) as Buffer | null;

            if (chunk !== null) {
                cleanup();

                if (chunk.length !== size) {
                    reject(new Error('Truncated VNC handshake'));
                } else {
                    resolve(chunk);
                }
            }
        };

        socket.on('readable', readable);
        socket.once('error', failed);
        socket.once('close', closed);

        if (socket.destroyed) {
            closed();
            return;
        }

        readable();
    });
}

/** Authenticate to the private loopback desktop; browser clients never receive its password. */
export async function connectAuthenticatedVnc(
    password: Buffer,
    signal: AbortSignal,
    port = 5900,
): Promise<Socket> {
    const socket = createConnection({ host: '127.0.0.1', port, signal });
    socket.setTimeout(10_000, () => socket.destroy(new Error('VNC handshake timed out')));
    // Errors also arrive between awaited fields; every socket always has a handler.
    socket.on('error', () => undefined);

    try {
        const version = await readVncBytes(socket, 12);

        if (!version.equals(VERSION)) {
            throw new Error('VNC requires RFB 3.8');
        }

        socket.write(VERSION);
        const count = (await readVncBytes(socket, 1))[0]!;

        if (!count || !(await readVncBytes(socket, count)).includes(2)) {
            throw new Error('Private VNC password authentication is unavailable');
        }

        socket.write(Buffer.from([2]));
        const challenge = await readVncBytes(socket, 16);
        socket.write(vncChallengeResponse(password, challenge));

        if ((await readVncBytes(socket, 4)).readUInt32BE() !== 0) {
            throw new Error('Private VNC authentication failed');
        }

        socket.setTimeout(0);
        return socket;
    } catch (error) {
        socket.destroy();
        throw error;
    }
}

export const RFB_VERSION = VERSION;
