import type { Logger } from '@nowluma/common/logger';
import type { BridgeEventBus } from './event-bus';
import type { QQEventVariant } from './events';
import { formatEvent } from './format';
import type { GroupInviteTracker } from './group-invite-tracker';
import type { IdentityService } from './identity-service';
import { formatGroupRequestFlag } from './qq-info';

// Notice kinds that get logged as a warning (operationally important
// state changes that an operator probably wants to see at default
// info level). Everything else falls through to info.
const WARN_EVENT_KINDS = new Set([
    'group_recall',
    'friend_recall',
    'group_member_leave',
    'group_mute',
    'friend_request',
    'group_invite',
]);

export type DispatchMode = 'sync' | 'enriched';

/** One packet's TRACE sink, owned by the pipeline that is processing it. */
export type DispatchTrace = (kind: QQEventVariant['kind'], mode: DispatchMode | 'derived') => void;

export interface AccountEventDispatcherDeps {
    identity: IdentityService;
    events: BridgeEventBus;
    groupInvites: GroupInviteTracker;
    /** Account group-list fetch. Roster side-effect only; failures are
     *  swallowed and the returned roster is not read. */
    fetchGroupList(): Promise<void>;
    /** One group's member-list fetch (adapter TTL applies). Roster
     *  side-effect only; `force` is never passed. */
    fetchGroupMemberList(groupId: number): Promise<void>;
    /** Bridge-scope logger (account-bound) for side-effect warnings. */
    log: Logger;
    /** Event-scope logger (account-bound) for the notice line. */
    eventLog: Logger;
}

export function isSelfIdentity(identity: IdentityService, uin: number, uid?: string): boolean {
    const selfUin = Number(identity.uin);
    return (uin > 0 && uin === selfUin) || (Boolean(uid) && uid === identity.selfUid);
}

/**
 * Turns one decoded event into its side effects, notice log line, bus emission
 * and derived events, in that order. Owns the account's roster-refresh tasks so
 * a burst of joins/leaves for one group coalesces into a single fetch.
 */
export class AccountEventDispatcher {
    private readonly memberRefreshTasks_ = new Map<number, Promise<void>>();

    constructor(private readonly deps: AccountEventDispatcherDeps) {}

    dispatch(event: QQEventVariant, mode: DispatchMode, trace: DispatchTrace): number {
        // Snapshot the sender's cached group card BEFORE dispatch — the side-effects
        // inside finishDispatch self-heal it, so the old value must be read first.
        const cardBefore = this.groupCardBefore(event);
        this.finishDispatch(event);
        trace(event.kind, mode);

        let dispatched = 1;

        if (this.emitGroupCardChange(event, cardBefore)) {
            trace('group_card_change', 'derived');
            dispatched++;
        }

        if (this.emitGroupInviteCard(event)) {
            trace('group_invite', 'derived');
            dispatched++;
        }

        return dispatched;
    }

    private emitGroupInviteCard(event: QQEventVariant): boolean {
        if (event.kind !== 'friend_message' || event.senderUin === event.selfUin) {
            return false;
        }

        const groupId = event.inviteCardGroupUin;
        const sequence = event.inviteCardSequence;

        if (
            !groupId ||
            !sequence ||
            !this.deps.groupInvites.receiveCard(groupId, sequence, event.senderUid)
        ) {
            return false;
        }

        this.finishDispatch({
            kind: 'group_invite',
            time: event.time,
            selfUin: event.selfUin,
            groupId,
            fromUin: event.senderUin,
            fromUid: event.senderUid,
            invitedUin: event.selfUin,
            subType: 'invite',
            message: '',
            flag: formatGroupRequestFlag({ groupId, sequence, eventType: 2, filtered: false }),
        });
        return true;
    }

    private emit(event: QQEventVariant): void {
        // Fire-and-forget: errors inside subscribers are surfaced via the bus's
        // own onError hook so one bad listener never blocks the others.
        void this.deps.events.emit(event);
    }

    /** The sender's cached group card just before this event is dispatched (its
     *  side-effects will overwrite the cache). Only meaningful for group_message. */
    private groupCardBefore(event: QQEventVariant): string | undefined {
        if (event.kind !== 'group_message') {
            return undefined;
        }

        return this.deps.identity.findGroupMember(event.groupId, event.senderUin)?.card;
    }

    /** Surface a `group_card_change` when a KNOWN member's card actually changed —
     *  mirrors NapCat's `parseCardChangedEvent`. Requires a non-empty prior card
     *  (`cardBefore`) that differs from a non-empty new one, so a cold/unknown
     *  cache never fabricates a change on first contact. */
    private emitGroupCardChange(event: QQEventVariant, cardBefore: string | undefined): boolean {
        if (event.kind !== 'group_message') {
            return false;
        }

        const cardNew = event.senderCard ?? '';

        if (!cardBefore || !cardNew || cardBefore === cardNew) {
            return false;
        }

        this.finishDispatch({
            kind: 'group_card_change',
            time: event.time,
            selfUin: event.selfUin,
            groupId: event.groupId,
            userUin: event.senderUin,
            cardNew,
            cardOld: cardBefore,
        });
        return true;
    }

    /**
     * Common dispatch tail shared by the sync path and the two async enrichment
     * paths: run side effects, log the event, then emit it.
     */
    private finishDispatch(event: QQEventVariant): void {
        this.handleSideEffects(event);
        printEvent(this.deps.eventLog, this.deps.identity, event);
        this.emit(event);
    }

    private handleSideEffects(event: QQEventVariant): void {
        this.rememberEventIdentity(event);

        let groupId = 0;
        let reason = '';
        let refreshGroupList = false;

        switch (event.kind) {
            case 'group_member_join':
                groupId = event.groupId;
                reason = 'group_member_join';
                refreshGroupList = isSelfIdentity(this.deps.identity, event.userUin, event.userUid);
                break;
            case 'group_member_leave':
                groupId = event.groupId;
                reason = 'group_member_leave';
                break;
            case 'group_admin':
                groupId = event.groupId;
                reason = 'group_admin';
                break;
            default:
                return;
        }

        if (groupId <= 0) {
            return;
        }

        if (this.memberRefreshTasks_.has(groupId)) {
            return;
        }

        if (event.kind === 'group_member_join' && !this.deps.identity.findGroup(groupId)) {
            refreshGroupList = true;
        }

        const task = (async () => {
            try {
                if (refreshGroupList) {
                    try {
                        await this.deps.fetchGroupList();
                    } catch {
                        /* ignore */
                    }
                }

                if (!this.deps.identity.findGroup(groupId)) {
                    this.deps.log.debug(
                        'member cache refreshed: group=%d reason=%s',
                        groupId,
                        reason,
                    );
                    return;
                }

                await this.deps.fetchGroupMemberList(groupId);
                this.deps.log.debug('member cache refreshed: group=%d reason=%s', groupId, reason);
            } catch (e) {
                this.deps.log.warn(
                    'failed to refresh member cache: group=%d reason=%s err=%s',
                    groupId,
                    reason,
                    e instanceof Error ? e.message : String(e),
                );
            } finally {
                this.memberRefreshTasks_.delete(groupId);
            }
        })();

        this.memberRefreshTasks_.set(groupId, task);
    }

    private rememberEventIdentity(event: QQEventVariant): void {
        switch (event.kind) {
            case 'friend_message':
                // The message already carries the authoritative UID/UIN pair. Keep it
                // at the receive boundary so later C2C operations never have to infer
                // a peer UID from a stale message row or a fallible profile lookup.
                this.deps.identity.rememberRequestIdentity({
                    uid: event.senderUid,
                    uin: event.senderUin,
                    source: 'friend_message',
                });

                break;

            case 'group_message': {
                // [#1] Self-heal a member's cached group card from message traffic. The
                // member cache only refreshes via a member-list refetch, which nothing
                // triggers on a card change and a quiet, months-long bot may never fire.
                // The decoder resolved the current card from field 4 into senderCard;
                // when it differs from the cache, update it — gated so we write only on
                // an actual change, not on every message.
                const cached = this.deps.identity.findGroupMember(event.groupId, event.senderUin);

                if (cached && event.senderCard !== (cached.card ?? '')) {
                    this.deps.identity.updateGroupMember(event.groupId, {
                        ...cached,
                        card: event.senderCard,
                    });
                }

                break;
            }

            case 'group_member_join':
                if (event.invitorUid) {
                    this.deps.identity.rememberRequestIdentity({
                        groupId: event.groupId,
                        uid: event.invitorUid,
                        uin: event.invitorUin ?? 0,
                        source: 'group_request',
                    });
                }

                this.deps.identity.rememberGroupMemberIdentity(event.groupId, {
                    uid: event.userUid,
                    uin: event.userUin,
                });
                this.deps.identity.rememberGroupMemberIdentity(event.groupId, {
                    uid: event.operatorUid,
                    uin: event.operatorUin,
                });
                this.deps.identity.rememberGroupMemberJoined(event.groupId, {
                    uid: event.userUid,
                    uin: event.userUin,
                });
                break;
            case 'group_member_leave':
                this.deps.identity.markGroupMemberInactive(event.groupId, {
                    uid: event.userUid,
                    uin: event.userUin,
                });
                this.deps.identity.rememberGroupMemberIdentity(event.groupId, {
                    uid: event.operatorUid,
                    uin: event.operatorUin,
                });
                break;

            case 'group_admin': {
                this.deps.identity.rememberGroupMemberIdentity(event.groupId, {
                    uin: event.userUin,
                });
                // #93: get_group_member_info serves the cache and must not refetch
                // per message. Patch a known member's role here — never invent a
                // phantom, never downgrade the owner.
                const cached = this.deps.identity.findGroupMember(event.groupId, event.userUin);

                if (cached && cached.role !== 'owner') {
                    this.deps.identity.updateGroupMember(event.groupId, {
                        ...cached,
                        role: event.set ? 'admin' : 'member',
                    });
                }

                break;
            }

            case 'friend_request':
                this.deps.identity.rememberRequestIdentity({
                    uid: event.fromUid,
                    uin: event.fromUin,
                    source: 'friend_request',
                });
                break;

            case 'friend_remark_changed': {
                const rosterUpdated = this.deps.identity.updateFriendRemark(
                    event.userUid,
                    event.userUin,
                    event.remark,
                );
                this.deps.log.debug(
                    'friend remark synchronized (uid=%s uin=%d length=%d rosterUpdated=%s)',
                    event.userUid,
                    event.userUin,
                    event.remark.length,
                    rosterUpdated,
                );
                break;
            }

            case 'group_invite': {
                this.deps.identity.rememberRequestIdentity({
                    groupId: event.groupId,
                    uid: event.fromUid,
                    uin: event.fromUin,
                    source: 'group_request',
                });

                if (event.invitedUid) {
                    this.deps.identity.rememberRequestIdentity({
                        groupId: event.groupId,
                        uid: event.invitedUid,
                        uin: event.invitedUin ?? 0,
                        source: 'group_request',
                    });
                }

                break;
            }

            default:
                break;
        }
    }
}

function printEvent(log: Logger, identity: IdentityService, event: QQEventVariant): void {
    // Message-class events (group/friend/temp message) get rendered by the
    // OneBot layer's logReceivedMessage — its output already includes the
    // assigned message ID, which the raw packet doesn't have. Returning
    // null here is the formatter's signal to skip.
    const message = formatEvent(identity, event);

    if (!message) {
        return;
    }

    if (WARN_EVENT_KINDS.has(event.kind)) {
        log.warn('%s', message);
    } else {
        log.info('%s', message);
    }
}
