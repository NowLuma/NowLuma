import type { PacketInfo } from '@nowluma/common/protocol-types';
import { BridgeEventBus } from '@nowluma/protocol/event-bus';
import type { QQEventVariant } from '@nowluma/protocol/events';
import { GroupInviteTracker } from '@nowluma/protocol/group-invite-tracker';
import { IdentityService } from '@nowluma/protocol/identity-service';
import { IncomingPacketPipeline } from '@nowluma/protocol/packet-pipeline';
import type { GroupMemberInfo, QQGroupInfo } from '@nowluma/protocol/qq-info';
import { afterEach, describe, expect, it, vi } from 'vitest';

const SELF_UIN = 10001;
const GROUP_ID = 123456789;
const MEMBER_UIN = 22222;
const MEMBER_UID = 'u_member';

afterEach(() => {
    vi.restoreAllMocks();
});

function member(card: string): GroupMemberInfo {
    return {
        uin: MEMBER_UIN,
        uid: MEMBER_UID,
        nickname: 'nick',
        card,
        role: 'member',
        level: 0,
        title: '',
        joinTime: 0,
        lastSentTime: 0,
        shutUpTime: 0,
    };
}

function group(card: string): QQGroupInfo {
    return {
        groupId: GROUP_ID,
        groupName: 'g',
        remark: '',
        memberCount: 1,
        memberMax: 500,
        members: new Map([[MEMBER_UIN, member(card)]]),
    };
}

function packet(serviceCmd = 'test.order'): PacketInfo {
    return {
        pid: 1,
        uin: String(SELF_UIN),
        serviceCmd,
        seqId: 1,
        retCode: 0,
        fromClient: false,
        body: new Uint8Array(),
    };
}

function groupMessage(card: string): QQEventVariant {
    return {
        kind: 'group_message',
        groupName: '',
        time: 1,
        selfUin: SELF_UIN,
        groupId: GROUP_ID,
        senderUin: MEMBER_UIN,
        senderNick: 'nick',
        senderCard: card,
        senderRole: 'member',
        msgSeq: 1,
        msgId: 1,
        elements: [],
    } as QQEventVariant;
}

function leave(): QQEventVariant {
    return {
        kind: 'group_member_leave',
        time: 1,
        selfUin: SELF_UIN,
        groupId: GROUP_ID,
        userUin: MEMBER_UIN,
        operatorUin: 0,
        userUid: MEMBER_UID,
        operatorUid: 'u_op',
        leaveType: 'leave',
    };
}

function makePipeline(
    opts: {
        fetchGroupMemberList?: (groupId: number) => Promise<void>;
    } = {},
) {
    const identity = IdentityService.memory(String(SELF_UIN));
    identity.rememberGroups([group('OldCard')]);
    const errors: unknown[] = [];
    const events = new BridgeEventBus({
        onError: (_kind, error) => {
            errors.push(error);
        },
    });
    const groupInvites = new GroupInviteTracker();
    const pipeline = new IncomingPacketPipeline({
        identity,
        events,
        fetchGroupList: vi.fn(async () => {}),
        fetchGroupMemberList: opts.fetchGroupMemberList ?? vi.fn(async () => {}),
        resolveGroupJoinRequest: vi.fn(async () => null),
        groupInvites,
    });
    const captured: QQEventVariant[] = [];
    events.onAny((event) => {
        captured.push(event as QQEventVariant);
    });
    return { identity, pipeline, events, captured, errors, groupInvites };
}

async function afterSideEffect(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe('IncomingPacketPipeline dispatch order', () => {
    it('runs side effects, the main event, then the card change with the pre-effect card', async () => {
        const { pipeline, identity, captured } = makePipeline();
        pipeline.registerCmd('test.order', () => [groupMessage('NewCard')]);

        await pipeline.process(packet());

        expect(captured.map((event) => event.kind)).toEqual(['group_message', 'group_card_change']);
        expect(captured[1]).toMatchObject({ cardOld: 'OldCard', cardNew: 'NewCard' });
        expect(identity.findGroupMember(GROUP_ID, MEMBER_UIN)?.card).toBe('NewCard');
    });

    it('emits the derived invitation after the friend_message that carried its card', async () => {
        const { pipeline, captured, groupInvites } = makePipeline();
        pipeline.registerCmd('test.order', () => [
            {
                kind: 'friend_message',
                time: 1,
                selfUin: SELF_UIN,
                senderUin: 20002,
                senderUid: 'u_inviter',
                senderNick: 'inviter',
                msgSeq: 1,
                msgId: 2,
                elements: [],
                inviteCardGroupUin: GROUP_ID,
                inviteCardSequence: 777,
            } as QQEventVariant,
        ]);

        await pipeline.process(packet());

        expect(captured.map((event) => event.kind)).toEqual(['friend_message', 'group_invite']);
        expect(captured[1]).toMatchObject({
            groupId: GROUP_ID,
            fromUin: 20002,
            flag: `slreq:1:777:${GROUP_ID}:2:0`,
        });
        // The card is registered, so a later notice cannot dispatch the invitation again.
        expect(groupInvites.receiveNotice(GROUP_ID, 'u_inviter')).toBe(false);
    });
});

describe('IncomingPacketPipeline roster refresh in-flight state', () => {
    it('coalesces one fetch per group and refreshes again after the first completes', async () => {
        const fetchGroupMemberList = vi.fn(async () => {});
        const { pipeline } = makePipeline({ fetchGroupMemberList });
        pipeline.registerCmd('test.order', () => [leave()]);

        await pipeline.process(packet());
        await afterSideEffect();
        expect(fetchGroupMemberList).toHaveBeenCalledOnce();

        await pipeline.process(packet());
        await afterSideEffect();
        expect(fetchGroupMemberList).toHaveBeenCalledTimes(2);
    });

    it('clears the in-flight slot after a failed fetch so the next event retries', async () => {
        let attempts = 0;
        const fetchGroupMemberList = vi.fn(async () => {
            attempts += 1;

            if (attempts === 1) {
                throw new Error('net down');
            }
        });
        const { pipeline } = makePipeline({ fetchGroupMemberList });
        pipeline.registerCmd('test.order', () => [leave()]);

        await pipeline.process(packet());
        await afterSideEffect();
        expect(fetchGroupMemberList).toHaveBeenCalledOnce();

        await pipeline.process(packet());
        await afterSideEffect();
        expect(fetchGroupMemberList).toHaveBeenCalledTimes(2);
    });
});

describe('IncomingPacketPipeline listener isolation', () => {
    it('keeps a throwing subscriber from blocking dispatch or derived events', async () => {
        const { pipeline, events, captured, errors } = makePipeline();
        events.on('group_message', () => {
            throw new Error('listener boom');
        });
        pipeline.registerCmd('test.order', () => [groupMessage('NewCard')]);

        await pipeline.process(packet());

        expect(captured.map((event) => event.kind)).toEqual(['group_message', 'group_card_change']);
        await vi.waitFor(() => expect(errors).toHaveLength(1));
    });
});
