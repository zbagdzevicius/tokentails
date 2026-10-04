import { BadRequestException, ForbiddenException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import {
    SHELTER_DONATE_USER_THROTTLE,
    SHELTER_DONATE_THROTTLE,
    SHELTER_STATUS_THROTTLE,
    SHELTER_X402_THROTTLE,
    SHELTER_RELAY_THROTTLE,
    SHELTER_CLAIM_THROTTLE,
    ShelterClaimDto,
    ShelterDonateDto,
    ShelterRelayDto,
    ShelterOnchainController,
} from './shelter-onchain.controller';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ImpactEligibilityService } from 'src/impact/eligibility.service';
import { USER_THROTTLE_KEY, UserThrottlerGuard } from 'src/shared/guards/user-throttler.guard';

jest.mock('ethers', () => {
    const actual = jest.requireActual('ethers');
    return { ...actual, JsonRpcProvider: jest.fn(), Wallet: jest.fn() };
});

const proto = ShelterOnchainController.prototype;

async function validateBody(body: unknown) {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, ShelterOnchainController, 'donate') || {};
    // RouteParamtypes.BODY is 3.
    const [, bodyArg] = Object.entries<any>(args).find(([key]) => key.startsWith('3:')) as [string, any];
    let value = body;
    for (const pipe of [new ValidationPipe({ transform: true }), ...(bodyArg.pipes || [])]) {
        value = await pipe.transform(value, { type: 'body', metatype: ShelterDonateDto, data: undefined });
    }
    return value;
}

describe('ShelterOnchainController', () => {
    it('requires sign-in for POST /shelter/donate and GET /shelter/donate/me only', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, proto.donate)).toEqual([AppAuthGuard, UserThrottlerGuard]);
        expect(Reflect.getMetadata(GUARDS_METADATA, proto.donateMe)).toEqual([AppAuthGuard]);
        expect(Reflect.getMetadata(GUARDS_METADATA, proto.donateStatus)).toBeUndefined();
        expect(Reflect.getMetadata(GUARDS_METADATA, proto.catCard)).toBeUndefined();
    });

    it('limits POST /shelter/donate per user as well as per IP (G5 P4)', () => {
        expect(Reflect.getMetadata(USER_THROTTLE_KEY, proto.donate)).toEqual(SHELTER_DONATE_USER_THROTTLE);
    });

    it('tightens the per-IP throttle on every route', () => {
        expect(Reflect.getMetadata('THROTTLER:LIMITdefault', proto.donate)).toBe(SHELTER_DONATE_THROTTLE.limit);
        expect(Reflect.getMetadata('THROTTLER:LIMITdefault', proto.donateStatus)).toBe(SHELTER_STATUS_THROTTLE.limit);
        expect(Reflect.getMetadata('THROTTLER:LIMITdefault', proto.catCard)).toBe(SHELTER_X402_THROTTLE.limit);
    });

    it('accepts source heist or page and nothing else', async () => {
        await expect(validateBody({ source: 'heist' })).resolves.toMatchObject({ source: 'heist' });
        await expect(validateBody({ source: 'page' })).resolves.toMatchObject({ source: 'page' });
        await expect(validateBody({ source: 'admin' })).rejects.toBeInstanceOf(BadRequestException);
        await expect(validateBody({ source: 'page', amountWei: '1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('runs the instant-treat policy before the service', async () => {
        const donateService = { donate: jest.fn().mockResolvedValue({ txHash: '0x1' }) };
        const eligibility = { assertInstantTreat: jest.fn().mockResolvedValue({ eligible: true, reason: null }) };
        const controller = new ShelterOnchainController(
            donateService as any,
            {} as any,
            eligibility as any,
            {} as any,
            {} as any,
            {} as any
        );
        const user = { _id: 'user-1', isGuest: false };
        await controller.donate(user, { source: 'heist' });
        expect(eligibility.assertInstantTreat).toHaveBeenCalledWith(user);
        expect(donateService.donate).toHaveBeenCalledWith('user-1', 'heist');
    });

    it('never calls the service when the policy refuses', async () => {
        const donateService = { donate: jest.fn() };
        const eligibility = { assertInstantTreat: jest.fn().mockRejectedValue(new ForbiddenException()) };
        const controller = new ShelterOnchainController(
            donateService as any,
            {} as any,
            eligibility as any,
            {} as any,
            {} as any,
            {} as any
        );
        await expect(controller.donate({ _id: 'u' }, { source: 'page' })).rejects.toBeInstanceOf(ForbiddenException);
        expect(donateService.donate).not.toHaveBeenCalled();
    });

    it('GET /shelter/donate/me returns the caller treats plus eligibility', async () => {
        const donateService = { me: jest.fn().mockResolvedValue({ day: '2026-10-02', confirmedCount: 2 }) };
        const eligibility = { instantTreat: jest.fn().mockResolvedValue({ eligible: false, reason: 'no-saved-game' }) };
        const controller = new ShelterOnchainController(
            donateService as any,
            {} as any,
            eligibility as any,
            {} as any,
            {} as any,
            {} as any
        );
        await expect(controller.donateMe({ _id: 'u9' })).resolves.toEqual({
            day: '2026-10-02',
            confirmedCount: 2,
            eligibility: { eligible: false, reason: 'no-saved-game' },
        });
        expect(donateService.me).toHaveBeenCalledWith('u9');
    });

    it('returns the card and the base64 X-PAYMENT-RESPONSE header', async () => {
        const card = { name: 'Mochi', imageUrl: null, shelterName: 'Pink Paw (Rožinė pėdutė)' };
        const x402Service = { catCard: jest.fn().mockResolvedValue({ card, txHash: '0xabc' }) };
        const controller = new ShelterOnchainController(
            {} as any,
            x402Service as any,
            {} as ImpactEligibilityService,
            {} as any,
            {} as any,
            {} as any
        );
        const res = { setHeader: jest.fn() };
        const req = { protocol: 'https', get: () => 'api.example.test', originalUrl: '/shelter/agent/cat-card?x=1' };

        await expect(controller.catCard('payment', req, res)).resolves.toBe(card);

        expect(x402Service.catCard).toHaveBeenCalledWith('payment', 'https://api.example.test/shelter/agent/cat-card');
        const [name, value] = res.setHeader.mock.calls[0];
        expect(name).toBe('X-PAYMENT-RESPONSE');
        expect(JSON.parse(Buffer.from(value, 'base64').toString())).toEqual({ success: true, txHash: '0xabc' });
    });
});

async function validate(handler: string, metatype: any, body: unknown) {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, ShelterOnchainController, handler) || {};
    const [, bodyArg] = Object.entries<any>(args).find(([key]) => key.startsWith('3:')) as [string, any];
    let value = body;
    for (const pipe of [new ValidationPipe({ transform: true }), ...(bodyArg.pipes || [])]) {
        value = await pipe.transform(value, { type: 'body', metatype, data: undefined });
    }
    return value;
}

const RELAY_BODY = {
    chainId: 5042002,
    from: '0x' + '12'.repeat(20),
    value: '1000000',
    validAfter: '0',
    validBefore: '1790000000',
    salt: '0x' + 'ab'.repeat(32),
    memo: 'tt:wallet:0a1b2c3d',
    recipients: '0x' + 'cd'.repeat(32),
    signature: '0x' + '11'.repeat(65),
};

describe('ShelterOnchainController wallet gifts (F2)', () => {
    it('keeps relay, match and claim routes public and throttled per IP', () => {
        for (const handler of [proto.relay, proto.relayStatus, proto.matchStatus, proto.matchByDonor, proto.claim]) {
            expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
        }
        expect(Reflect.getMetadata('THROTTLER:LIMITdefault', proto.relay)).toBe(SHELTER_RELAY_THROTTLE.limit);
        expect(SHELTER_RELAY_THROTTLE).toEqual({ limit: 10, ttl: 60000 });
        expect(Reflect.getMetadata('THROTTLER:LIMITdefault', proto.claim)).toBe(SHELTER_CLAIM_THROTTLE.limit);
        expect(Reflect.getMetadata('THROTTLER:LIMITdefault', proto.matchStatus)).toBe(SHELTER_STATUS_THROTTLE.limit);
    });

    it('accepts a well-formed relay body and refuses extra keys, bad memos and bad hex', async () => {
        await expect(validate('relay', ShelterRelayDto, RELAY_BODY)).resolves.toMatchObject({ memo: RELAY_BODY.memo });
        for (const bad of [
            { ...RELAY_BODY, extra: 1 },
            { ...RELAY_BODY, memo: 'tt:heist:0a1b2c3d' },
            { ...RELAY_BODY, memo: 'tt:wallet:0A1B2C3D' },
            { ...RELAY_BODY, from: '0x12' },
            { ...RELAY_BODY, value: '-1' },
            { ...RELAY_BODY, salt: '0x1234' },
            { ...RELAY_BODY, recipients: '0x1234' },
            { ...RELAY_BODY, recipients: undefined },
            { ...RELAY_BODY, signature: '0x1234' },
            { ...RELAY_BODY, chainId: '5042002x' },
        ]) {
            await expect(validate('relay', ShelterRelayDto, bad)).rejects.toBeInstanceOf(BadRequestException);
        }
    });

    it('accepts a claim body with a 65-byte signature only', async () => {
        const body = { chainId: 5042, wallet: '0x' + '12'.repeat(20), signature: '0x' + '11'.repeat(65) };
        await expect(validate('claim', ShelterClaimDto, body)).resolves.toMatchObject({ chainId: 5042 });
        await expect(validate('claim', ShelterClaimDto, { ...body, signature: '0x11' })).rejects.toBeInstanceOf(
            BadRequestException
        );
        await expect(validate('claim', ShelterClaimDto, { ...body, message: 'x' })).rejects.toBeInstanceOf(
            BadRequestException
        );
    });

    it('passes the body and the caller IP to the relay service', async () => {
        const relay = { relay: jest.fn().mockResolvedValue({ txHash: '0xab', status: 'submitted' }) };
        const controller = new ShelterOnchainController(
            {} as any,
            {} as any,
            {} as any,
            relay as any,
            {} as any,
            {} as any
        );
        await expect(controller.relay(RELAY_BODY as any, { ip: '203.0.113.9' })).resolves.toEqual({
            txHash: '0xab',
            status: 'submitted',
        });
        expect(relay.relay).toHaveBeenCalledWith(RELAY_BODY, '203.0.113.9');
    });

    it('answers GET /shelter/match/status per chain: main by default, try-it on request, off elsewhere', async () => {
        const saved = { ...process.env };
        try {
            process.env.SHELTER_CHAIN_ID = '5042';
            process.env.SHELTER_TRY_CHAIN_ID = '5042002';
            const match = {
                status: jest
                    .fn()
                    .mockImplementation((_now: Date, c?: any) => ({ state: 'live', chainId: c?.chainId ?? 5042 })),
            };
            const controller = new ShelterOnchainController(
                {} as any,
                {} as any,
                {} as any,
                {} as any,
                match as any,
                {} as any
            );
            await expect(controller.matchStatus()).resolves.toMatchObject({ chainId: 5042 });
            await expect(controller.matchStatus('5042002')).resolves.toMatchObject({ chainId: 5042002, state: 'live' });
            await expect(controller.matchStatus('84532')).resolves.toEqual({
                state: 'off',
                chainId: 84532,
                relay: false,
                perGift: '0',
                dailyLeft: '0',
                poolLeft: '0',
            });
        } finally {
            process.env = saved;
        }
    });

    it('answers GET /shelter/claim with an explicit JSON null when there is no claim', async () => {
        const claims = { latest: jest.fn().mockResolvedValue(null) };
        const controller = new ShelterOnchainController(
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            claims as any
        );
        const res = { json: jest.fn() };
        await controller.latestClaim(res);
        expect(res.json).toHaveBeenCalledWith(null);
    });
});

describe('UserThrottlerGuard', () => {
    const context = (user: unknown, handler: any = proto.donate) => {
        const header = jest.fn();
        return {
            header,
            ctx: {
                getHandler: () => handler,
                getClass: () => ShelterOnchainController,
                switchToHttp: () => ({ getRequest: () => ({ user }), getResponse: () => ({ header }) }),
            } as any,
        };
    };
    function storage() {
        const hits = new Map<string, number>();
        return {
            hits,
            increment: jest.fn(async (key: string) => {
                hits.set(key, (hits.get(key) || 0) + 1);
                return { totalHits: hits.get(key)!, timeToExpire: 60 };
            }),
        };
    }

    it.each([[undefined], [{}], [{ isGuest: true, transient: true }]])(
        'fails closed without req.user._id (%j)',
        async user => {
            const store = storage();
            await expect(
                new UserThrottlerGuard(store as any, new Reflector()).canActivate(context(user).ctx)
            ).rejects.toBeInstanceOf(UnauthorizedException);
            expect(store.increment).not.toHaveBeenCalled();
        }
    );

    it('counts per user id, whatever the IP, and answers 429 past the limit', async () => {
        const store = storage();
        const guard = new UserThrottlerGuard(store as any, new Reflector());
        for (let i = 0; i < SHELTER_DONATE_USER_THROTTLE.limit; i++) {
            await expect(guard.canActivate(context({ _id: 'u1' }).ctx)).resolves.toBe(true);
        }
        const { ctx, header } = context({ _id: 'u1' });
        await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ThrottlerException);
        expect(header).toHaveBeenCalledWith('Retry-After', 60);
        // Another user has their own bucket.
        await expect(guard.canActivate(context({ _id: 'u2' }).ctx)).resolves.toBe(true);
        expect([...store.hits.keys()]).toEqual([
            'user-throttle:ShelterOnchainController.donate:u1',
            'user-throttle:ShelterOnchainController.donate:u2',
        ]);
    });
});
