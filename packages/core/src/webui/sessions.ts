import type { SseChannel } from './sse-response';

interface SessionInfo {
    expiresAt: number;
    mustChangePassword: boolean;
}

interface SessionStreams {
    channels: Set<SseChannel>;
    timer?: ReturnType<typeof setTimeout>;
}

/** Session removal also closes its protected streams, including their subscriptions. */
export class WebuiSessions extends Map<string, SessionInfo> {
    private readonly streams = new Map<string, SessionStreams>();

    override get(token: string): SessionInfo | undefined {
        const session = super.get(token);

        if (session && Date.now() > session.expiresAt) {
            this.delete(token);
            return undefined;
        }

        return session;
    }

    override delete(token: string): boolean {
        const removed = super.delete(token);
        this.streams.get(token)?.channels.forEach((channel) => channel.close());
        return removed;
    }

    override clear(): void {
        for (const token of this.keys()) {
            this.delete(token);
        }
    }

    bindStream(token: string, channel: SseChannel): void {
        if (channel.isClosed()) {
            return;
        }

        if (!this.get(token)) {
            channel.close();
            return;
        }

        let active = this.streams.get(token);

        if (!active) {
            active = { channels: new Set() };
            this.streams.set(token, active);
        }

        const streams = active;
        streams.channels.add(channel);
        channel.onClose(() => {
            streams.channels.delete(channel);

            if (streams.channels.size === 0) {
                clearTimeout(streams.timer);
                this.streams.delete(token);
            }
        });

        if (!streams.timer) {
            const scheduleExpiry = () => {
                const session = this.get(token);

                if (session) {
                    // Sessions remain valid through expiresAt; cap delays at Node's timer limit.
                    const delay = Math.min(
                        2_147_483_647,
                        Math.max(1, session.expiresAt - Date.now() + 1),
                    );
                    streams.timer = setTimeout(scheduleExpiry, delay);
                    streams.timer.unref();
                }
            };

            scheduleExpiry();
        }
    }
}
