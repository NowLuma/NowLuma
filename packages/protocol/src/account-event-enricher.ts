import type { Logger } from '@nowluma/common/logger';
import type { DispatchMode } from './account-event-dispatcher';
import { isSelfIdentity } from './account-event-dispatcher';
import type { GroupInviteEvent, GroupMemberJoin, QQEventVariant } from './events';
import type { GroupInviteTracker } from './group-invite-tracker';
import type { IdentityService } from './identity-service';
import { formatGroupRequestFlag, isSelfGroupInvitation, type GroupRequestInfo } from './qq-info';

type GroupMemberIdentityEvent = Extract<
    QQEventVariant,
    { kind: 'group_member_join' | 'group_member_leave' }
>;

export interface AccountEventEnricherDeps {
    identity: IdentityService;
    groupInvites: GroupInviteTracker;
    /** Resolve a pending request's comment and approval tuple after a push. */
    resolveGroupJoinRequest(
        groupId: number,
        uid: string,
        subType: 'add' | 'invite',
        invitedUid?: string,
    ): Promise<GroupRequestInfo | null>;
    /** Bridge-scope logger (account-bound) for enrichment warnings. */
    log: Logger;
}

/**
 * Resolves the identities a push omits before its event becomes observable:
 * the joiner/inviter UINs of a group_member_join and the requester, comment and
 * approval tuple of a group request. Mutates the event in place; the caller
 * still owns dispatch and error classification.
 */
export class AccountEventEnricher {
    constructor(private readonly deps: AccountEventEnricherDeps) {}

    needsIdentityRefresh(
        event: QQEventVariant,
    ): event is Extract<QQEventVariant, { kind: 'group_member_join' }> {
        return (
            event.kind === 'group_member_join' &&
            event.groupId > 0 &&
            ((event.userUin <= 0 && Boolean(event.userUid)) ||
                ((event.invitorUin ?? 0) <= 0 && Boolean(event.invitorUid)))
        );
    }

    async refreshMemberJoinIdentity(event: GroupMemberJoin): Promise<void> {
        this.resolveMemberIdentityFromCache(event);

        const results = await Promise.allSettled(
            (
                [
                    ['userUid', 'userUin'],
                    ['invitorUid', 'invitorUin'],
                ] as const
            ).map(async ([uidKey, uinKey]) => {
                const uid = event[uidKey];

                if (!uid || (event[uinKey] ?? 0) > 0) {
                    return;
                }

                const uin = await this.deps.identity.resolveUin(uid, event.groupId);

                if (uin !== null) {
                    event[uinKey] = uin;
                } else {
                    this.deps.log.warn(
                        'group join identity unavailable: group=%d role=%s',
                        event.groupId,
                        uidKey,
                    );
                }
            }),
        );

        this.resolveMemberIdentityFromCache(event);
        const failures = results.filter((result) => result.status === 'rejected');

        if (failures.length) {
            throw new AggregateError(
                failures.map((result) => result.reason),
                `group join identity lookup failed: ${failures
                    .map(({ reason }) =>
                        reason instanceof Error ? reason.message : String(reason),
                    )
                    .join('; ')}`,
            );
        }
    }

    /**
     * Returns the dispatch mode the request event needs, or null when it must not
     * be emitted (self-invite already delivered from its card, missing request).
     */
    async resolveGroupInvite(event: GroupInviteEvent): Promise<DispatchMode | null> {
        // A self-invite notice carries an inviter UID but no approval sequence.
        if (
            event.subType === 'invite' &&
            isSelfIdentity(this.deps.identity, event.invitedUin ?? 0, event.invitedUid)
        ) {
            if (!(event.groupId > 0) || !event.fromUid?.trim() || !event.flag) {
                this.deps.log.warn(
                    'self invitation missing group or inviter: group=%d',
                    event.groupId,
                );
                return null;
            }

            if (!this.deps.groupInvites.receiveNotice(event.groupId, event.fromUid)) {
                this.deps.log.debug(
                    'self invitation already dispatched from the card: group=%d',
                    event.groupId,
                );
                return null;
            }

            if (!event.fromUin) {
                event.fromUin =
                    (await this.deps.identity.resolveUin(event.fromUid, event.groupId)) ?? 0;

                if (!event.fromUin) {
                    this.deps.log.warn(
                        'self invitation sender unavailable: group=%d uid=%s',
                        event.groupId,
                        event.fromUid,
                    );
                }
            }

            return 'sync';
        }

        const uid = event.fromUid;

        if (!uid) {
            throw new Error('group request omitted requester UID');
        }

        this.deps.identity.rememberRequestIdentity({
            groupId: event.groupId,
            uid,
            uin: event.fromUin,
            source: 'group_request',
        });
        const request = await this.deps.resolveGroupJoinRequest(
            event.groupId,
            uid,
            event.subType,
            event.invitedUid,
        );

        if (!request) {
            this.deps.log.warn(
                'pending group request not found: group=%d uid=%s',
                event.groupId,
                uid,
            );
            return null;
        }

        if (isSelfGroupInvitation(request)) {
            return null;
        }

        event.message = request.comment;
        event.flag = formatGroupRequestFlag(request);
        const requesterUin = event.subType === 'invite' ? request.invitorUin : request.targetUin;
        event.fromUin =
            event.fromUin ||
            requesterUin ||
            (await this.deps.identity.resolveUin(uid, event.groupId)) ||
            0;

        if (event.fromUin === 0) {
            this.deps.log.warn(
                'group request sender unavailable: group=%d uid=%s',
                event.groupId,
                uid,
            );
        }

        if (event.subType === 'invite') {
            event.invitedUid = request.targetUid;
            event.invitedUin =
                request.targetUin ||
                (await this.deps.identity.resolveUin(request.targetUid, event.groupId)) ||
                0;
        }

        return 'enriched';
    }

    private resolveMemberIdentityFromCache(event: GroupMemberIdentityEvent): void {
        if (event.groupId <= 0) {
            return;
        }

        if (event.userUin <= 0 && event.userUid) {
            const uin = this.deps.identity.findUinByUid(event.userUid, event.groupId);

            if (uin !== null) {
                event.userUin = uin;
            }
        }

        if (event.operatorUin <= 0 && event.operatorUid) {
            const uin = this.deps.identity.findUinByUid(event.operatorUid, event.groupId);

            if (uin !== null) {
                event.operatorUin = uin;
            }
        }

        if (
            event.kind === 'group_member_join' &&
            (event.invitorUin ?? 0) <= 0 &&
            event.invitorUid
        ) {
            const uin = this.deps.identity.findUinByUid(event.invitorUid, event.groupId);

            if (uin !== null) {
                event.invitorUin = uin;
            }
        }
    }
}
