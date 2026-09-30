import { CatController } from './cat.controller';

jest.mock('./cat.service', () => ({ CatService: class {} }));
jest.mock('./cat.repository', () => ({ CatRepository: class {} }));
jest.mock('src/user/user.repository', () => ({ UserRepository: class {} }));

// @nestjs/throttler stores @SkipThrottle() as `THROTTLER:SKIP<throttler name>` on the handler.
const skipsDefaultThrottle = (handler: object) => Reflect.getMetadata('THROTTLER:SKIPdefault', handler) === true;

describe('CatController NFT metadata routes', () => {
    it('are not rate limited, so marketplace crawlers on shared IPs are not cut off', () => {
        expect(skipsDefaultThrottle(CatController.prototype.nftmetadata)).toBe(true);
        expect(skipsDefaultThrottle(CatController.prototype.nftId)).toBe(true);
    });

    it('keeps the feed route throttled', () => {
        expect(skipsDefaultThrottle(CatController.prototype.updateStatus)).toBe(false);
    });
});
