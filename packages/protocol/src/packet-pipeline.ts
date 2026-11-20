import type { PacketInfo } from '@nowluma/common/protocol-types';
import { createLogger, type Logger } from '@nowluma/common/logger';
import { AccountEventDispatcher, type DispatchTrace } from './account-event-dispatcher';
import { AccountEventEnricher } from './account-event-enricher';
import type { BridgeEventBus } from './event-bus';
import type { QQEventVariant } from './events';
import type { GroupInviteTracker } from './group-invite-tracker';
import type { IdentityService } from './identity-service';
import type { GroupRequestInfo } from './qq-info';

const moduleLog = createLogger('Bridge');
const moduleEventLog = createLogger('Event');
const modulePacketLog = createLogger('Protocol.Packet');

export type CmdParser = (pkt: PacketInfo, identity: IdentityService) => QQEventVariant[];

class EnrichedDispatchError extends Error {
    constructor(readonly originalError: unknown) {
        super(originalError instanceof Error ? originalError.message : String(originalError));
        this.name = 'EnrichedDispatchError';
    }
}

export interface PacketPipelineDeps {
    identity: IdentityService;
    events: BridgeEventBus;
    /** Account group-list fetch. Roster side-effect only; the pipeline
     *  swallows failures and does not read the returned roster. */
    fetchGroupList(): Promise<void>;
    /** One group's member-list fetch (adapter TTL applies). Roster
     *  side-effect only; the pipeline does not pass `force`. */
    fetchGroupMemberList(groupId: number): Promise<void>;
    /** Resolve a pending request's comment and approval tuple after a push. */
    resolveGroupJoinRequest(
        groupId: number,
        uid: string,
        subType: 'add' | 'invite',
        invitedUid?: string,
    ): Promise<GroupRequestInfo | null>;
    groupInvites: GroupInviteTracker;
}

/**
 * Receive-chain facade: cmd-parser registry, per-packet branch tracing and
 * dispatch accounting. Event effects live in AccountEventDispatcher; missing
 * identity/request enrichment lives in AccountEventEnricher.
 */
export class IncomingPacketPipeline {
    private cmdHandlers_ = new Map<string, CmdParser[]>();
    private readonly log: Logger;
    private readonly packetLog: Logger;
    private readonly dispatcher: AccountEventDispatcher;
    private readonly enricher: AccountEventEnricher;

    constructor(private readonly deps: PacketPipelineDeps) {
        // Tag every line we emit with this Bridge's UIN so per-account file
        // routing works. Unparseable uin (shouldn't happen) falls back to
        // the module-level logger so we still log, just without the slot.
        const uinNum = Number.parseInt(deps.identity.uin, 10);
        const bind = Number.isFinite(uinNum) && uinNum > 0 ? { uin: uinNum } : null;
        this.log = bind ? moduleLog.child(bind) : moduleLog;
        this.packetLog = bind ? modulePacketLog.child(bind) : modulePacketLog;
        const eventLog = bind ? moduleEventLog.child(bind) : moduleEventLog;
        this.dispatcher = new AccountEventDispatcher({
            identity: deps.identity,
            events: deps.events,
            groupInvites: deps.groupInvites,
            fetchGroupList: () => deps.fetchGroupList(),
            fetchGroupMemberList: (groupId) => deps.fetchGroupMemberList(groupId),
            log: this.log,
            eventLog,
        });
        this.enricher = new AccountEventEnricher({
            identity: deps.identity,
            groupInvites: deps.groupInvites,
            resolveGroupJoinRequest: (groupId, uid, subType, invitedUid) =>
                deps.resolveGroupJoinRequest(groupId, uid, subType, invitedUid),
            log: this.log,
        });
    }

    registerCmd(cmd: string, parser: CmdParser): void {
        const arr = this.cmdHandlers_.get(cmd) ?? [];
        arr.push(parser);
        this.cmdHandlers_.set(cmd, arr);
    }

    handlesCmd(cmd: string): boolean {
        return this.cmdHandlers_.has(cmd);
    }

    process(pkt: PacketInfo): Promise<void> {
        return this.processWithHandlers(pkt, this.cmdHandlers_.get(pkt.serviceCmd));
    }

    processEvents(pkt: PacketInfo, events: readonly QQEventVariant[]): Promise<void> {
        return this.processWithHandlers(pkt, [() => [...events]]);
    }

    private processWithHandlers(
        pkt: PacketInfo,
        handlers: readonly CmdParser[] | undefined,
    ): Promise<void> {
        const startedAt = Date.now();

        if (!handlers) {
            this.packetLog.trace(() => [
                'packet_branch serviceCmd=%j seqId=%d branch=parser_unregistered',
                pkt.serviceCmd,
                pkt.seqId,
            ]);
            this.packetLog.trace(() => [
                'packet_terminal serviceCmd=%j seqId=%d outcome=dropped reason=parser_unregistered events=0 dispatched=0 elapsedMs=%d',
                pkt.serviceCmd,
                pkt.seqId,
                Date.now() - startedAt,
            ]);
            return Promise.resolve();
        }

        const trace: DispatchTrace = (kind, mode) => this.traceDispatch(pkt, kind, mode);
        let eventCount = 0;
        let dispatched = 0;
        let parserErrors = 0;
        let dispatchErrors = 0;
        let enrichmentFailures = 0;
        const enrichmentTasks: Promise<void>[] = [];

        handlers.forEach((handler, index) => {
            const parser = index + 1;

            try {
                const events = handler(pkt, this.deps.identity);

                if (events.length === 0) {
                    this.packetLog.trace(() => [
                        'packet_branch serviceCmd=%j seqId=%d parser=%d branch=parser_zero_events',
                        pkt.serviceCmd,
                        pkt.seqId,
                        parser,
                    ]);
                    return;
                }

                eventCount += events.length;
                this.packetLog.trace(() => [
                    'packet_branch serviceCmd=%j seqId=%d parser=%d branch=parser_events events=%d',
                    pkt.serviceCmd,
                    pkt.seqId,
                    parser,
                    events.length,
                ]);

                for (const event of events) {
                    if (this.enricher.needsIdentityRefresh(event)) {
                        this.traceEnrichmentStarted(pkt, event, 'identity_refresh');
                        const task = this.dispatchAfterIdentityRefresh(pkt, event, trace)
                            .then((count) => {
                                dispatched += count;
                            })
                            .catch((error) => {
                                if (error instanceof EnrichedDispatchError) {
                                    dispatchErrors += 1;
                                    this.traceDispatchFailure(pkt, event, error.originalError);
                                } else {
                                    enrichmentFailures += 1;
                                    this.traceEnrichmentFailure(
                                        pkt,
                                        event,
                                        'identity_refresh',
                                        error,
                                    );
                                }

                                this.log.warn(
                                    'dispatchAfterIdentityRefresh failed: %s',
                                    error instanceof Error
                                        ? (error.stack ?? error.message)
                                        : String(error),
                                );
                            });
                        enrichmentTasks.push(task);
                    } else if (event.kind === 'group_invite') {
                        this.traceEnrichmentStarted(pkt, event, 'group_invite');
                        const task = this.dispatchGroupInvite(event, trace)
                            .then((count) => {
                                dispatched += count;
                            })
                            .catch((error) => {
                                if (error instanceof EnrichedDispatchError) {
                                    dispatchErrors += 1;
                                    this.traceDispatchFailure(pkt, event, error.originalError);
                                } else {
                                    enrichmentFailures += 1;
                                    this.traceEnrichmentFailure(pkt, event, 'group_invite', error);
                                }

                                this.log.warn(
                                    'dispatchGroupInvite failed: %s',
                                    error instanceof Error
                                        ? (error.stack ?? error.message)
                                        : String(error),
                                );
                            });
                        enrichmentTasks.push(task);
                    } else {
                        try {
                            dispatched += this.dispatcher.dispatch(event, 'sync', trace);
                        } catch (error) {
                            dispatchErrors += 1;
                            this.traceDispatchFailure(pkt, event, error);
                            this.log.error(
                                'dispatch error for %s event=%s: %s',
                                pkt.serviceCmd,
                                event.kind,
                                error instanceof Error
                                    ? (error.stack ?? error.message)
                                    : String(error),
                            );
                            break;
                        }
                    }
                }
            } catch (error) {
                parserErrors += 1;
                this.packetLog.trace(() => [
                    'packet_branch serviceCmd=%j seqId=%d parser=%d branch=parser_exception error=%j',
                    pkt.serviceCmd,
                    pkt.seqId,
                    parser,
                    error instanceof Error ? error.message : String(error),
                ]);
                this.log.error(
                    'handler error for %s: %s',
                    pkt.serviceCmd,
                    error instanceof Error ? (error.stack ?? error.message) : String(error),
                );
            }
        });

        const finish = (): void => {
            if (enrichmentFailures > 0 || dispatchErrors > 0) {
                this.packetLog.trace(() => [
                    'packet_terminal serviceCmd=%j seqId=%d outcome=failed reason=%s events=%d dispatched=%d parserErrors=%d dispatchErrors=%d elapsedMs=%d',
                    pkt.serviceCmd,
                    pkt.seqId,
                    enrichmentFailures > 0 ? 'enrichment_failed' : 'dispatch_exception',
                    eventCount,
                    dispatched,
                    parserErrors,
                    dispatchErrors,
                    Date.now() - startedAt,
                ]);
                return;
            }

            if (parserErrors > 0) {
                this.packetLog.trace(() => [
                    'packet_terminal serviceCmd=%j seqId=%d outcome=failed reason=parser_exception events=%d dispatched=%d parserErrors=%d elapsedMs=%d',
                    pkt.serviceCmd,
                    pkt.seqId,
                    eventCount,
                    dispatched,
                    parserErrors,
                    Date.now() - startedAt,
                ]);
                return;
            }

            if (dispatched > 0) {
                this.packetLog.trace(() => [
                    'packet_terminal serviceCmd=%j seqId=%d outcome=completed reason=dispatch_complete events=%d dispatched=%d parserErrors=%d elapsedMs=%d',
                    pkt.serviceCmd,
                    pkt.seqId,
                    eventCount,
                    dispatched,
                    parserErrors,
                    Date.now() - startedAt,
                ]);
                return;
            }

            this.packetLog.trace(() => [
                'packet_terminal serviceCmd=%j seqId=%d outcome=%s reason=%s events=%d dispatched=0 parserErrors=%d elapsedMs=%d',
                pkt.serviceCmd,
                pkt.seqId,
                parserErrors > 0 ? 'failed' : 'dropped',
                parserErrors > 0 ? 'parser_exception' : 'no_events',
                eventCount,
                parserErrors,
                Date.now() - startedAt,
            ]);
        };

        if (enrichmentTasks.length === 0) {
            finish();
            return Promise.resolve();
        }

        return Promise.all(enrichmentTasks).then(finish);
    }

    private traceEnrichmentStarted(
        pkt: PacketInfo,
        event: QQEventVariant,
        enrichment: 'identity_refresh' | 'group_invite',
    ): void {
        this.packetLog.trace(() => [
            'packet_branch serviceCmd=%j seqId=%d branch=enrichment_started eventKind=%j enrichment=%j',
            pkt.serviceCmd,
            pkt.seqId,
            event.kind,
            enrichment,
        ]);
    }

    private traceEnrichmentFailure(
        pkt: PacketInfo,
        event: QQEventVariant,
        enrichment: 'identity_refresh' | 'group_invite',
        error: unknown,
    ): void {
        this.packetLog.trace(() => [
            'packet_branch serviceCmd=%j seqId=%d branch=enrichment_failed eventKind=%j enrichment=%j error=%j',
            pkt.serviceCmd,
            pkt.seqId,
            event.kind,
            enrichment,
            error instanceof Error ? error.message : String(error),
        ]);
    }

    private traceDispatchFailure(pkt: PacketInfo, event: QQEventVariant, error: unknown): void {
        this.packetLog.trace(() => [
            'packet_branch serviceCmd=%j seqId=%d branch=dispatch_exception eventKind=%j error=%j',
            pkt.serviceCmd,
            pkt.seqId,
            event.kind,
            error instanceof Error ? error.message : String(error),
        ]);
    }

    private traceDispatch(
        pkt: PacketInfo,
        eventKind: QQEventVariant['kind'],
        mode: 'sync' | 'enriched' | 'derived',
    ): void {
        this.packetLog.trace(() => [
            'packet_branch serviceCmd=%j seqId=%d branch=dispatch eventKind=%j mode=%s',
            pkt.serviceCmd,
            pkt.seqId,
            eventKind,
            mode,
        ]);
    }

    private async dispatchAfterIdentityRefresh(
        pkt: PacketInfo,
        event: Extract<QQEventVariant, { kind: 'group_member_join' }>,
        trace: DispatchTrace,
    ): Promise<number> {
        try {
            await this.enricher.refreshMemberJoinIdentity(event);
        } catch (e) {
            this.packetLog.trace(() => [
                'packet_branch serviceCmd=%j seqId=%d branch=enrichment_degraded eventKind=%j enrichment="identity_refresh" error=%j',
                pkt.serviceCmd,
                pkt.seqId,
                event.kind,
                e instanceof Error ? e.message : String(e),
            ]);
            this.log.warn(
                'failed to resolve group member join identity: group=%d uid=%s err=%s',
                event.groupId,
                event.userUid ?? '',
                e instanceof Error ? e.message : String(e),
            );
        }

        try {
            return this.dispatcher.dispatch(event, 'enriched', trace);
        } catch (error) {
            throw new EnrichedDispatchError(error);
        }
    }

    private async dispatchGroupInvite(
        event: Extract<QQEventVariant, { kind: 'group_invite' }>,
        trace: DispatchTrace,
    ): Promise<number> {
        const mode = await this.enricher.resolveGroupInvite(event);

        if (!mode) {
            return 0;
        }

        try {
            return this.dispatcher.dispatch(event, mode, trace);
        } catch (error) {
            throw new EnrichedDispatchError(error);
        }
    }
}
