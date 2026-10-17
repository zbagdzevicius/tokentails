import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { accountIdOf } from './pawlegends-account-id';
import { PawlegendsController } from './pawlegends.controller';

jest.mock('src/user/user.service', () => ({ UserService: class {} }));

/* POC.md §8.3: the optional accesstoken of checkout is the AppAuthGuard'd `checkout/account` twin route. */

describe('Pawlegends checkout account id', () => {
    it('checkout/account sits behind AppAuthGuard; plain checkout has no guard', () => {
        const proto = PawlegendsController.prototype as any;
        expect(Reflect.getMetadata(PATH_METADATA, proto.checkoutAccount)).toBe('checkout/account');
        expect(Reflect.getMetadata(GUARDS_METADATA, proto.checkoutAccount)).toEqual([AppAuthGuard]);
        expect(Reflect.getMetadata(GUARDS_METADATA, proto.checkout)).toBeUndefined();
    });

    it('accountIdOf: the user id, never a transient guest', () => {
        expect(accountIdOf({ user: { _id: { toString: () => 'abc' } } })).toBe('abc');
        expect(accountIdOf({ user: { transient: true, id: 'x' } })).toBeNull();
        expect(accountIdOf({})).toBeNull();
    });
});
