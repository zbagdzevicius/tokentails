import { Types } from 'mongoose';
import { guestTreatId, treatIpSalt } from './treat-guest-key';

describe('guest treat key', () => {
    it('is a valid ObjectId, stable for one address and day, and never the raw address', () => {
        const id = guestTreatId('203.0.113.7', '2026-10-08', 'salt');
        expect(Types.ObjectId.isValid(id)).toBe(true);
        expect(id).toHaveLength(24);
        expect(guestTreatId('203.0.113.7', '2026-10-08', 'salt')).toBe(id);
        expect(id).not.toContain('203');
    });

    it('changes with the day, the address and the salt', () => {
        const id = guestTreatId('203.0.113.7', '2026-10-08', 'salt');
        expect(guestTreatId('203.0.113.7', '2026-10-09', 'salt')).not.toBe(id);
        expect(guestTreatId('203.0.113.8', '2026-10-08', 'salt')).not.toBe(id);
        expect(guestTreatId('203.0.113.7', '2026-10-08', 'other')).not.toBe(id);
    });

    it('reads SHELTER_TREAT_IP_SALT, then INVALIDATE_CACHE_SECRET, else one per-process salt', () => {
        expect(treatIpSalt({ SHELTER_TREAT_IP_SALT: 'a', INVALIDATE_CACHE_SECRET: 'b' } as any)).toBe('a');
        expect(treatIpSalt({ INVALIDATE_CACHE_SECRET: 'b' } as any)).toBe('b');
        const random = treatIpSalt({} as any);
        expect(random).toHaveLength(64);
        expect(treatIpSalt({} as any)).toBe(random);
    });
});
