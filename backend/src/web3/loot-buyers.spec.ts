import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '@nestjs/passport';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { Web3Controller } from './web3.controller';

// The real services pull in AI, Stellar and Stripe code; the guard metadata does not need them.
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('./web3.service', () => ({ Web3Service: class {} }));
jest.mock('node-fetch', () => jest.fn());
// The controller builds a Stripe client at import time.
jest.mock('stripe', () => {
    const Stripe = jest.fn(() => ({}));
    return { __esModule: true, default: Stripe };
});

function allows(guards: any[], permission?: number) {
    const context = { switchToHttp: () => ({ getRequest: () => ({ user: { permission } }) }) } as any;
    return guards.filter(guard => guard !== AuthGuard('appauth')).every(Guard => new Guard().canActivate(context));
}

describe('GET /web3/loot/buyers', () => {
    const guards = () => Reflect.getMetadata(GUARDS_METADATA, Web3Controller.prototype.lootBuyers) || [];

    it('requires appauth', () => {
        expect(guards()).toContain(AuthGuard('appauth'));
    });

    it('is ADMIN only, because it returns buyer emails and wallet addresses', () => {
        expect(guards().length).toBeGreaterThan(1);
        expect(allows(guards(), PERMISSION_LEVEL.USER)).toBe(false);
        expect(allows(guards(), PERMISSION_LEVEL.MANAGER)).toBe(false);
        expect(allows(guards(), PERMISSION_LEVEL.ADMIN)).toBe(true);
    });
});
