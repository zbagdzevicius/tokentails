import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import {
    SHELTER_DONATE_THROTTLE,
    SHELTER_STATUS_THROTTLE,
    SHELTER_X402_THROTTLE,
    ShelterDonateDto,
    ShelterOnchainController,
} from './shelter-onchain.controller';

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
    it('requires sign-in for POST /shelter/donate only', () => {
        const donateGuards = Reflect.getMetadata(GUARDS_METADATA, proto.donate) || [];
        expect(donateGuards).toHaveLength(1);
        expect(Reflect.getMetadata(GUARDS_METADATA, proto.donateStatus)).toBeUndefined();
        expect(Reflect.getMetadata(GUARDS_METADATA, proto.catCard)).toBeUndefined();
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

    it('passes the signed-in user and source to the service', async () => {
        const donateService = { donate: jest.fn().mockResolvedValue({ txHash: '0x1' }) };
        const controller = new ShelterOnchainController(donateService as any, {} as any);
        await controller.donate('user-1', { source: 'heist' });
        expect(donateService.donate).toHaveBeenCalledWith('user-1', 'heist');
    });

    it('returns the card and the base64 X-PAYMENT-RESPONSE header', async () => {
        const card = { name: 'Mochi', imageUrl: null, shelterName: 'Pink Paw (Rožinė pėdutė)' };
        const x402Service = { catCard: jest.fn().mockResolvedValue({ card, txHash: '0xabc' }) };
        const controller = new ShelterOnchainController({} as any, x402Service as any);
        const res = { setHeader: jest.fn() };
        const req = { protocol: 'https', get: () => 'api.example.test', originalUrl: '/shelter/agent/cat-card?x=1' };

        await expect(controller.catCard('payment', req, res)).resolves.toBe(card);

        expect(x402Service.catCard).toHaveBeenCalledWith('payment', 'https://api.example.test/shelter/agent/cat-card');
        const [name, value] = res.setHeader.mock.calls[0];
        expect(name).toBe('X-PAYMENT-RESPONSE');
        expect(JSON.parse(Buffer.from(value, 'base64').toString())).toEqual({ success: true, txHash: '0xabc' });
    });
});
