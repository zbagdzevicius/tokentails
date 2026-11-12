import { HttpException } from '@nestjs/common';
import { Types } from 'mongoose';
import { MemoryModel } from 'src/user/guest/memory-model.helper-spec';
import { OrderStatus } from 'src/shared-contracts/enums';
import { isPawlegendsContext, PawlegendsCheckoutGuard } from './pawlegends-checkout-guard.service';
import { buildHarness, DEVICE } from './pawlegends-harness.helper-spec';
import { PAWLEGENDS_TERMS_VERSION } from './pawlegends.contracts';

/*
 * The Pawlegends guardrails on the Token Tails $5 cat checkout (`context: 'pawlegends'`): the current consent
 * version is required, the age band is optional (unknown = the 16-17 cap),
 * under 16 cannot buy (and a later 18+ does not unlock it), and the band's 30-day cap counts the account's
 * completed Token Tails orders plus Pawlegends purchases.
 */

const USER = new Types.ObjectId().toString();
/** The consent the cat sheet's tick sends. */
const C = { consentVersion: PAWLEGENDS_TERMS_VERSION };

function setup() {
    const h = buildHarness();
    const orders = new MemoryModel([], [], () => h.clock.now);
    const guard = new PawlegendsCheckoutGuard(h.stripe, orders as any);
    guard.now = () => h.clock.now;
    return { h, orders, guard };
}

const codeOf = async (promise: Promise<unknown>) => {
    try {
        await promise;
        return null;
    } catch (error) {
        return error instanceof HttpException ? (error.getResponse() as any).code : 'other';
    }
};

describe('PawlegendsCheckoutGuard', () => {
    it('only a pawlegends context asks for the checks', () => {
        expect(isPawlegendsContext({ context: 'pawlegends' })).toBe(true);
        expect(isPawlegendsContext({ context: 'other' })).toBe(false);
        expect(isPawlegendsContext(undefined)).toBe(false);
    });

    it('requires the current consent version (U5), before anything is stored', async () => {
        const { h, guard } = setup();
        const remember = jest.spyOn(h.stripe, 'rememberBand');
        for (const consentVersion of [undefined, '', '2026-10-17', 'yes']) {
            expect(
                await codeOf(
                    guard.assert({ userId: USER, cents: 500, ageBand: '18+', deviceId: DEVICE, consentVersion })
                )
            ).toBe('PAWLEGENDS_INVALID');
        }
        expect(remember).not.toHaveBeenCalled();
    });

    it('no age band (the sheets no longer ask): the 16-17 cap applies, nothing is stored, never blocked', async () => {
        const { h, guard } = setup();
        const remember = jest.spyOn(h.stripe, 'rememberBand');
        const ok = await guard.assert({ ...C, userId: USER, cents: 500, context: 'pawlegends', deviceId: DEVICE });
        expect(ok.band).toBe('16-17');
        expect(ok.capLeftCents).toBe(3000 - 500);
        expect(remember).not.toHaveBeenCalled();
        expect(await codeOf(guard.assert({ ...C, userId: USER, cents: 3500, deviceId: DEVICE }))).toBe(
            'PAWLEGENDS_SPEND_CAP'
        );
        expect(await codeOf(guard.assert({ ...C, userId: USER, cents: 500, ageBand: 'adult' as any }))).toBe(
            'PAWLEGENDS_INVALID'
        );
    });

    it('no age band: a stored 18+ answer still gives the 18+ cap', async () => {
        const { guard } = setup();
        await guard.assert({ ...C, userId: USER, cents: 500, ageBand: '18+', deviceId: DEVICE });
        const ok = await guard.assert({ ...C, userId: USER, cents: 500, deviceId: DEVICE });
        expect(ok.band).toBe('18+');
    });

    it('refuses under 16, and a later 18+ from the same account does not unlock it', async () => {
        const { guard } = setup();
        expect(
            await codeOf(guard.assert({ ...C, userId: USER, cents: 500, ageBand: 'under16', deviceId: DEVICE }))
        ).toBe('PAWLEGENDS_UNDER_16');
        expect(
            await codeOf(guard.assert({ ...C, userId: USER, cents: 500, ageBand: '18+', deviceId: 'device-cccccccc' }))
        ).toBe('PAWLEGENDS_UNDER_16');
    });

    it('16-17 has a €30 cap over 30 days that counts completed Token Tails orders', async () => {
        const { h, orders, guard } = setup();
        const user = new Types.ObjectId(USER);
        await orders.create({ user, status: OrderStatus.COMPLETE, priceUsd: 25, price: 25 });
        await orders.create({ user, status: 'FAILED_GRANT', priceUsd: 100, price: 100 });
        const ok = await guard.assert({ ...C, userId: USER, cents: 500, ageBand: '16-17', deviceId: DEVICE });
        expect(ok).toEqual({
            band: '16-17',
            capLeftCents: 0,
            consent: { version: PAWLEGENDS_TERMS_VERSION, at: h.clock.now.toISOString() },
        });
        await orders.create({ user, status: OrderStatus.COMPLETE, priceUsd: 5, price: 5 });
        expect(await codeOf(guard.assert({ ...C, userId: USER, cents: 500, ageBand: '16-17', deviceId: DEVICE }))).toBe(
            'PAWLEGENDS_SPEND_CAP'
        );
        // Older than 30 days no longer counts.
        h.clock.now = new Date(h.clock.now.getTime() + 31 * 24 * 60 * 60 * 1000);
        expect((await guard.assert({ ...C, userId: USER, cents: 500, ageBand: '16-17', deviceId: DEVICE })).band).toBe(
            '16-17'
        );
    });

    it('18+ has a €200 cap', async () => {
        const { orders, guard } = setup();
        await orders.create({
            user: new Types.ObjectId(USER),
            status: OrderStatus.COMPLETE,
            priceUsd: 199,
            price: 199,
        });
        expect(await codeOf(guard.assert({ ...C, userId: USER, cents: 500, ageBand: '18+' }))).toBe(
            'PAWLEGENDS_SPEND_CAP'
        );
    });
});
