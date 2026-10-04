import { Types } from 'mongoose';
import { BlessingStatus } from 'src/blessing/blessing.schema';
import { ShelterCatSaleService } from './shelter-cat-sale.service';

jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));

const CAT = new Types.ObjectId();
const BLESSING = new Types.ObjectId();
const SHELTER = new Types.ObjectId();
const USER = new Types.ObjectId().toString();

const lean = (value: unknown) => ({ lean: async () => value });

function setup({ cat = {} as any, blessing = {} as any, owns = false } = {}) {
    const catRow = cat === null ? null : { _id: CAT, name: 'Mochi', blessing: BLESSING, shelter: SHELTER, ...cat };
    const blessingRow = blessing === null ? null : { _id: BLESSING, status: BlessingStatus.WAITING, ...blessing };
    const catRepository = { model: { findOne: jest.fn(() => lean(catRow)) } };
    const blessingRepository = { model: { findOne: jest.fn(() => lean(blessingRow)) } };
    const shelterRepository = {
        model: {
            findOne: jest.fn(() =>
                lean({
                    _id: SHELTER,
                    name: 'Rožinė pėdutė',
                    slug: 'rozine-pedute',
                    handoverStatus: 'held-by-token-tails',
                    wallets: { secret: 'x' },
                })
            ),
        },
    };
    const catService = { ownsCopyOf: jest.fn(async () => owns) };
    const service = new ShelterCatSaleService(
        catRepository as any,
        blessingRepository as any,
        shelterRepository as any,
        catService as any
    );
    return { service, catService, blessingRepository };
}

describe('ShelterCatSaleService.check', () => {
    it('accepts an unowned rescue cat that is waiting, with only public shelter fields', async () => {
        const res = await setup().service.check(String(CAT), USER);
        expect(res).toEqual({
            ok: true,
            cat: {
                catId: String(CAT),
                name: 'Mochi',
                shelter: {
                    _id: String(SHELTER),
                    name: 'Rožinė pėdutė',
                    slug: 'rozine-pedute',
                    handoverStatus: 'held-by-token-tails',
                    publicWallet: null,
                },
            },
        });
        expect(JSON.stringify(res)).not.toContain('secret');
    });

    it.each([
        ['a malformed id', { id: 'nope' }, 'BAD_ID'],
        ['a 12-character string', { id: 'abcdefghijkl' }, 'BAD_ID'],
        ['a missing cat', { cat: null }, 'NOT_FOR_SALE'],
        ["a player's cat", { cat: { owner: new Types.ObjectId() } }, 'NOT_FOR_SALE'],
        ['a starter', { cat: { isStarter: true } }, 'NOT_FOR_SALE'],
        ['a cat with no blessing', { cat: { blessing: undefined } }, 'NOT_FOR_SALE'],
        ['an adopted rescue', { blessing: { status: BlessingStatus.ADOPTED } }, 'NOT_FOR_SALE'],
        ['a cat in heaven', { blessing: { status: BlessingStatus.HEAVEN } }, 'NOT_FOR_SALE'],
        ['a portrait blessing (not a rescue)', { blessing: null }, 'NOT_FOR_SALE'],
        ['a cat the buyer already has', { owns: true }, 'ALREADY_OWNED'],
    ])('refuses %s', async (_label, opts: any, reason) => {
        const { service } = setup(opts);
        expect(await service.check(opts.id ?? String(CAT), USER)).toEqual({ ok: false, reason });
    });
});
