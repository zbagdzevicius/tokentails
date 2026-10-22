import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { getStorageToken } from '@nestjs/throttler/dist/throttler.providers';
import { CryptoCheckout } from 'src/payments/crypto/crypto-checkout.schema';
import { CryptoShelterShareService } from 'src/payments/crypto/crypto-shelter-share.service';
import { StripePaymentService } from 'src/payments/stripe-payment.service';
import { ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { User } from 'src/user/user.schema';
import { ClubController } from './club.controller';
import { ClubMember, ClubWebhookEvent } from './club.schema';
import { ClubService } from './club.service';
import { ClubWebhookService } from './club-webhook.service';

/*
 * The club ships before its Stripe env is set (docs/BACKEND.md "Tails Club"): the controller and both services
 * must construct and answer over HTTP with none of the club variables, and nothing may reach Stripe, SendGrid or
 * the database. Real Nest wiring (DI, routing, rawBody, exception filter); only the collaborators are stubs.
 */

const CLUB_ENV = [
    'STRIPE_SECRET_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_CLUB_PRICE_MONTH',
    'STRIPE_CLUB_PRICE_YEAR',
    'CLUB_STRIPE_WEBHOOK_SECRET',
    'CLUB_TOKEN_SECRET',
    'INVALIDATE_CACHE_SECRET',
    'SENDGRID_API_KEY',
];

const untouchable = (name: string) =>
    new Proxy(
        {},
        {
            // Nest probes lifecycle hooks (onModuleInit, ...) and `then`: absent. Any other member is a call
            // that must never happen while the club is closed.
            get: (_t, prop) => {
                if (typeof prop === 'symbol' || prop === 'then' || /^on[A-Z]|^before[A-Z]/.test(prop)) return undefined;
                return () => {
                    throw new Error(`${name}.${prop} must not be used while the club is closed`);
                };
            },
        }
    );

describe('Tails Club with no club env', () => {
    const saved: Record<string, string | undefined> = {};
    let app: any;
    let base: string;

    beforeAll(async () => {
        for (const name of CLUB_ENV) {
            saved[name] = process.env[name];
            delete process.env[name];
        }
        @Module({
            controllers: [ClubController],
            providers: [
                ClubService,
                ClubWebhookService,
                { provide: getModelToken(ClubMember.name), useValue: untouchable('ClubMember') },
                { provide: getModelToken(ClubWebhookEvent.name), useValue: untouchable('ClubWebhookEvent') },
                { provide: getModelToken(CryptoCheckout.name), useValue: untouchable('CryptoCheckout') },
                { provide: getModelToken(User.name), useValue: untouchable('User') },
                { provide: StripePaymentService, useValue: untouchable('StripePaymentService') },
                { provide: CryptoShelterShareService, useValue: untouchable('CryptoShelterShareService') },
                { provide: getStorageToken(), useValue: untouchable('ThrottlerStorage') },
                { provide: ClientIpThrottlerGuard, useValue: { consume: async () => undefined } },
            ],
        })
        class ClubOnlyModule {}

        app = await NestFactory.create(ClubOnlyModule, { rawBody: true, logger: false });
        await app.listen(0, '127.0.0.1');
        base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    });

    afterAll(async () => {
        await app?.close();
        for (const name of CLUB_ENV) {
            if (saved[name] === undefined) delete process.env[name];
            else process.env[name] = saved[name];
        }
    });

    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
        fetch(base + path, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify(body),
        });

    it('GET /club/status says closed for config', async () => {
        const res = await fetch(`${base}/club/status`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ enabled: false, reason: 'config', shelterBps: 5000 });
    });

    it('POST /club/checkout refuses with 503 CLUB_OFF', async () => {
        const res = await post('/club/checkout', {
            plan: 'month',
            email: 'a@example.com',
            clientKey: '7b0c5f0e-1d2a-4c55-9a51-2f2d0f6a1a01',
        });
        expect(res.status).toBe(503);
        expect(await res.json()).toMatchObject({ code: 'CLUB_OFF', key: 'off', reason: 'config' });
    });

    it('the webhook is 503 without its secret', async () => {
        const res = await post('/club/stripe/webhook', { id: 'evt_1' }, { 'stripe-signature': 't=1,v1=x' });
        expect(res.status).toBe(503);
        expect(await res.json()).toMatchObject({ code: 'CLUB_WEBHOOK_UNAVAILABLE' });
    });

    it('the portal is 503 and an emailed link goes back to the card', async () => {
        const portal = await post('/club/portal', { email: 'a@example.com' });
        expect(portal.status).toBe(503);
        expect(await portal.json()).toMatchObject({ code: 'CLUB_OFF' });
        const open = await fetch(`${base}/club/portal/open?t=anything`, { redirect: 'manual' });
        expect(open.status).toBe(303);
        expect(open.headers.get('location')).toBe('https://tokentails.com/?club_portal=expired#club');
    });

    it('a malformed subscription lookup is 404 without a database read', async () => {
        const sub = await fetch(`${base}/club/subscriptions/not-a-sub?k=x`);
        expect(sub.status).toBe(404);
        expect(await sub.json()).toMatchObject({ code: 'CLUB_NOT_FOUND' });
    });
});
