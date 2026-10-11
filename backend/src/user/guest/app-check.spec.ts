import { verifyAppCheckToken } from './app-check';

describe('verifyAppCheckToken', () => {
    const firebase = {
        verifyAppCheck: jest.fn(async (token: string) => {
            if (token === 'bad') throw new Error('invalid');
        }),
        verifyAppCheckConsuming: jest.fn(async (token: string) => {
            if (token === 'bad') throw new Error('invalid');
            return { alreadyConsumed: token === 'used' };
        }),
    };

    it('missing, invalid, replayed and verified', async () => {
        const options = { enforce: true, consume: true };
        expect(await verifyAppCheckToken(firebase, undefined, options)).toBe('missing');
        expect(await verifyAppCheckToken(firebase, 'bad', options)).toBe('invalid');
        expect(await verifyAppCheckToken(firebase, 'used', options)).toBe('replayed');
        expect(await verifyAppCheckToken(firebase, 'fresh', options)).toBe('verified');
    });

    it('consume: false never consumes (POST /user/guest/session keeps its behaviour)', async () => {
        firebase.verifyAppCheckConsuming.mockClear();
        expect(await verifyAppCheckToken(firebase, 'used', { enforce: false, consume: false })).toBe('verified');
        expect(firebase.verifyAppCheckConsuming).not.toHaveBeenCalled();
    });

    it('an adapter that cannot consume counts as invalid, never verified', async () => {
        expect(
            await verifyAppCheckToken({ verifyAppCheck: jest.fn() }, 'fresh', { enforce: true, consume: true })
        ).toBe('invalid');
    });
});
