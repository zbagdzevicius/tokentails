import { campaignCustody, custodyOf, publicShelter, PublicShelter } from './impact-public';
import { FACTS, PublicFact } from './facts.generated';

const HELD = '0xe299299b846ba629f5a591dbf4f562bcc07a0f37';
const PINK_PAW = '0x3c833562e682db66c2415b34961595df135f4771';
const OTHER = '0x' + '44'.repeat(20);

function fact(campaign: Partial<NonNullable<PublicFact['campaign']>>): Record<string, PublicFact> {
    return {
        'C-001': {
            ...FACTS['C-001'],
            campaign: { ...FACTS['C-001'].campaign!, ...campaign },
        },
    };
}

const dbShelter = (over: Partial<PublicShelter> = {}): PublicShelter => ({
    slug: 'rozine-pedute',
    name: 'Pink Paw',
    countryCode: 'LT',
    partnerStatus: null,
    role: null,
    handoverStatus: 'held-by-token-tails',
    publicWallet: null,
    ...over,
});

describe('campaignCustody (published campaign facts)', () => {
    it("reads Pink Paw's wallet as the shelter wallet and 0xE299's closed window as past", () => {
        expect(campaignCustody()).toEqual({ shelter: [PINK_PAW], pastHeld: [HELD] });
    });

    it('counts nothing while the campaign is not handed over', () => {
        expect(campaignCustody(fact({ handover: 'held-by-token-tails' }))).toEqual({ shelter: [], pastHeld: [] });
    });

    it('never lets a Token Tails held wallet be a shelter wallet, whatever the data says', () => {
        const custody = campaignCustody(
            fact({ wallets: [{ wallet: HELD, fromBlock: 1, toBlock: null, holder: 'shelter' }] })
        );
        expect(custody.shelter).toEqual([]);
    });

    it('keeps an open Token Tails window current (not past)', () => {
        const custody = campaignCustody(
            fact({ wallets: [{ wallet: HELD, fromBlock: 1, toBlock: null, holder: 'token-tails' }] })
        );
        expect(custody).toEqual({ shelter: [], pastHeld: [] });
    });
});

describe('custodyOf (the current tier)', () => {
    it("is handed-over when the split pays Pink Paw's wallet, with no admin PUT on the shelter row", () => {
        expect(custodyOf([PINK_PAW], [dbShelter()])).toBe('handed-over');
        // Past payouts to 0xE299 (its window closed at the rotation) do not decide the current tier.
        expect(custodyOf([HELD, PINK_PAW], [dbShelter()])).toBe('handed-over');
    });

    it('stays held when only the held wallet was ever paid, or an unknown wallet is paid', () => {
        expect(custodyOf([HELD], [dbShelter()])).toBe('held-by-token-tails');
        expect(custodyOf([PINK_PAW, OTHER], [dbShelter()])).toBe('held-by-token-tails');
        expect(custodyOf([], [dbShelter()])).toBe('held-by-token-tails');
    });

    it('without the campaign data, needs the shelter row as before', () => {
        const none = { shelter: [], pastHeld: [] };
        expect(custodyOf([PINK_PAW], [dbShelter()], none)).toBe('held-by-token-tails');
        expect(
            custodyOf([PINK_PAW], [dbShelter({ handoverStatus: 'handed-over', publicWallet: PINK_PAW })], none)
        ).toBe('handed-over');
        expect(
            custodyOf([HELD, PINK_PAW], [dbShelter({ handoverStatus: 'handed-over', publicWallet: PINK_PAW })], none)
        ).toBe('held-by-token-tails');
    });
});

describe('publicShelter (the /impact shelter list)', () => {
    const row = { slug: 'rozine-pedute', name: 'Pink Paw', countryCode: 'LT', handoverStatus: 'held-by-token-tails' };

    it("shows Pink Paw's wallet from the campaign facts, with no admin PUT on the row", () => {
        const s = publicShelter({ ...row, publicWallet: HELD });
        expect(s.handoverStatus).toBe('handed-over');
        expect(s.publicWallet?.toLowerCase()).toBe(PINK_PAW);
    });

    it('keeps the row as it is while the campaign is not handed over', () => {
        const none = { shelter: [], pastHeld: [] };
        expect(publicShelter(row, none).handoverStatus).toBe('held-by-token-tails');
        expect(publicShelter({ ...row, slug: 'other' }).handoverStatus).toBe('held-by-token-tails');
    });

    it('marks any shelter row whose wallet is a campaign shelter wallet', () => {
        const s = publicShelter({ ...row, slug: 'other', publicWallet: OTHER }, { shelter: [OTHER], pastHeld: [] });
        expect(s.handoverStatus).toBe('handed-over');
    });
});
