import { PACK_SHELTER_IDS } from 'src/blessing/featured-shelters';
import { shelterSplitInterface } from 'src/shelter/onchain/shelter-chain';
import { CHAINS } from 'src/shelter/onchain/wallet.config';
import { ENV_MAINNET_KEEPER, ENV_ON, expectRaveError, raveHarness, T0 } from './rave.harness-spec';
import { raveDefaultNames } from './rave-names';
import { isRaveAmount, publicOrder, raveMemo, raveMemo32, RAVE_SYSTEM_USER, usdcPaidToShelters } from './rave.service';

/*
 * Moon Rave checkout (cat-rave/CHECKOUT-SPEC.md): amounts, fee, names, X handle, the one paid transition,
 * the keeper row (full donation, rave memo, once), test-mode safety, refunds, review holds, the public list.
 * Stripe TEST semantics only; Stripe, Mongo and the chain are in-memory fakes.
 */

const card = (extra: Record<string, unknown> = {}) => ({ cats: 5, method: 'card', coverFee: true, ...extra });

describe('RaveService status', () => {
    it('is disabled by default and says nothing else', async () => {
        const { service } = raveHarness({});
        expect(await service.status(T0)).toEqual({ enabled: false, reason: 'off' });
    });

    it('names what is missing: Stripe, the keeper, or a key/chain mode mismatch', async () => {
        const cases: [NodeJS.ProcessEnv, string][] = [
            [{ ...ENV_ON, RAVE_STRIPE_WEBHOOK_SECRET: '' }, 'stripe'],
            [{ ...ENV_ON, STRIPE_PUBLISHABLE_KEY: '' }, 'stripe'],
            [{ ...ENV_ON, CRYPTO_PAY_SHELTER_SHARE_ENABLED: '' }, 'keeper'],
            [{ ...ENV_ON, SHELTER_DONATE_PRIVATE_KEY: '' }, 'keeper'],
            // A test key against a mainnet keeper would pay real money for test payments.
            [ENV_MAINNET_KEEPER, 'mode'],
            [{ ...ENV_ON, STRIPE_PUBLISHABLE_KEY: 'pk_live_x' }, 'mode'],
            // A live key outside production, even against a mainnet keeper.
            [{ ...ENV_MAINNET_KEEPER, STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_PUBLISHABLE_KEY: 'pk_live_x' }, 'mode'],
        ];
        for (const [env, reason] of cases) {
            const { service } = raveHarness(env);
            expect(await service.status(T0)).toEqual({ enabled: false, reason });
        }
    });

    it('returns the publishable key, prices, fee and USDC off when enabled; never a secret', async () => {
        const { service } = raveHarness();
        const status = await service.status(T0);
        expect(status).toEqual({
            enabled: true,
            livemode: false,
            publishableKey: 'pk_test_rave_fake',
            card: true,
            usdc: { enabled: false, chains: [] },
            prices: { fixed: [1, 5], customMin: 10, max: 100 },
            fee: { percentBps: 290, fixedCents: 30 },
            payoutsDelayed: false,
        });
        expect(JSON.stringify(status)).not.toMatch(/sk_test|whsec/);
    });

    it('lists USDC chains only where public giving is verified (testnets of the keeper class)', async () => {
        const h = raveHarness({ ...ENV_ON, RAVE_USDC_ENABLED: 'true' });
        const status = await h.service.status(T0);
        const testnetSplits = Object.values(CHAINS)
            .filter(c => c.split && c.network === 'testnet' && !/^EUR/i.test(c.split.token.symbol))
            .map(c => c.chainId);
        expect(status.usdc!.enabled).toBe(true);
        for (const id of status.usdc!.chains) expect(testnetSplits).toContain(id);
        expect(status.usdc!.chains).not.toContain(5042);
    });
});

describe('RaveService checkout', () => {
    it('is 404 while the flag is off and 503 when on but not ready', async () => {
        await expectRaveError(raveHarness({}).service.checkout(card(), T0), 404, 'RAVE_NOT_FOUND');
        await expectRaveError(
            raveHarness({ ...ENV_ON, CRYPTO_PAY_SHELTER_SHARE_ENABLED: '' }).service.checkout(card(), T0),
            503,
            'RAVE_OFF'
        );
    });

    it('accepts $1, $5 and whole amounts from $10; refuses 2..9, fractions, strings and out of range', async () => {
        for (const cats of [1, 5, 10, 11, 99, 100]) {
            const { service } = raveHarness();
            const res = await service.checkout(card({ cats }), T0);
            expect(res.cats).toBe(cats);
            expect(res.donationCents).toBe(cats * 100);
        }
        const { service } = raveHarness();
        for (const cats of [2, 3, 4, 6, 7, 8, 9, 0, -1, 1.5, 10.5, '5', null, undefined, NaN, Infinity, 501]) {
            await expectRaveError(service.checkout(card({ cats }), T0), 400, 'RAVE_AMOUNT');
        }
        expect(isRaveAmount(500, 500)).toBe(true);
        expect(isRaveAmount(501, 500)).toBe(false);
    });

    it('creates the card order and a PaymentIntent with the covered fee and no names or handle in metadata', async () => {
        const h = raveHarness();
        const res = await h.service.checkout(
            card({ names: ['Mochi', '', 'Disco Paws'], x: 'https://x.com/SomeOne', clientKey: '8f6c1c0e-aaaa-bbbb' }),
            T0
        );
        const defaults = raveDefaultNames(res.orderId, 5);
        expect(res).toEqual({
            orderId: expect.stringMatching(/^rv_[0-9a-f]{16}$/),
            clientSecret: 'pi_test_1_secret_fake',
            amountCents: 546,
            donationCents: 500,
            feeCents: 46,
            cats: 5,
            names: ['Mochi', defaults[1], 'Disco Paws', defaults[3], defaults[4]],
            x: 'SomeOne',
            status: 'created',
        });
        const [params, opts] = h.stripe.paymentIntents.create.mock.calls[0] as unknown as [any, any];
        expect(opts).toEqual({ idempotencyKey: `rave:${res.orderId}` });
        expect(params).toMatchObject({
            amount: 546,
            currency: 'usd',
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
            statement_descriptor_suffix: 'MOON RAVE',
        });
        expect(params.metadata).toEqual({
            rave: '1',
            orderId: res.orderId,
            cats: '5',
            donationCents: '500',
            feeCents: '46',
        });
        const stored = h.orders.rows[0];
        expect(stored).toMatchObject({ status: 'created', xHandle: 'SomeOne', xHandleLower: 'someone' });
        expect(stored.paymentIntentId).toBe('pi_test_1');
        expect(stored.expireAt.getTime()).toBe(T0.getTime() + 24 * 3600 * 1000);
    });

    it('charges the donation only when the buyer unticks the fee', async () => {
        const res = await raveHarness().service.checkout(card({ coverFee: false }), T0);
        expect(res).toMatchObject({ amountCents: 500, feeCents: 0, donationCents: 500 });
    });

    it('returns the same order for the same clientKey and body, 409 for another body', async () => {
        const h = raveHarness();
        const body = card({ names: ['Mochi'], clientKey: '11111111-2222-3333' });
        const a = await h.service.checkout(body, T0);
        const b = await h.service.checkout({ ...body }, T0);
        expect(b.orderId).toBe(a.orderId);
        expect(b.clientSecret).toBe(a.clientSecret);
        expect(h.stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
        expect(h.orders.rows).toHaveLength(1);
        await expectRaveError(h.service.checkout({ ...body, cats: 10 }, T0), 409, 'RAVE_KEY_REUSED');
    });

    it('refuses bad names field by field and bad X handles, server side', async () => {
        const h = raveHarness();
        const res = await expectRaveError(
            h.service.checkout(card({ names: ['Luna', 'Fuck', 'http://x.y'] }), T0),
            400,
            'RAVE_NAME'
        );
        expect(res.fields).toEqual([
            { index: 1, code: 'NAME_BLOCKED' },
            { index: 2, code: 'NAME_CHARS' },
        ]);
        for (const x of [
            'https://evil.com/someone',
            'https://x.com/someone/status/1',
            '<script>alert(1)</script>',
            'a'.repeat(16),
        ]) {
            const err = await expectRaveError(h.service.checkout(card({ x }), T0), 400, 'RAVE_X_HANDLE');
            expect(err.fieldCode).toBe('X_HANDLE_INVALID');
        }
        const blocked = await expectRaveError(h.service.checkout(card({ x: '@fuck' }), T0), 400, 'RAVE_X_HANDLE');
        expect(blocked.fieldCode).toBe('X_HANDLE_BLOCKED');
        await expectRaveError(
            h.service.checkout(card({ names: ['a', 'b', 'c', 'd', 'e', 'f'] }), T0),
            400,
            'RAVE_INVALID'
        );
        expect(h.orders.rows).toHaveLength(0);
        expect(h.stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('refuses the USDC tab while RAVE_USDC_ENABLED is off', async () => {
        await expectRaveError(raveHarness().service.checkout(card({ method: 'usdc' }), T0), 400, 'RAVE_METHOD');
    });

    it('answers a USDC order with the rave memo and the 6-decimal amount, no Stripe call', async () => {
        const h = raveHarness({ ...ENV_ON, RAVE_USDC_ENABLED: 'true' });
        const res = await h.service.checkout({ cats: 10, method: 'usdc', coverFee: true }, T0);
        expect(res).toMatchObject({ clientSecret: null, feeCents: 0, amountCents: 1000, donationCents: 1000 });
        expect(res.memo).toBe(`tt:rave:${res.orderId.slice(3)}`);
        expect(res.usdc!.amountUnits6).toBe('10000000');
        expect(h.stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('enforces the daily cap and the unpaid-orders brake', async () => {
        const capped = raveHarness({ ...ENV_ON, RAVE_DAILY_CAP_USD: '6' });
        const payNow = async (cats: number) => {
            const res = await capped.service.checkout(card({ cats }), T0);
            const id = capped.orders.rows.find((o: any) => o.orderId === res.orderId).paymentIntentId;
            await capped.service.markPaid(capped.pay(id), T0);
        };
        await payNow(5);
        await expectRaveError(capped.service.checkout(card({ cats: 5 }), T0), 503, 'RAVE_CAP');
        await payNow(1);
        expect(await capped.service.status(T0)).toEqual({ enabled: false, reason: 'cap' });
        // The next UTC day starts empty.
        const tomorrow = new Date(T0.getTime() + 24 * 3600 * 1000);
        expect((await capped.service.status(tomorrow)).enabled).toBe(true);

        const braked = raveHarness({ ...ENV_ON, RAVE_CREATED_PER_HOUR: '2' });
        await braked.service.checkout(card({ cats: 1 }), T0);
        await braked.service.checkout(card({ cats: 1 }), T0);
        await expectRaveError(braked.service.checkout(card({ cats: 1 }), T0), 503, 'RAVE_BUSY');
    });

    it('drops the order when Stripe refuses to create the intent', async () => {
        const h = raveHarness();
        h.stripe.paymentIntents.create.mockRejectedValueOnce(new Error('boom'));
        await expectRaveError(h.service.checkout(card(), T0), 502, 'RAVE_STRIPE');
        expect(h.orders.rows).toHaveLength(0);
    });
});

describe('RaveService markPaid and the payout row', () => {
    async function paidOrder(h = raveHarness(), body = card()) {
        const res = await h.service.checkout(body, T0);
        const intentId = h.orders.rows.find((o: any) => o.orderId === res.orderId).paymentIntentId;
        return { h, res, intentId };
    }

    it('queues exactly one keeper row with the FULL donation and the rave memo, webhook and fallback racing', async () => {
        const { h, res, intentId } = await paidOrder();
        const intent = h.pay(intentId);
        const outcomes = await Promise.all([
            h.service.markPaid(intent, T0),
            h.service.markPaid(intent, T0),
            h.service.getOrder(res.orderId, T0),
        ]);
        expect(outcomes.filter(o => o === 'paid')).toHaveLength(1);
        expect(h.checkouts.rows).toHaveLength(1);
        const row = h.checkouts.rows[0];
        expect(row).toMatchObject({
            orderId: res.orderId,
            rail: 'card',
            network: 'testnet',
            cardIntent: intentId,
            status: 'COMPLETE',
            priceUsdCents: 500,
            sku: { kind: 'RAVE', name: 'Moon Rave' },
            shelterShare: {
                shelterId: PACK_SHELTER_IDS.pinkPaw,
                route: 'treasury',
                bps: 10000,
                evidenceTier: 'pledged',
                state: 'due',
                amountUsdCents: 500,
                memo: raveMemo(res.orderId),
                attempts: 0,
            },
        });
        expect(String(row.user)).toBe(String(RAVE_SYSTEM_USER));
        expect(row.shelterShare.memo).toMatch(/^tt:rave:[0-9a-f]{16}$/);
        // Fits Tempo's bytes32.
        expect(Buffer.byteLength(row.shelterShare.memo)).toBeLessThanOrEqual(32);
        const order = h.orders.rows[0];
        expect(order).toMatchObject({ status: 'paid', paidAt: T0, shareState: 'due', livemode: false });
        expect(order.expireAt).toBeUndefined();
        // Redeliveries change nothing.
        expect(await h.service.markPaid(intent, T0)).toBe('already');
        expect(h.checkouts.rows).toHaveLength(1);
    });

    it('re-queues the row if the process died between the paid write and the insert', async () => {
        const { h, intentId } = await paidOrder();
        const intent = h.pay(intentId);
        h.orders.rows[0].status = 'paid';
        expect(await h.service.markPaid(intent, T0)).toBe('already');
        expect(h.checkouts.rows).toHaveLength(1);
    });

    it('never queues a payout for a test payment against a mainnet keeper', async () => {
        const { h, intentId } = await paidOrder();
        h.service.env = ENV_MAINNET_KEEPER;
        expect(await h.service.markPaid(h.pay(intentId), T0)).toBe('mode-skipped');
        expect(h.checkouts.rows).toHaveLength(0);
        expect(h.orders.rows[0]).toMatchObject({ status: 'paid', payoutSkipped: 'mode' });
    });

    it('refuses an intent whose amount, currency or id does not match the order', async () => {
        const { h, intentId } = await paidOrder();
        expect(await h.service.markPaid({ ...h.pay(intentId), amount_received: 500 } as any, T0)).toBe('mismatch');
        expect(await h.service.markPaid({ ...h.pay(intentId), currency: 'eur' } as any, T0)).toBe('mismatch');
        expect(await h.service.markPaid({ ...h.pay(intentId), id: 'pi_other' } as any, T0)).toBe('mismatch');
        expect(await h.service.markPaid({ ...h.pay(intentId), metadata: {} } as any, T0)).toBe('ignored');
        expect(await h.service.markPaid({ ...h.pay(intentId), status: 'processing' } as any, T0)).toBe('not-succeeded');
        expect(h.checkouts.rows).toHaveLength(0);
    });

    it('holds elevated-risk payments for review; a manager release queues the row once', async () => {
        const { h, res, intentId } = await paidOrder();
        expect(await h.service.markPaid(h.pay(intentId, {}, 'elevated'), T0)).toBe('review');
        expect(h.checkouts.rows).toHaveLength(0);
        expect(h.orders.rows[0]).toMatchObject({ status: 'review', risk: 'elevated' });
        // The buyer and the list see it as paid (arriving).
        expect((await h.service.getOrder(res.orderId, T0)).status).toBe('paid');
        expect(await h.service.release(res.orderId, T0)).toEqual({
            orderId: res.orderId,
            status: 'paid',
            payoutQueued: true,
        });
        expect(h.checkouts.rows).toHaveLength(1);
        await expectRaveError(h.service.release(res.orderId, T0), 409, 'RAVE_ORDER_STATE');
    });

    it('voids the row on a refund before the payout; leaves it after the payout and flags it', async () => {
        const { h, res, intentId } = await paidOrder();
        await h.service.markPaid(h.pay(intentId), T0);
        expect(await h.service.reverse(intentId, 'refunded', false)).toBe('partial');
        expect(h.checkouts.rows[0].shelterShare.state).toBe('due');
        expect(await h.service.reverse(intentId, 'refunded', true)).toBe('voided');
        expect(h.checkouts.rows[0].shelterShare.state).toBe('void');
        expect(h.orders.rows[0].status).toBe('refunded');
        expect((await h.service.listCats({}, T0)).orders).toEqual([]);
        // A late success redelivery cannot bring it back.
        expect(await h.service.markPaid(h.pay(intentId), T0)).toBe('already');
        expect(h.checkouts.rows[0].shelterShare.state).toBe('void');

        const second = await paidOrder(raveHarness());
        await second.h.service.markPaid(second.h.pay(second.intentId), T0);
        second.h.checkouts.rows[0].shelterShare.state = 'sent';
        expect(await second.h.service.reverse(second.intentId, 'disputed', true)).toBe('after-payout');
        expect(second.h.checkouts.rows[0].shelterShare.state).toBe('sent');
        expect(second.h.orders.rows[0]).toMatchObject({ status: 'paid', reversedAfterPayout: 'disputed' });
        expect(res.orderId).not.toBe(second.res.orderId);
    });

    it('rebuilds a paid order whose unpaid record expired, from the intent metadata', async () => {
        const { h, res, intentId } = await paidOrder();
        const intent = h.pay(intentId);
        h.orders.rows.splice(0, 1);
        expect(await h.service.markPaid(intent, T0)).toBe('paid');
        expect(h.orders.rows[0]).toMatchObject({ orderId: res.orderId, status: 'paid', cats: 5 });
        expect(h.checkouts.rows[0].shelterShare.amountUsdCents).toBe(500);
    });

    it('the GET fallback reads Stripe at most once per 5 s per order', async () => {
        const { h, res, intentId } = await paidOrder();
        await h.service.getOrder(res.orderId, T0);
        await h.service.getOrder(res.orderId, new Date(T0.getTime() + 1000));
        expect(h.stripe.paymentIntents.retrieve).toHaveBeenCalledTimes(1);
        h.pay(intentId);
        const later = await h.service.getOrder(res.orderId, new Date(T0.getTime() + 6000));
        expect(later.status).toBe('paid');
        expect(h.checkouts.rows).toHaveLength(1);
    });

    it('moves processing → pending and canceled out of the list', async () => {
        const { h, intentId } = await paidOrder();
        const intent = h.intents.get(intentId);
        await h.service.markProcessing(intent);
        expect(h.orders.rows[0].status).toBe('pending');
        await h.service.markFailed(intent);
        expect(h.orders.rows[0].status).toBe('created');
        await h.service.markCanceled(intent);
        expect(h.orders.rows[0].status).toBe('canceled');
    });
});

describe('RaveService public list', () => {
    it('shows names, the chosen handle and the payout; no PII, no payment ids, no internal fields', async () => {
        const h = raveHarness();
        const res = await h.service.checkout(
            card({ cats: 12, names: ['Mochi'], restName: 'Disco', x: '@someone', clientKey: 'ck-secret-123' }),
            T0
        );
        const intentId = h.orders.rows[0].paymentIntentId;
        await h.service.markPaid(h.pay(intentId), T0);

        let list: any = await h.service.listCats({}, T0);
        expect(list.orders).toHaveLength(1);
        const row = list.orders[0];
        expect(Object.keys(row).sort()).toEqual(
            ['cats', 'createdAt', 'method', 'names', 'orderId', 'restName', 'status', 'x'].sort()
        );
        expect(row).toMatchObject({ orderId: res.orderId, cats: 12, restName: 'Disco', x: 'someone', status: 'paid' });
        expect(row.names[0]).toBe('Mochi');
        const json = JSON.stringify(list);
        for (const secret of ['ck-secret-123', intentId, 'requestHash', 'paymentIntentId', 'xHandleLower', 'risk']) {
            expect(json).not.toContain(secret);
        }

        // The keeper confirms the payout: the order becomes onchain with the tx.
        Object.assign(h.checkouts.rows[0].shelterShare, {
            state: 'confirmed',
            txHash: '0x' + 'cd'.repeat(32),
            chainId: 5042002,
            confirmedAt: T0,
        });
        list = await h.service.listCats({}, new Date(T0.getTime() + 20000));
        expect(list.orders[0]).toMatchObject({ status: 'onchain', chainId: 5042002, payoutTx: '0x' + 'cd'.repeat(32) });

        // A moderator hides it: default names, no handle.
        await h.service.moderate(res.orderId, true, 'mod1', T0);
        list = await h.service.listCats({}, new Date(T0.getTime() + 40000));
        const defaults = h.orders.rows[0].defaultNames;
        expect(list.orders[0].names).toEqual(defaults.slice(0, 10));
        expect(list.orders[0].restName).toBe(defaults[10]);
        expect(list.orders[0].x).toBeUndefined();
        expect(JSON.stringify(list)).not.toContain('someone');
        expect(JSON.stringify(list)).not.toContain('mod1');
    });

    it('never lists created, canceled or expired orders and pages by createdAt', async () => {
        const h = raveHarness();
        await h.service.checkout(card(), T0);
        expect((await h.service.listCats({}, T0)).orders).toEqual([]);
        const order = publicOrder({
            orderId: 'rv_0000000000000001',
            cats: 1,
            names: ['Mochi'],
            defaultNames: ['Pixel'],
            status: 'review',
            method: 'card',
            createdAt: T0,
            xHandle: 'someone',
            hidden: false,
        });
        expect(order.status).toBe('paid');
        await expectRaveError(h.service.listCats({ before: 'nope' }, T0), 400, 'RAVE_INVALID');
    });
});

describe('USDC gifts', () => {
    it('reads the paid amount from a recorded split batch event with the rave memo (string or bytes32)', () => {
        const chain = Object.values(CHAINS).find(c => c.split && c.network === 'testnet' && c.chainId !== 5042002)!;
        const split = chain.split!.address;
        const memo = 'tt:rave:3f9a0c1b7e2d4a65';
        const batch = (m: string, toShelters: bigint, address = split) => {
            const { topics, data } = shelterSplitInterface.encodeEventLog('DisbursementBatch', [
                1,
                '0x00000000000000000000000000000000000000aa',
                toShelters,
                toShelters,
                0,
                1,
                m,
            ]);
            return { address, topics, data };
        };
        const decimals = chain.split!.token.decimals;
        const unit = BigInt(10) ** BigInt(decimals);
        expect(usdcPaidToShelters([batch(memo, BigInt(5) * unit)], chain.chainId, memo)).toEqual({
            toShelters: BigInt(5) * unit,
            decimals,
        });
        expect(usdcPaidToShelters([batch(raveMemo32(memo), unit)], chain.chainId, memo)).toEqual({
            toShelters: unit,
            decimals,
        });
        expect(usdcPaidToShelters([batch('tt:rave:0000000000000000', unit)], chain.chainId, memo)).toBeNull();
        expect(
            usdcPaidToShelters([batch(memo, unit, '0x2222222222222222222222222222222222222222')], chain.chainId, memo)
        ).toBeNull();
    });

    it('stores the reported tx, verifies the receipt read-only and marks the order onchain', async () => {
        const h = raveHarness({ ...ENV_ON, RAVE_USDC_ENABLED: 'true' });
        const res = await h.service.checkout({ cats: 5, method: 'usdc' }, T0);
        const arc = Object.values(CHAINS).find(c => c.chainId === 5042002)!;
        const memo = res.memo!;
        const { topics, data } = shelterSplitInterface.encodeEventLog('NativeDisbursementBatch', [
            1,
            '0x00000000000000000000000000000000000000aa',
            BigInt(5) * BigInt(10) ** BigInt(18),
            BigInt(5) * BigInt(10) ** BigInt(18),
            0,
            1,
            memo,
        ]);
        h.chain.getReceipt.mockResolvedValue({ status: 1, logs: [{ address: arc.split!.address, topics, data }] });
        const txHash = '0x' + 'ef'.repeat(32);
        const out: any = await h.service.reportUsdcTx(res.orderId, { chainId: 5042002, txHash }, T0);
        expect(out).toMatchObject({ status: 'onchain', chainId: 5042002, payoutTx: txHash, method: 'usdc' });
        expect(h.checkouts.rows).toHaveLength(0);
    });

    it('refuses a mined tx that pays less than the order or another memo', async () => {
        const h = raveHarness({ ...ENV_ON, RAVE_USDC_ENABLED: 'true' });
        const res = await h.service.checkout({ cats: 5, method: 'usdc' }, T0);
        h.chain.getReceipt.mockResolvedValue({ status: 1, logs: [] });
        await expectRaveError(
            h.service.reportUsdcTx(res.orderId, { chainId: 5042002, txHash: '0x' + 'ab'.repeat(32) }, T0),
            400,
            'RAVE_TX_MISMATCH'
        );
        expect(h.orders.rows[0].status).toBe('created');
    });
});

describe('RaveService round-1 fixes', () => {
    const MIN = 60 * 1000;
    async function paid(h = raveHarness(), body = card()) {
        const res = await h.service.checkout(body, T0);
        const intentId = h.orders.rows.find((o: any) => o.orderId === res.orderId).paymentIntentId;
        await h.service.markPaid(h.pay(intentId), T0);
        return { h, res, intentId };
    }

    it('an unpaid order holds the daily cap and the brake for 15 minutes only, not its 24 h TTL', async () => {
        const h = raveHarness({ ...ENV_ON, RAVE_DAILY_CAP_USD: '100' });
        await h.service.checkout(card({ cats: 100 }), T0);
        // Unpaid orders hold at most 10 % of the cap (round-2 fix), and only for 15 minutes.
        expect((await h.service.status(T0)).prices!.max).toBe(90);
        const later = new Date(T0.getTime() + 16 * MIN);
        expect((await h.service.status(later)).enabled).toBe(true);
        expect((await h.service.status(later)).prices!.max).toBe(100);

        const braked = raveHarness({ ...ENV_ON, RAVE_CREATED_PER_HOUR: '2' });
        await braked.service.checkout(card({ cats: 1 }), T0);
        await braked.service.checkout(card({ cats: 1 }), T0);
        await expectRaveError(braked.service.checkout(card({ cats: 1 }), T0), 503, 'RAVE_BUSY');
        await braked.service.checkout(card({ cats: 1 }), new Date(T0.getTime() + 16 * MIN));
    });

    it('a refund marks the keeper row reversed in any state; a failed row is voided, not reported as paid', async () => {
        const a = await paid();
        a.h.checkouts.rows[0].shelterShare.state = 'failed';
        expect(await a.h.service.reverse(a.intentId, 'refunded', true, undefined, T0)).toBe('voided');
        expect(a.h.checkouts.rows[0].shelterShare).toMatchObject({ state: 'void', reversed: 'refunded' });
        expect(a.h.orders.rows[0].status).toBe('refunded');

        const b = await paid();
        b.h.checkouts.rows[0].shelterShare.state = 'sending';
        expect(await b.h.service.reverse(b.intentId, 'disputed', true, undefined, T0)).toBe('after-payout');
        expect(b.h.checkouts.rows[0].shelterShare).toMatchObject({ state: 'sending', reversed: 'disputed' });
        // The keeper puts it back to due (stale lock, revert, send error) and voids it; the order follows.
        b.h.checkouts.rows[0].shelterShare.state = 'void';
        await b.h.service.refreshCron(T0);
        expect(b.h.orders.rows[0].status).toBe('disputed');
    });

    it('partial refunds shrink a waiting payout and add up to a full reversal', async () => {
        const { h, intentId } = await paid(); // $5 + covered fee
        const amount = h.orders.rows[0].amountCents;
        expect(await h.service.reverse(intentId, 'refunded', false, 100, T0)).toBe('reduced');
        expect(h.orders.rows[0].refundedCents).toBe(100);
        expect(h.checkouts.rows[0].shelterShare).toMatchObject({ state: 'due', amountUsdCents: 400 });
        expect(await h.service.reverse(intentId, 'refunded', false, amount, T0)).toBe('voided');
        expect(h.checkouts.rows[0].shelterShare.state).toBe('void');
        expect(h.orders.rows[0]).toMatchObject({ status: 'refunded', refundedCents: amount });
    });

    it('keeps orders held for fraud review out of the public list until released', async () => {
        const h = raveHarness();
        const res = await h.service.checkout(card({ names: ['Mochi'], x: '@someone' }), T0);
        const intentId = h.orders.rows[0].paymentIntentId;
        expect(await h.service.markPaid(h.pay(intentId, {}, 'highest'), T0)).toBe('review');
        expect((await h.service.listCats({}, T0)).orders).toEqual([]);
        await h.service.release(res.orderId, T0);
        expect((await h.service.listCats({}, new Date(T0.getTime() + 20000))).orders).toHaveLength(1);
    });

    it('accepts only its own cursor as `before`, and pages after the first never refresh payouts', async () => {
        const h = raveHarness();
        for (const bad of ['nope', '2026-10-16', '1999-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z', ['x']]) {
            await expectRaveError(h.service.listCats({ before: bad }, T0), 400, 'RAVE_INVALID');
        }
        const spy = jest.spyOn(h.service, 'refreshShares');
        await h.service.listCats({ before: '2026-10-16T11:00:00.000Z' }, T0);
        await h.service.listCats({ before: '2026-10-16T11:00:00.001Z' }, T0);
        expect(spy).not.toHaveBeenCalled();
        await h.service.listCats({}, T0);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('re-verifies an expired USDC order when the same tx is reported again or in the background', async () => {
        const h = raveHarness({ ...ENV_ON, RAVE_USDC_ENABLED: 'true' });
        const res = await h.service.checkout({ cats: 5, method: 'usdc' }, T0);
        const arc = Object.values(CHAINS).find(c => c.chainId === 5042002)!;
        const txHash = '0x' + 'ef'.repeat(32);
        await h.service.reportUsdcTx(res.orderId, { chainId: 5042002, txHash }, T0);
        const late = new Date(T0.getTime() + 31 * MIN);
        await h.service.getOrder(res.orderId, late);
        expect(h.orders.rows[0].status).toBe('expired');
        // Still no receipt: it stays expired (not reset), and a background run rechecks it.
        expect((await h.service.reportUsdcTx(res.orderId, { chainId: 5042002, txHash }, late)).status).toBe('expired');
        const { topics, data } = shelterSplitInterface.encodeEventLog('NativeDisbursementBatch', [
            1,
            '0x00000000000000000000000000000000000000aa',
            BigInt(5) * BigInt(10) ** BigInt(18),
            BigInt(5) * BigInt(10) ** BigInt(18),
            0,
            1,
            res.memo!,
        ]);
        h.chain.getReceipt.mockResolvedValue({ status: 1, logs: [{ address: arc.split!.address, topics, data }] });
        await h.service.refreshCron(new Date(late.getTime() + MIN));
        expect(h.orders.rows[0]).toMatchObject({ status: 'onchain', payout: { txHash } });
    });
});

describe('RaveService round-2 fixes', () => {
    const SEC = 1000;
    const MIN = 60 * SEC;

    it('a held $50 order refunded $20 and then released pays the shelter at most $30', async () => {
        const h = raveHarness();
        const res = await h.service.checkout(card({ cats: 50 }), T0);
        const intentId = h.orders.rows[0].paymentIntentId;
        expect(await h.service.markPaid(h.pay(intentId, {}, 'elevated'), T0)).toBe('review');
        // No payout row exists yet, so nothing can be shrunk: the refund is only recorded on the order.
        expect(await h.service.reverse(intentId, 'refunded', false, 2000, T0)).toBe('partial');
        expect(h.checkouts.rows).toHaveLength(0);
        await h.service.release(res.orderId, T0);
        expect(h.checkouts.rows).toHaveLength(1);
        const share = h.checkouts.rows[0].shelterShare;
        expect(share.amountUsdCents).toBeLessThanOrEqual(3000);
        expect(share.amountUsdCents).toBe(3000);
        expect(h.checkouts.rows[0].priceUsdCents).toBe(3000);
    });

    it('the re-queue path of a repeated success pays only what was kept, and nothing when all was refunded', async () => {
        const h = raveHarness();
        await h.service.checkout(card({ cats: 10 }), T0);
        const order = h.orders.rows[0];
        const intent = h.pay(order.paymentIntentId);
        // The process died between the paid write and the insert; a partial refund landed meanwhile.
        order.status = 'paid';
        order.refundedCents = 400;
        expect(await h.service.markPaid(intent, T0)).toBe('already');
        expect(h.checkouts.rows[0].shelterShare.amountUsdCents).toBe(600);

        const all = raveHarness();
        await all.service.checkout(card({ cats: 5, coverFee: false }), T0);
        const o = all.orders.rows[0];
        const paidIntent = all.pay(o.paymentIntentId);
        o.status = 'paid';
        o.refundedCents = 500;
        expect(await all.service.markPaid(paidIntent, T0)).toBe('already');
        expect(all.checkouts.rows).toHaveLength(0);
        expect(all.orders.rows[0].payoutSkipped).toBe('refunded');
    });

    it('a {cats: 100} order that is never paid does not close checkout', async () => {
        const h = raveHarness({ ...ENV_ON, RAVE_DAILY_CAP_USD: '100' });
        await h.service.checkout(card({ cats: 100 }), T0);
        // A second one no longer fits (90 left), and more unpaid orders cannot hold more than 10 %.
        await expectRaveError(h.service.checkout(card({ cats: 100 }), T0), 503, 'RAVE_CAP');
        await h.service.checkout(card({ cats: 90 }), T0);
        const status = await h.service.status(T0);
        expect(status.reason).not.toBe('cap');
        expect(status.enabled).toBe(true);
        expect(status.prices!.max).toBe(90);
        // Everyone else can still buy.
        expect((await h.service.checkout(card({ cats: 50 }), T0)).cats).toBe(50);
    });

    it('a reported USDC tx is neither listed nor counted until its receipt is verified', async () => {
        const h = raveHarness({ ...ENV_ON, RAVE_USDC_ENABLED: 'true', RAVE_DAILY_CAP_USD: '10' });
        const res = await h.service.checkout({ cats: 10, method: 'usdc', names: ['Spam'], x: '@spammer' }, T0);
        const made = '0x' + '12'.repeat(32);
        const out: any = await h.service.reportUsdcTx(res.orderId, { chainId: 5042002, txHash: made }, T0);
        // The buyer still sees `pending`; the row itself is `reported`.
        expect(out.status).toBe('pending');
        expect(h.orders.rows[0].status).toBe('reported');
        expect((await h.service.listCats({}, T0)).orders).toEqual([]);
        const status = await h.service.status(T0);
        expect(status.enabled).toBe(true);
        expect(status.prices!.max).toBe(10);
        // After RAVE_USDC_GIVE_UP_MS without a receipt it expires, still unlisted.
        await h.service.getOrder(res.orderId, new Date(T0.getTime() + 31 * MIN));
        expect(h.orders.rows[0].status).toBe('expired');
    });

    it('reads a reported USDC receipt at most once per 10 s per order from GET /rave/orders/:id', async () => {
        const h = raveHarness({ ...ENV_ON, RAVE_USDC_ENABLED: 'true' });
        const res = await h.service.checkout({ cats: 5, method: 'usdc' }, T0);
        await h.service.reportUsdcTx(res.orderId, { chainId: 5042002, txHash: '0x' + '34'.repeat(32) }, T0);
        expect(h.chain.getReceipt).toHaveBeenCalledTimes(1);
        for (let i = 0; i < 5; i++) await h.service.getOrder(res.orderId, new Date(T0.getTime() + i * SEC));
        expect(h.chain.getReceipt).toHaveBeenCalledTimes(1);
        await h.service.getOrder(res.orderId, new Date(T0.getTime() + 11 * SEC));
        expect(h.chain.getReceipt).toHaveBeenCalledTimes(2);
    });
});
