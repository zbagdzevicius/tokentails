import { countryOf, shownFlag } from './flags';
import { PawlegendsFlagsController } from './flags.controller';
import { FlagsService, relayFlagOf, visibleFlags } from './flags.service';

/*
 * Country flags (docs/plans/moba/FLAGS.md): only Cloudflare's ISO country is read (never the IP), stored per account
 * with the hide choice; readers see no flag for a hidden row.
 */

function fakeModel(rows: Record<string, { cc?: string | null; off?: boolean }>) {
    const lean = <T>(v: T) => ({ select: () => ({ lean: async () => v }), lean: async () => v });
    return {
        rows,
        findById: (id: string) => lean(rows[id] ? { _id: id, ...rows[id] } : null),
        find: (f: { _id: { $in: string[] } }) =>
            lean(f._id.$in.filter(id => rows[id]).map(id => ({ _id: id, ...rows[id] }))),
        updateOne: jest.fn(async (f: { _id: string }, u: { $set: Record<string, unknown> }) => {
            rows[f._id] = { ...(rows[f._id] ?? {}), ...(u.$set as object) };
        }),
    };
}

describe('country flags', () => {
    it('reads only a real ISO country from cf-ipcountry', () => {
        expect(countryOf('lt')).toBe('LT');
        expect(countryOf(' DE ')).toBe('DE');
        expect(countryOf(['FR'])).toBe('FR');
        for (const bad of ['XX', 'T1', 'EU', 'A1', '', 'LTU', '1A', undefined, null, 3])
            expect(countryOf(bad)).toBeNull();
    });

    it('a hidden row shows no flag; an empty one falls back to the request country', () => {
        expect(shownFlag({ cc: 'LT', off: true }, 'DE')).toBeNull();
        expect(shownFlag({ cc: 'LT' }, 'DE')).toBe('LT');
        expect(shownFlag({}, 'de')).toBe('DE');
        expect(shownFlag(null)).toBeNull();
    });

    it('records the country (no write when unchanged), answers the hide choice, and never stores anything else', async () => {
        const m = fakeModel({});
        const s = new FlagsService(m);
        expect(await s.mine('acc1', 'LT')).toEqual({ cc: 'LT', hideFlag: false });
        expect(m.updateOne).toHaveBeenCalledTimes(1);
        const set = m.updateOne.mock.calls[0][1].$set;
        expect(Object.keys(set).sort()).toEqual(['at', 'cc']);
        await s.mine('acc1', 'LT');
        expect(m.updateOne).toHaveBeenCalledTimes(1);
        // no header (local dev, a direct call): the stored country answers
        expect(await s.mine('acc1', undefined)).toEqual({ cc: 'LT', hideFlag: false });
        await s.setHidden('acc1', true, undefined);
        expect(await s.mine('acc1', 'LT')).toEqual({ cc: 'LT', hideFlag: true });
        // no account: an answer only, nothing written
        expect(await s.mine(null, 'FR')).toEqual({ cc: 'FR', hideFlag: false });
        expect(Object.keys(m.rows)).toEqual(['acc1']);
    });

    it('friends and boards see only shown flags; a read error gives none', async () => {
        const m = fakeModel({ a: { cc: 'LT' }, b: { cc: 'DE', off: true }, c: { cc: null } });
        const got = await visibleFlags(m, ['a', 'b', 'c', 'd']);
        expect([...got]).toEqual([['a', 'LT']]);
        const broken = { find: () => ({ select: () => ({ lean: async () => Promise.reject(new Error('down')) }) }) };
        expect((await visibleFlags(broken, ['a'])).size).toBe(0);
        expect(await relayFlagOf(m)('b')).toMatchObject({ cc: 'DE', off: true });
        expect(await relayFlagOf(null)('a')).toBeNull();
    });
});

describe('GET /pawlegends/flag/here (no session)', () => {
    it('answers only the Cloudflare country and stores nothing', async () => {
        const model = fakeModel({});
        const consume = jest.fn(async () => undefined);
        const c = new PawlegendsFlagsController(new FlagsService(model), { consume } as any);
        expect(await c.here({ headers: { 'cf-ipcountry': 'lt' } }, {})).toEqual({ cc: 'LT' });
        expect(await c.here({ headers: { 'cf-ipcountry': 'T1' } }, {})).toEqual({ cc: null });
        expect(consume).toHaveBeenCalledTimes(2);
        expect(model.updateOne).not.toHaveBeenCalled();
        expect(Object.keys(model.rows)).toEqual([]);
    });
});
