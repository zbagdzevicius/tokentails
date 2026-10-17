import { HttpException } from '@nestjs/common';
import sharp = require('sharp');
import { PACK_SHELTER_IDS } from 'src/blessing/featured-shelters';
import { raveAdQuote, raveAdShelterCents, readRaveAdsConfig } from './rave-ads.config';
import { adsHarness, ENV_ADS, png, T0 } from './rave-ads.harness-spec';
import { RAVE_AD_IMAGE_MAX_BYTES } from './rave-ads.image';
import { raveAdMemo } from './rave-ads.service';
import { RAVE_AD_SLOT_IDS, RAVE_AD_SLOTS } from './rave-ads.slots';

/*
 * Moon Rave ad space: pricing, slot atomicity, the 15-minute hold, payment, approval, reject + refund,
 * the public list, the shelter share and the image pipeline. Stripe TEST semantics only; Stripe, storage
 * and Mongo are in-memory fakes.
 */

async function expectAdError(run: Promise<unknown>, status: number, code: string) {
    let error: unknown;
    try {
        await run;
    } catch (e) {
        error = e;
    }
    expect(error).toBeInstanceOf(HttpException);
    const http = error as HttpException;
    expect({ status: http.getStatus(), code: (http.getResponse() as any)?.code }).toEqual({ status, code });
    return http.getResponse() as any;
}

const MIN = 60 * 1000;
const DAY = 24 * 3600 * 1000;

let image: Buffer;
beforeAll(async () => {
    image = await png();
});

const body = (extra: Record<string, unknown> = {}) => ({
    slotId: 'screen-1',
    name: 'Purrfect Coffee',
    url: 'https://purrfect.example.com/menu',
    x: '@purrfect',
    coverFee: 'true',
    ...extra,
});

/** Checkout + pay through the webhook; returns the ad id. */
async function buyPaid(h: ReturnType<typeof adsHarness>, extra: Record<string, unknown> = {}) {
    const out = await h.service.checkout(body(extra), { buffer: image }, h.clock.now);
    const intent = h.pay(h.ads.rows.find((r: any) => r.adId === out.adId).paymentIntentId);
    expect(await h.service.markPaid(intent, h.clock.now)).toBe('review');
    return out.adId;
}

describe('RaveAdsService config and pricing', () => {
    it('has no on/off flag: with no config, status names Stripe and checkout is 503', async () => {
        const h = adsHarness({});
        expect(await h.service.status(T0)).toEqual({ enabled: false, reason: 'stripe' });
        await expectAdError(h.service.checkout(body(), { buffer: image }, T0), 503, 'RAVE_AD_OFF');
    });

    it('needs the Stripe keys, matching modes, and a live key only in production', async () => {
        expect((await adsHarness({ ...ENV_ADS, RAVE_STRIPE_WEBHOOK_SECRET: '' }).service.status(T0)).reason).toBe(
            'stripe'
        );
        expect((await adsHarness({ ...ENV_ADS, STRIPE_PUBLISHABLE_KEY: 'pk_live_x' }).service.status(T0)).reason).toBe(
            'mode'
        );
        expect(
            (
                await adsHarness({
                    ...ENV_ADS,
                    STRIPE_SECRET_KEY: 'sk_live_x',
                    STRIPE_PUBLISHABLE_KEY: 'pk_live_x',
                }).service.status(T0)
            ).reason
        ).toBe('mode');
        // A shelter share needs the keeper on the key's network class.
        expect(
            (await adsHarness({ ...ENV_ADS, RAVE_AD_SHELTER_BPS: '2500', SHELTER_CHAIN_ID: '5042' }).service.status(T0))
                .reason
        ).toBe('mode');
    });

    it('prices every slot at $100, server side; the fee add-on grosses it up so the full $100 lands', () => {
        const cfg = readRaveAdsConfig(ENV_ADS);
        expect(cfg.priceCents).toBe(10000);
        expect(raveAdQuote(false, cfg)).toEqual({ priceCents: 10000, feeCents: 0, amountCents: 10000 });
        const q = raveAdQuote(true, cfg);
        expect(q).toEqual({ priceCents: 10000, feeCents: 330, amountCents: 10330 });
        // What Stripe keeps (2.9 % + 30 c, rounded half up) never eats into the $100.
        expect(q.amountCents - Math.round((q.amountCents * 290) / 10000) - 30).toBeGreaterThanOrEqual(10000);
        expect(raveAdShelterCents(10000, 0)).toBe(0);
        expect(raveAdShelterCents(10000, 2500)).toBe(2500);
    });

    it('lists all 20 slots free, with price, hold and duration', async () => {
        const st = await adsHarness().service.status(T0);
        expect(st).toMatchObject({
            enabled: true,
            livemode: false,
            publishableKey: 'pk_test_rave_fake',
            priceCents: 10000,
            holdMinutes: 15,
            days: 30,
            shelterBps: 0,
        });
        expect(st.slots!.map(s => s.slotId)).toEqual(RAVE_AD_SLOT_IDS);
        expect(st.slots!.every(s => s.free)).toBe(true);
        expect(JSON.stringify(st)).not.toMatch(/sk_test|whsec/);
    });

    it('ignores a client-sent price: the PaymentIntent carries the server amount and ad metadata only', async () => {
        const h = adsHarness();
        const out = await h.service.checkout(body({ amountCents: 1, priceCents: 1 } as any), { buffer: image }, T0);
        expect(out).toMatchObject({
            status: 'held',
            priceCents: 10000,
            feeCents: 330,
            amountCents: 10330,
            slotId: 'screen-1',
        });
        expect(out.clientSecret).toMatch(/^pi_test_ad_\d+_secret_fake$/);
        const [params, opts] = h.stripe.paymentIntents.create.mock.calls[0];
        expect(params).toMatchObject({
            amount: 10330,
            currency: 'usd',
            metadata: { raveAd: '1', adId: out.adId, slotId: 'screen-1' },
        });
        expect(params.automatic_payment_methods).toEqual({ enabled: true, allow_redirects: 'never' });
        expect(opts).toEqual({ idempotencyKey: `ravead:${out.adId}` });
        expect(JSON.stringify(params.metadata)).not.toMatch(/purrfect/i);
        const noFee = await h.service.checkout(body({ slotId: 'banner-1', coverFee: 'false' }), { buffer: image }, T0);
        expect(noFee.amountCents).toBe(10000);
    });
});

describe('RaveAdsService validation', () => {
    it('refuses unknown slots, bad names, non-https links and bad X handles', async () => {
        const h = adsHarness();
        await expectAdError(
            h.service.checkout(body({ slotId: 'screen-9' }), { buffer: image }, T0),
            400,
            'RAVE_AD_SLOT'
        );
        await expectAdError(h.service.checkout(body({ name: 'x' }), { buffer: image }, T0), 400, 'RAVE_AD_NAME');
        await expectAdError(
            h.service.checkout(body({ name: 'visit evil.com' }), { buffer: image }, T0),
            400,
            'RAVE_AD_NAME'
        );
        const http = await expectAdError(
            h.service.checkout(body({ url: 'http://purrfect.example.com' }), { buffer: image }, T0),
            400,
            'RAVE_AD_URL'
        );
        expect(http.fieldCode).toBe('URL_NOT_HTTPS');
        await expectAdError(
            h.service.checkout(body({ url: 'javascript:alert(1)' }), { buffer: image }, T0),
            400,
            'RAVE_AD_URL'
        );
        await expectAdError(
            h.service.checkout(body({ x: 'not a handle!' }), { buffer: image }, T0),
            400,
            'RAVE_AD_X_HANDLE'
        );
        await expectAdError(
            h.service.checkout(body({ coverFee: 'maybe' }), { buffer: image }, T0),
            400,
            'RAVE_AD_INVALID'
        );
        // Nothing was reserved or charged.
        expect(h.ads.rows).toHaveLength(0);
        expect(h.stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('stores the normalised link and the bare X handle', async () => {
        const h = adsHarness();
        const out = await h.service.checkout(
            body({ url: '  https://Purrfect.Example.com  ', x: 'https://x.com/Purrfect_Co' }),
            { buffer: image },
            T0
        );
        expect(out.url).toBe('https://purrfect.example.com/');
        expect(out.x).toBe('Purrfect_Co');
    });
});

describe('RaveAdsService image', () => {
    it('crops to the slot aspect and re-encodes as WebP at the slot size', async () => {
        const h = adsHarness();
        const square = await png(900, 900);
        await h.service.checkout(body({ slotId: 'tower-2' }), { buffer: square }, T0);
        const meta = await sharp(h.uploads[0].data).metadata();
        expect(meta.format).toBe('webp');
        const tower = RAVE_AD_SLOTS.find(s => s.id === 'tower-2')!;
        expect([meta.width, meta.height]).toEqual([tower.width, tower.height]);
        expect(meta.exif).toBeUndefined();
        expect(h.uploads[0].key).toMatch(/^rave-ads\/private\/ad_[0-9a-f]{16}-[0-9a-f]{12}\.webp$/);
    });

    it('refuses a missing, oversized, animated or undecodable image before reserving the slot', async () => {
        const h = adsHarness();
        const missing = await expectAdError(h.service.checkout(body(), undefined, T0), 400, 'RAVE_AD_IMAGE');
        expect(missing.fieldCode).toBe('IMAGE_REQUIRED');
        const big = await expectAdError(
            h.service.checkout(body(), { buffer: Buffer.alloc(RAVE_AD_IMAGE_MAX_BYTES + 1) }, T0),
            400,
            'RAVE_AD_IMAGE'
        );
        expect(big.fieldCode).toBe('IMAGE_TOO_LARGE');
        const junk = await expectAdError(
            h.service.checkout(body(), { buffer: Buffer.from('<svg/>') }, T0),
            400,
            'RAVE_AD_IMAGE'
        );
        expect(junk.fieldCode).toBe('IMAGE_DECODE');
        const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } })
            .gif()
            .toBuffer();
        const gifErr = await expectAdError(h.service.checkout(body(), { buffer: gif }, T0), 400, 'RAVE_AD_IMAGE');
        expect(gifErr.fieldCode).toBe('IMAGE_TYPE');
        expect(h.ads.rows).toHaveLength(0);
    });

    it('frees the slot when the image cannot be stored', async () => {
        const h = adsHarness();
        (h.service.io.storePrivate as jest.Mock).mockRejectedValueOnce(new Error('spaces down'));
        await expectAdError(h.service.checkout(body(), { buffer: image }, T0), 503, 'RAVE_AD_STORAGE');
        expect((await h.service.status(T0)).slots!.find(s => s.slotId === 'screen-1')!.free).toBe(true);
        expect(h.stripe.paymentIntents.create).not.toHaveBeenCalled();
    });
});

describe('RaveAdsService slot atomicity and holds', () => {
    it('never sells the same slot twice at once', async () => {
        const h = adsHarness();
        const results = await Promise.allSettled([
            h.service.checkout(body({ name: 'First Buyer' }), { buffer: image }, T0),
            h.service.checkout(body({ name: 'Second Buyer' }), { buffer: image }, T0),
            h.service.checkout(body({ name: 'Third Buyer' }), { buffer: image }, T0),
        ]);
        const ok = results.filter(r => r.status === 'fulfilled');
        const lost = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
        expect(ok).toHaveLength(1);
        expect(lost).toHaveLength(2);
        for (const l of lost)
            expect((l.reason as HttpException).getResponse()).toMatchObject({ code: 'RAVE_AD_SLOT_TAKEN' });
        expect(h.stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
        // Other slots stay sellable.
        await expect(h.service.checkout(body({ slotId: 'blimp-3' }), { buffer: image }, T0)).resolves.toMatchObject({
            status: 'held',
        });
        const st = await h.service.status(T0);
        expect(
            st
                .slots!.filter(s => !s.free)
                .map(s => s.slotId)
                .sort()
        ).toEqual(['blimp-3', 'screen-1']);
    });

    it('a repeat with the same clientKey returns the same hold; another body with it is refused', async () => {
        const h = adsHarness();
        const key = '0b5c6d1e-1111-4222-8333-944455556666';
        const a = await h.service.checkout(body({ clientKey: key }), { buffer: image }, T0);
        const b = await h.service.checkout(body({ clientKey: key }), { buffer: image }, T0);
        expect(b.adId).toBe(a.adId);
        expect(b.clientSecret).toBe(a.clientSecret);
        expect(h.stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
        await expectAdError(
            h.service.checkout(body({ clientKey: key, name: 'Other Name' }), { buffer: image }, T0),
            409,
            'RAVE_AD_KEY_REUSED'
        );
    });

    it('holds the slot for 15 minutes, then frees it and cancels the unpaid intent', async () => {
        const h = adsHarness();
        const first = await h.service.checkout(body(), { buffer: image }, T0);
        expect(new Date(first.holdUntil!).getTime() - T0.getTime()).toBe(15 * MIN);
        const at14 = new Date(T0.getTime() + 14 * MIN);
        await expectAdError(
            h.service.checkout(body({ name: 'Late Buyer' }), { buffer: image }, at14),
            409,
            'RAVE_AD_SLOT_TAKEN'
        );
        const slot14 = (await h.service.status(at14)).slots!.find(s => s.slotId === 'screen-1')!;
        expect(slot14).toMatchObject({ free: false, heldUntil: first.holdUntil });

        const at16 = new Date(T0.getTime() + 16 * MIN);
        expect((await h.service.status(at16)).slots!.find(s => s.slotId === 'screen-1')!.free).toBe(true);
        expect(h.ads.rows.find((r: any) => r.adId === first.adId)).toMatchObject({ status: 'expired' });
        expect(h.ads.rows.find((r: any) => r.adId === first.adId).slotLock).toBeUndefined();
        expect(h.stripe.paymentIntents.cancel).toHaveBeenCalledWith(h.ads.rows[0].paymentIntentId);
        const second = await h.service.checkout(body({ name: 'Late Buyer' }), { buffer: image }, at16);
        expect(second.status).toBe('held');
    });

    it('a payment that lands after the hold lapsed keeps the slot if it is still free', async () => {
        const h = adsHarness();
        const first = await h.service.checkout(body(), { buffer: image }, T0);
        const at16 = new Date(T0.getTime() + 16 * MIN);
        await h.service.sweep(at16);
        const pi = h.ads.rows[0].paymentIntentId;
        expect(await h.service.markPaid(h.pay(pi), at16)).toBe('review');
        expect(h.ads.rows[0]).toMatchObject({ adId: first.adId, status: 'review', slotLock: 'screen-1' });
        expect(h.stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('a late payment for a slot someone else took is refunded at once (never two ads on one slot)', async () => {
        const h = adsHarness();
        await h.service.checkout(body(), { buffer: image }, T0);
        const at16 = new Date(T0.getTime() + 16 * MIN);
        const second = await h.service.checkout(body({ name: 'Late Buyer' }), { buffer: image }, at16);
        const firstPi = h.ads.rows[0].paymentIntentId;
        expect(await h.service.markPaid(h.pay(firstPi), at16)).toBe('slot-lost');
        expect(h.ads.rows[0]).toMatchObject({ status: 'refunded', refund: { state: 'refunded', reason: 'slot-lost' } });
        expect(h.stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: firstPi }), {
            idempotencyKey: `ravead-refund:${h.ads.rows[0].adId}`,
        });
        expect(h.ads.rows.find((r: any) => r.adId === second.adId)).toMatchObject({
            status: 'held',
            slotLock: 'screen-1',
        });
    });
    it('a failed slot-lost refund can be retried through reject, once, with the same idempotency key', async () => {
        const h = adsHarness();
        await h.service.checkout(body(), { buffer: image }, T0);
        const at16 = new Date(T0.getTime() + 16 * MIN);
        await h.service.checkout(body({ name: 'Late Buyer' }), { buffer: image }, at16);
        const lost = h.ads.rows[0];
        h.stripe.refunds.create.mockRejectedValueOnce(new Error('stripe down'));
        expect(await h.service.markPaid(h.pay(lost.paymentIntentId), at16)).toBe('slot-lost');
        expect(h.ads.rows[0]).toMatchObject({ status: 'refunded', refund: { state: 'failed', reason: 'slot-lost' } });
        expect(await h.service.reject(lost.adId, '', 'admin1', at16)).toEqual({
            adId: lost.adId,
            status: 'refunded',
            refund: 'refunded',
        });
        expect(h.ads.rows[0].refund).toMatchObject({ state: 'refunded', reason: 'slot-lost' });
        // The slot stays with the other buyer, and a refunded ad cannot be refunded again.
        expect(h.ads.rows[1]).toMatchObject({ status: 'held', slotLock: 'screen-1' });
        await expect(h.service.reject(lost.adId, '', 'admin1', at16)).rejects.toBeInstanceOf(HttpException);
        expect(h.stripe.refunds.create).toHaveBeenCalledTimes(2);
        expect(new Set(h.stripe.refunds.create.mock.calls.map((c: any[]) => c[1].idempotencyKey)).size).toBe(1);
    });
});

describe('RaveAdsService payment, approval and reject', () => {
    it('a paid ad waits for review; a mismatched or repeated payment changes nothing', async () => {
        const h = adsHarness();
        const out = await h.service.checkout(body(), { buffer: image }, T0);
        const pi = h.ads.rows[0].paymentIntentId;
        const paid = h.pay(pi);
        expect(await h.service.markPaid({ ...paid, amount_received: 100 } as any, T0)).toBe('mismatch');
        expect(await h.service.markPaid({ ...paid, status: 'processing' } as any, T0)).toBe('not-succeeded');
        expect(await h.service.markPaid(paid, T0)).toBe('review');
        expect(await h.service.markPaid(paid, T0)).toBe('already');
        expect(h.ads.rows[0]).toMatchObject({ adId: out.adId, status: 'review', slotLock: 'screen-1' });
        expect(h.ads.rows[0].holdUntil).toBeUndefined();
    });

    it('routes payment_intent.succeeded for an ad through the rave webhook', async () => {
        const h = adsHarness();
        await h.service.checkout(body(), { buffer: image }, T0);
        const pi = h.ads.rows[0].paymentIntentId;
        h.pay(pi);
        const event: any = {
            id: 'evt_ad_1',
            type: 'payment_intent.succeeded',
            data: { object: { id: pi, metadata: { raveAd: '1', adId: h.ads.rows[0].adId } } },
        };
        expect(await h.webhooks.handle(event, T0)).toBe('review');
        expect(await h.webhooks.handle(event, T0)).toBe('duplicate');
    });

    it('approve makes it live for 30 days; it then ends and frees the slot', async () => {
        const h = adsHarness();
        const adId = await buyPaid(h);
        const live = await h.service.approve(adId, 'admin1', T0);
        expect(live).toMatchObject({ status: 'live', payoutQueued: false });
        expect(new Date(live.liveUntil!).getTime() - T0.getTime()).toBe(30 * DAY);
        expect((await h.service.listPublic(T0)).ads).toEqual([
            {
                adId,
                slotId: 'screen-1',
                name: 'Purrfect Coffee',
                url: 'https://purrfect.example.com/menu',
                x: 'purrfect',
                imageUrl: expect.stringMatching(/^https:\/\/cdn\.test\.invalid\/rave-ads\//),
                liveUntil: live.liveUntil,
            },
        ]);
        await expect(h.service.approve(adId, 'admin1', T0)).rejects.toBeInstanceOf(HttpException);
        // No checkout row: ad money is Token Tails revenue by default.
        expect(h.checkouts.rows).toHaveLength(0);
        const after = new Date(T0.getTime() + 31 * DAY);
        expect((await h.service.listPublic(after)).ads).toEqual([]);
        expect((await h.service.status(after)).slots!.find(s => s.slotId === 'screen-1')!.free).toBe(true);
        expect(h.ads.rows[0].status).toBe('ended');
    });

    it('reject refunds the full payment through Stripe and frees the slot; the refund webhook is a no-op', async () => {
        const h = adsHarness();
        const adId = await buyPaid(h);
        const pi = h.ads.rows[0].paymentIntentId;
        expect(await h.service.reject(adId, 'off-brand', 'admin1', T0)).toEqual({
            adId,
            status: 'rejected',
            refund: 'refunded',
        });
        expect(h.stripe.refunds.create).toHaveBeenCalledWith(
            { payment_intent: pi, reason: 'requested_by_customer', metadata: { adId, reason: 'rejected' } },
            { idempotencyKey: `ravead-refund:${adId}` }
        );
        expect(h.ads.rows[0]).toMatchObject({
            status: 'rejected',
            rejectReason: 'off-brand',
            refund: { state: 'refunded' },
        });
        expect(h.ads.rows[0].slotLock).toBeUndefined();
        expect((await h.service.status(T0)).slots!.find(s => s.slotId === 'screen-1')!.free).toBe(true);
        expect(await h.service.reverse(pi, 'refunded', true)).toBe('already');
        await expect(h.service.reject(adId, 'again', 'admin1', T0)).rejects.toBeInstanceOf(HttpException);
    });

    it('a failed refund is recorded and retried by rejecting again', async () => {
        const h = adsHarness();
        const adId = await buyPaid(h);
        h.stripe.refunds.create.mockRejectedValueOnce(new Error('stripe down'));
        expect((await h.service.reject(adId, '', 'admin1', T0)).refund).toBe('failed');
        expect(h.ads.rows[0].refund).toMatchObject({ state: 'failed', error: 'stripe down' });
        expect((await h.service.reject(adId, '', 'admin1', T0)).refund).toBe('refunded');
        expect(h.stripe.refunds.create).toHaveBeenCalledTimes(2);
        expect(new Set(h.stripe.refunds.create.mock.calls.map((c: any[]) => c[1].idempotencyKey)).size).toBe(1);
    });

    it('a live ad can be taken down with a refund too', async () => {
        const h = adsHarness();
        const adId = await buyPaid(h);
        await h.service.approve(adId, 'admin1', T0);
        expect((await h.service.reject(adId, 'reported', 'admin1', T0)).refund).toBe('refunded');
        expect((await h.service.listPublic(new Date(T0.getTime() + 60 * 1000))).ads).toEqual([]);
    });

    it('a Stripe refund or dispute from outside takes the ad down', async () => {
        const h = adsHarness();
        const adId = await buyPaid(h);
        await h.service.approve(adId, 'admin1', T0);
        const pi = h.ads.rows[0].paymentIntentId;
        const event: any = {
            id: 'evt_dispute',
            type: 'charge.dispute.created',
            data: { object: { payment_intent: pi } },
        };
        expect(await h.webhooks.handle(event, T0)).toBe('refunded');
        expect(h.ads.rows[0]).toMatchObject({ status: 'refunded' });
        expect(h.ads.rows[0].slotLock).toBeUndefined();
    });

    it('the public list never shows held, in-review, rejected or expired ads', async () => {
        const h = adsHarness();
        await h.service.checkout(body({ slotId: 'banner-1' }), { buffer: image }, T0); // held
        await buyPaid(h, { slotId: 'banner-2' }); // review
        const rejected = await buyPaid(h, { slotId: 'banner-3' });
        await h.service.reject(rejected, '', 'admin1', T0);
        const live = await buyPaid(h, { slotId: 'moon-1' });
        await h.service.approve(live, 'admin1', T0);
        const list = await h.service.listPublic(T0);
        expect(list.ads.map(a => a.slotId)).toEqual(['moon-1']);
        for (const a of list.ads)
            expect(Object.keys(a).sort()).toEqual(['adId', 'imageUrl', 'liveUntil', 'name', 'slotId', 'url', 'x']);
    });

    it('RAVE_AD_SHELTER_BPS queues that share of an approved ad for Pink Paw on the keeper path', async () => {
        const h = adsHarness({ ...ENV_ADS, RAVE_AD_SHELTER_BPS: '2500' });
        const adId = await buyPaid(h);
        expect(h.checkouts.rows).toHaveLength(0); // not before approval
        const out = await h.service.approve(adId, 'admin1', T0);
        expect(out.payoutQueued).toBe(true);
        expect(h.checkouts.rows).toHaveLength(1);
        expect(h.checkouts.rows[0]).toMatchObject({
            orderId: adId,
            rail: 'card',
            network: 'testnet',
            cardIntent: h.ads.rows[0].paymentIntentId,
            shelterShare: {
                shelterId: PACK_SHELTER_IDS.pinkPaw,
                state: 'due',
                amountUsdCents: 2500,
                memo: raveAdMemo(adId),
            },
        });
        expect(raveAdMemo(adId)).toMatch(/^tt:ravead:[0-9a-f]{16}$/);
        // Taken down before the keeper sent it: the share is voided, nothing is paid.
        await h.service.reject(adId, 'reported', 'admin1', T0);
        expect(h.checkouts.rows[0].shelterShare.state).toBe('void');
    });

    it('the buyer read falls back to Stripe when the webhook is slow', async () => {
        const h = adsHarness();
        const out = await h.service.checkout(body(), { buffer: image }, T0);
        h.pay(h.ads.rows[0].paymentIntentId);
        expect((await h.service.getAd(out.adId, T0)).status).toBe('review');
        await expectAdError(h.service.getAd('ad_nope', T0), 404, 'RAVE_AD_NOT_FOUND');
    });
});

describe('RaveAdsService round-1 fixes', () => {
    it('keeps the image private until approval, publishes it on approve and deletes it when the ad ends', async () => {
        const h = adsHarness();
        const adId = await buyPaid(h);
        const row = () => h.ads.rows.find((r: any) => r.adId === adId);
        expect(row().imageUrl).toBeUndefined();
        expect(row().imageKey).toMatch(/^rave-ads\/private\//);
        expect([...h.store.values()].every(o => !o.public)).toBe(true);
        expect((await h.service.getAd(adId, T0)).imageUrl).toBeNull();
        // The admin previews the private copy.
        expect(Buffer.isBuffer(await h.service.adminImage(adId))).toBe(true);

        await h.service.approve(adId, 'admin1', T0);
        expect(row().imageUrl).toMatch(/^https:\/\/cdn\.test\.invalid\/rave-ads\/ad_/);
        expect(row().imageKey).toBeUndefined();
        expect([...h.store.keys()]).toEqual([row().imagePublicKey]);

        const after = new Date(T0.getTime() + 31 * DAY);
        await h.service.status(after);
        expect(row().status).toBe('ended');
        expect(h.store.size).toBe(0);
        expect(row().imageUrl).toBeUndefined();
    });

    it('deletes the image on reject and refund at once, and an hour after an unpaid hold expired', async () => {
        const h = adsHarness();
        const rejected = await buyPaid(h);
        await h.service.reject(rejected, 'off-brand', 'admin1', T0);
        const refunded = await buyPaid(h, { slotId: 'banner-1' });
        await h.service.reverse(h.ads.rows.find((r: any) => r.adId === refunded).paymentIntentId, 'refunded', true);
        expect(h.store.size).toBe(0);

        await h.service.checkout(body({ slotId: 'banner-2' }), { buffer: image }, T0);
        expect(h.store.size).toBe(1);
        await h.service.status(new Date(T0.getTime() + 16 * MIN));
        expect(h.store.size).toBe(1); // grace: a payment racing the expiry can still re-take the slot
        await h.service.status(new Date(T0.getTime() + 80 * MIN));
        expect(h.store.size).toBe(0);
    });

    it('caps unpaid holds per client IP (shared bucket larger), so nobody can hold all 20 slots', async () => {
        const h = adsHarness();
        const ip = '203.0.113.7';
        await h.service.checkout(body({ slotId: 'screen-1' }), { buffer: image }, T0, ip);
        await h.service.checkout(body({ slotId: 'screen-2' }), { buffer: image }, T0, ip);
        await expectAdError(
            h.service.checkout(body({ slotId: 'banner-1' }), { buffer: image }, T0, ip),
            429,
            'RAVE_AD_HOLDS'
        );
        await h.service.checkout(body({ slotId: 'banner-1' }), { buffer: image }, T0, '198.51.100.1');
        // After the hold lapses the IP may try again.
        await h.service.checkout(
            body({ slotId: 'banner-2' }),
            { buffer: image },
            new Date(T0.getTime() + 16 * MIN),
            ip
        );
    });

    it('records partial refunds and shrinks a waiting shelter share in proportion', async () => {
        const h = adsHarness({ ...ENV_ADS, RAVE_AD_SHELTER_BPS: '5000' });
        const adId = await buyPaid(h);
        await h.service.approve(adId, 'admin1', T0);
        const pi = h.ads.rows[0].paymentIntentId;
        expect(h.checkouts.rows[0].shelterShare.amountUsdCents).toBe(5000);
        expect(await h.service.reverse(pi, 'refunded', false, 5000 + 330)).toBe('partial');
        expect(h.ads.rows[0].refundedCents).toBe(5330);
        // Kept 10330 - 5330 = 5000, less the 330 card fee Stripe keeps: 4670 of 10000 → half of it.
        expect(h.checkouts.rows[0].shelterShare.amountUsdCents).toBe(2335);
        h.checkouts.rows[0].shelterShare.state = 'sent';
        expect(await h.service.reverse(pi, 'refunded', true, 10330)).toBe('refunded');
        expect(h.checkouts.rows[0].shelterShare).toMatchObject({ state: 'sent', reversed: 'refunded' });
        expect(h.ads.rows[0].shareState).toBe('reversed');
    });
});
