import { describe, expect, it } from 'vitest';
import { NOWLUMA_ACTIONS, isKnownAction } from '../../sdk/src/actions.js';
import { ACTION_REGISTRY } from '../src/actions';

describe('SDK action catalog compatibility', () => {
    it('covers every executable name, including aliases and raw actions, exactly once', () => {
        const registered = ACTION_REGISTRY.executableNames.map(({ name }) => name);
        expect([...NOWLUMA_ACTIONS].sort()).toEqual(registered.sort());
        expect(new Set(NOWLUMA_ACTIONS).size).toBe(NOWLUMA_ACTIONS.length);

        for (const name of registered) {
            expect(isKnownAction(name), name).toBe(true);
        }
    });

    it.each(['', 'consumer_extension', 'SEND_GROUP_MSG', 'send_group_msg '])(
        'does not recognize unregistered name %j',
        (name) => {
            expect(isKnownAction(name)).toBe(false);
        },
    );
});
