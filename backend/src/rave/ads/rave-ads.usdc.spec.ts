import { HttpException } from '@nestjs/common';
import { erc20PayInterface } from 'src/payments/crypto/crypto-evm';
import { RaveAdsController } from './rave-ads.controller';
import { raveAdUsdcAmount, raveAdUsdcTarget } from './rave-ads.crypto';
import { ADS_TREASURY, adsHarness, ENV_ADS, ENV_ADS_USDC, png, T0 } from './rave-ads.harness-spec';

/*
 * Moon Rave ads, crypto tab: USDC on Arc only, to the Token Tails treasury, bound by an exact tagged amount;
 * the tx receipt is read (faked here) and the ad goes `held → review` like a card payment. Refunds of
 * USDC ads are flagged for doing by hand. Nothing touches a chain or Stripe.
 */

const USDC = '0x3600000000000000000000000000000000000000';
const PAYER = '0x00000000000000000000000000000000000000aa';
const TX = (n: number) => '0x' + n.toString(16).padStart(64, '0');

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
}

let image: Buffer;
beforeAll(async () => {
    image = await png();
});

const body = (extra: Record<string, unknown> = {}) => ({
    slotId: 'screen-1',
    name: 'Purrfect Coffee',
    url: 'https://purrfect.example.com/menu',
    method: 'usdc',
    coverFee: 'true',
    ...extra,
});

/** A mined receipt with one USDC Transfer to `to` of `value`. */
const receipt = (value: bigint | string, to = ADS_TREASURY, token = USDC, blockNumber = 10) => {
    const { topics, data } = erc20PayInterface.encodeEventLog('Transfer', [PAYER, to, BigInt(value)]);
    return { status: 1, blockNumber, from: PAYER, to: token.toLowerCase(), logs: [{ address: token, topics, data }] };
};

describe('RaveAdsService crypto tab (USDC on Arc)', () => {
    it('resolves Arc only, to the treasury, and never a testnet in production', () => {
        expect(raveAdUsdcTarget(ENV_ADS, false)).toBeNull();
        expect(raveAdUsdcTarget(ENV_ADS_USDC, false)).toMatchObject({
            chainId: 5042002,
            token: USDC,
            decimals: 6,
            recipient: ADS_TREASURY,
        });
        // Production sells on mainnet: Arc 5042 with the checked-in treasury, no env.
        expect(raveAdUsdcTarget({ NODE_ENV: 'production' }, true)).toMatchObject({
            chainId: 5042,
            recipient: ADS_TREASURY,
        });
        expect(raveAdUsdcAmount(10000, 6, 1)).toBe(BigInt(100010001));
        expect(raveAdUsdcAmount(10000, 6, 9999)).toBe(BigInt(100019999));
    });

    it('status: crypto open without Stripe (card false with its reason), both open with Stripe', async () => {
        const noStripe = adsHarness({ ...ENV_ADS_USDC, STRIPE_SECRET_KEY: '' });
        const st = await noStripe.service.status(T0);
        expect(st).toMatchObject({
            enabled: true,
            card: false,
            cardReason: 'stripe',
            usdc: { enabled: true, chains: [5042002] },
        });
        expect(st.publishableKey).toBeUndefined();
        const both = await adsHarness(ENV_ADS_USDC).service.status(T0);
        expect(both).toMatchObject({ enabled: true, card: true, usdc: { enabled: true, chains: [5042002] } });
        const cardOnly = await adsHarness(ENV_ADS).service.status(T0);
        expect(cardOnly).toMatchObject({ card: true, usdc: { enabled: false, chains: [] } });
        // Card picked while the card tab is closed: 503 for that tab.
        await expectAdError(
            noStripe.service.checkout(body({ method: 'card' }), { buffer: image }, T0),
            503,
            'RAVE_AD_OFF'
        );
        await expectAdError(adsHarness(ENV_ADS).service.checkout(body(), { buffer: image }, T0), 503, 'RAVE_AD_OFF');
        await expectAdError(
            adsHarness(ENV_ADS_USDC).service.checkout(body({ method: 'btc' }), { buffer: image }, T0),
            400,
            'RAVE_AD_METHOD'
        );
    });

    it('holds the slot and answers the exact tagged amount, no Stripe call and no card fee', async () => {
        const h = adsHarness({ ...ENV_ADS_USDC, STRIPE_SECRET_KEY: '' });
        const out = await h.service.checkout(body(), { buffer: image }, T0);
        expect(out).toMatchObject({
            status: 'held',
            method: 'usdc',
            clientSecret: null,
            priceCents: 10000,
            feeCents: 0,
            amountCents: 10000,
        });
        expect(out.usdc).toMatchObject({
            chainId: 5042002,
            token: USDC,
            decimals: 6,
            recipient: ADS_TREASURY,
            txHash: null,
        });
        const amount = BigInt(out.usdc!.amount);
        expect(amount > BigInt(100010000) && amount <= BigInt(100019999)).toBe(true);
        expect(h.stripe.paymentIntents.create).not.toHaveBeenCalled();
        expect(h.ads.rows[0].usdcAmountKey).toBe(`5042002:${USDC.toLowerCase()}:${amount}`);
        // Another ad never gets the same amount.
        const other = await h.service.checkout(body({ slotId: 'banner-1' }), { buffer: image }, T0);
        expect(other.usdc!.amount).not.toBe(out.usdc!.amount);
    });

    it('a mined transfer of the exact amount to the treasury moves the ad to review; one tx pays one ad', async () => {
        const h = adsHarness(ENV_ADS_USDC);
        const out = await h.service.checkout(body(), { buffer: image }, T0);
        h.reader.receipt.mockResolvedValue(receipt(out.usdc!.amount));
        const view = await h.service.reportUsdcTx(out.adId, { txHash: TX(1) }, T0);
        expect(view).toMatchObject({ status: 'review', method: 'usdc', usdc: { txHash: TX(1), payer: PAYER } });
        expect(h.ads.rows[0].livemode).toBe(false);
        expect(h.reader.receipt).toHaveBeenCalledWith(5042002, expect.any(String), TX(1));
        // Same tx again: idempotent. Another tx for a paid ad: refused.
        expect((await h.service.reportUsdcTx(out.adId, { txHash: TX(1) }, T0)).status).toBe('review');
        await expectAdError(h.service.reportUsdcTx(out.adId, { txHash: TX(2) }, T0), 409, 'RAVE_AD_STATE');
        // The same tx for another ad: refused by the unique index.
        const second = await h.service.checkout(body({ slotId: 'banner-1' }), { buffer: image }, T0);
        await expectAdError(h.service.reportUsdcTx(second.adId, { txHash: TX(1) }, T0), 409, 'RAVE_AD_TX_USED');
    });

    it('refuses a wrong amount, recipient or token, and an underpayment; the buyer can report another tx', async () => {
        const h = adsHarness(ENV_ADS_USDC);
        const out = await h.service.checkout(body(), { buffer: image }, T0);
        const exact = BigInt(out.usdc!.amount);
        h.reader.receipt.mockResolvedValueOnce(receipt(exact, '0x00000000000000000000000000000000000000bb'));
        await expectAdError(h.service.reportUsdcTx(out.adId, { txHash: TX(1) }, T0), 400, 'RAVE_AD_TX_MISMATCH');
        h.reader.receipt.mockResolvedValueOnce(
            receipt(exact, ADS_TREASURY, '0x00000000000000000000000000000000000000cc')
        );
        await expectAdError(h.service.reportUsdcTx(out.adId, { txHash: TX(2) }, T0), 400, 'RAVE_AD_TX_MISMATCH');
        h.reader.receipt.mockResolvedValueOnce(receipt(exact - BigInt(200000)));
        await expectAdError(h.service.reportUsdcTx(out.adId, { txHash: TX(3) }, T0), 400, 'RAVE_AD_TX_MISMATCH');
        expect(h.ads.rows[0].usdc.underpaidTx).toBe(TX(3));
        expect(h.ads.rows[0].status).toBe('held');
        expect(h.ads.rows[0].usdcTxHash).toBeUndefined();
        h.reader.receipt.mockResolvedValueOnce(receipt(exact));
        expect((await h.service.reportUsdcTx(out.adId, { txHash: TX(4) }, T0)).status).toBe('review');
    });

    it('refuses a transfer mined before the ad was made', async () => {
        const h = adsHarness(ENV_ADS_USDC);
        const out = await h.service.checkout(body(), { buffer: image }, T0);
        h.reader.receipt.mockResolvedValue(receipt(out.usdc!.amount));
        h.reader.blockTime.mockResolvedValue(Math.floor(T0.getTime() / 1000) - 3600);
        await expectAdError(h.service.reportUsdcTx(out.adId, { txHash: TX(1) }, T0), 400, 'RAVE_AD_TX_MISMATCH');
        expect(h.ads.rows[0].status).toBe('held');
    });

    it('a tx not mined yet stays pending; GET /rave/ads/:adId reads it again (at most every 10 s)', async () => {
        const h = adsHarness(ENV_ADS_USDC);
        const out = await h.service.checkout(body(), { buffer: image }, T0);
        expect((await h.service.reportUsdcTx(out.adId, { txHash: TX(1) }, T0)).status).toBe('held');
        h.reader.receipt.mockResolvedValue(receipt(out.usdc!.amount));
        expect((await h.service.getAd(out.adId, new Date(T0.getTime() + 2000))).status).toBe('held');
        expect((await h.service.getAd(out.adId, new Date(T0.getTime() + 11000))).status).toBe('review');
    });

    it('paid after the hold lapsed: re-takes a free slot, else the ad is refunded by hand to the payer', async () => {
        const h = adsHarness(ENV_ADS_USDC);
        const out = await h.service.checkout(body(), { buffer: image }, T0);
        const late = new Date(T0.getTime() + 20 * 60 * 1000);
        await h.service.sweep(late);
        expect(h.ads.rows[0].status).toBe('expired');
        // Someone else takes the slot (card).
        const taker = await h.service.checkout(body({ method: 'card' }), { buffer: image }, late);
        expect(taker.status).toBe('held');
        h.reader.receipt.mockResolvedValue(receipt(out.usdc!.amount));
        const view = await h.service.reportUsdcTx(out.adId, { txHash: TX(1) }, late);
        expect(view).toMatchObject({ status: 'refunded', refund: { state: 'manual', reason: 'slot-lost' } });
        expect(h.ads.rows.find((r: any) => r.adId === out.adId).refund.payer).toBe(PAYER);

        const free = adsHarness(ENV_ADS_USDC);
        const o2 = await free.service.checkout(body(), { buffer: image }, T0);
        await free.service.sweep(late);
        free.reader.receipt.mockResolvedValue(receipt(o2.usdc!.amount));
        expect((await free.service.reportUsdcTx(o2.adId, { txHash: TX(2) }, late)).status).toBe('review');
        expect(free.ads.rows[0].slotLock).toBe('screen-1');
    });

    it('approve makes a USDC ad live; reject frees the slot and flags a refund by hand, never calls Stripe', async () => {
        const h = adsHarness(ENV_ADS_USDC);
        const out = await h.service.checkout(body(), { buffer: image }, T0);
        h.reader.receipt.mockResolvedValue(receipt(out.usdc!.amount));
        await h.service.reportUsdcTx(out.adId, { txHash: TX(1) }, T0);
        const res = await h.service.reject(out.adId, 'not a cafe', 'admin', T0);
        expect(res).toEqual({ adId: out.adId, status: 'rejected', refund: 'manual' });
        expect(h.ads.rows[0].refund).toMatchObject({ state: 'manual', reason: 'rejected', payer: PAYER });
        expect(h.ads.rows[0].slotLock).toBeUndefined();
        expect(h.stripe.refunds.create).not.toHaveBeenCalled();

        const ok = await h.service.checkout(body({ slotId: 'banner-1' }), { buffer: image }, T0);
        h.reader.receipt.mockResolvedValue(receipt(ok.usdc!.amount));
        await h.service.reportUsdcTx(ok.adId, { txHash: TX(2) }, T0);
        expect((await h.service.approve(ok.adId, 'admin', T0)).status).toBe('live');
    });

    it('ad amounts never fall in a $100 crypto pack checkout range (pack tags are 1 to 9,999)', () => {
        for (const tag of [1, 5000, 9999]) {
            const amount = raveAdUsdcAmount(10000, 6, tag);
            expect(amount > BigInt(100009999)).toBe(true);
            expect(amount < BigInt(100020000)).toBe(true);
        }
    });

    it('refuses a tx that already paid a crypto checkout (pack or cat)', async () => {
        const h = adsHarness(ENV_ADS_USDC);
        const out = await h.service.checkout(body(), { buffer: image }, T0);
        h.checkouts.rows.push({ orderId: 'chk_1', payment: { chainId: 5042002, txHash: TX(7) } });
        h.reader.receipt.mockResolvedValue(receipt(out.usdc!.amount));
        await expectAdError(h.service.reportUsdcTx(out.adId, { txHash: TX(7) }, T0), 400, 'RAVE_AD_TX_MISMATCH');
        expect(h.ads.rows[0].status).toBe('held');
        expect(h.ads.rows[0].usdcTxHash).toBeUndefined();
    });

    it('an unknown block time (RPC error) keeps the tx pending instead of accepting it', async () => {
        const h = adsHarness(ENV_ADS_USDC);
        const out = await h.service.checkout(body(), { buffer: image }, T0);
        h.reader.receipt.mockResolvedValue(receipt(out.usdc!.amount));
        h.reader.blockTime.mockRejectedValueOnce(new Error('rpc down'));
        expect((await h.service.reportUsdcTx(out.adId, { txHash: TX(1) }, T0)).status).toBe('held');
        expect(h.ads.rows[0].usdcTxHash).toBe(TX(1));
        expect((await h.service.getAd(out.adId, new Date(T0.getTime() + 11000))).status).toBe('review');
    });

    it('a reported tx keeps the hold at least 10 more minutes', async () => {
        const h = adsHarness(ENV_ADS_USDC);
        const out = await h.service.checkout(body(), { buffer: image }, T0);
        const near = new Date(T0.getTime() + 14 * 60 * 1000);
        await h.service.reportUsdcTx(out.adId, { txHash: TX(1) }, near);
        expect(new Date(h.ads.rows[0].holdUntil).getTime()).toBe(near.getTime() + 10 * 60 * 1000);
        await h.service.sweep(new Date(T0.getTime() + 16 * 60 * 1000));
        expect(h.ads.rows[0].status).toBe('held');
    });

    it('someone else reporting a buyer tx on their own ad does not block the buyer', async () => {
        const h = adsHarness(ENV_ADS_USDC);
        const squatter = await h.service.checkout(body(), { buffer: image }, T0);
        const buyer = await h.service.checkout(body({ slotId: 'banner-1' }), { buffer: image }, T0);
        // Not mined yet: the squatter's report holds the hash.
        await h.service.reportUsdcTx(squatter.adId, { txHash: TX(1) }, T0);
        h.reader.receipt.mockResolvedValue(receipt(buyer.usdc!.amount));
        const view = await h.service.reportUsdcTx(buyer.adId, { txHash: TX(1) }, T0);
        expect(view.status).toBe('review');
        expect(h.ads.rows.find((r: any) => r.adId === squatter.adId).usdcTxHash).toBeUndefined();
    });

    it('an unpaid USDC hold gives its amount tag back a day later; a report after that is refused', async () => {
        const h = adsHarness(ENV_ADS_USDC);
        const out = await h.service.checkout(body(), { buffer: image }, T0);
        await h.service.sweep(new Date(T0.getTime() + 20 * 60 * 1000));
        expect(h.ads.rows[0].usdcAmountKey).toBeDefined();
        h.clock.now = new Date(T0.getTime() + 20 * 60 * 1000);
        h.ads.rows[0].updatedAt = h.clock.now;
        await h.service.sweep(new Date(T0.getTime() + 25 * 3600 * 1000));
        expect(h.ads.rows[0].usdcAmountKey).toBeUndefined();
        await expectAdError(
            h.service.reportUsdcTx(out.adId, { txHash: TX(1) }, new Date(T0.getTime() + 25 * 3600 * 1000)),
            409,
            'RAVE_AD_STATE'
        );
    });

    it('switching method after a hold frees the buyer own slot for the retry', async () => {
        const h = adsHarness(ENV_ADS_USDC);
        const key = '11111111-2222-3333-4444-555555555555';
        await h.service.checkout(body({ clientKey: key }), { buffer: image }, T0);
        await expectAdError(
            h.service.checkout(body({ clientKey: key, method: 'card' }), { buffer: image }, T0),
            409,
            'RAVE_AD_KEY_REUSED'
        );
        expect(h.ads.rows[0].status).toBe('canceled');
        const retry = await h.service.checkout(
            body({ clientKey: '66666666-2222-3333-4444-555555555555', method: 'card' }),
            { buffer: image },
            T0
        );
        expect(retry.status).toBe('held');
    });

    it('a rejected USDC ad voids its shelter share (no card intent on the row)', async () => {
        const h = adsHarness({ ...ENV_ADS_USDC, RAVE_AD_SHELTER_BPS: '1000' });
        const out = await h.service.checkout(body(), { buffer: image }, T0);
        h.reader.receipt.mockResolvedValue(receipt(out.usdc!.amount));
        await h.service.reportUsdcTx(out.adId, { txHash: TX(1) }, T0);
        await h.service.approve(out.adId, 'admin', T0);
        expect(h.checkouts.rows[0].shelterShare.state).toBe('due');
        await h.service.reject(out.adId, 'no', 'admin', T0);
        expect(h.checkouts.rows[0].shelterShare.state).toBe('void');
    });

    it('POST /rave/ads/:adId/usdc-tx counts its own per-IP limit and refuses a card ad', async () => {
        const h = adsHarness(ENV_ADS_USDC);
        const ipThrottler: any = { consume: jest.fn(async () => undefined) };
        const ctl = new RaveAdsController(h.service, ipThrottler);
        const card = await h.service.checkout(body({ method: 'card' }), { buffer: image }, T0);
        const error: any = await ctl.usdcTx(card.adId, { txHash: TX(1) }, { ip: '1.2.3.4' }, {}).catch(e => e);
        expect(error.getStatus()).toBe(404);
        expect(ipThrottler.consume).toHaveBeenCalledWith(
            'RaveAdsController.usdcTx',
            { ip: '1.2.3.4' },
            { limit: 10, ttl: 10 * 60_000 },
            {}
        );
        await expectAdError(ctl.usdcTx(card.adId, { txHash: 'nope' }, {}, {}), 400, 'RAVE_AD_INVALID');
    });
});
