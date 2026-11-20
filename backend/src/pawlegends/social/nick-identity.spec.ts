import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { MemoryModel } from 'src/user/guest/memory-model.helper-spec';
import { foldCatName } from '../../shared-contracts/name';
import { memberName } from '../party/party-names';
import { autoNickBase, autoNickCandidates, nickFrom } from './nick-assign';
import { NICK_BACKFILL_JOB, runNickBackfill } from './nick-backfill';
import { PawlegendsNicknameController } from './nickname.controller';
import { NicknameService } from './nickname.service';
import { formatPlayerCode } from './social.contracts';
import { SocialService } from './social.service';
import { SocialMemoryModel, TestClock } from './social-model.helper-spec';

/*
 * Founder, Nov 20: "this PL-WF... code is redundant, we have nicknames that must be unique and represent actual
 * username". The nickname is the account's unique username: every registered account has one (assigned when never
 * picked, nick-assign.ts), the live check answers taken / available, friends are added by it, and the old player code
 * still resolves on the server (old builds, old links) though the game never shows it.
 */

const CAT = (n: number) => n.toString(16).padStart(24, 'a');

function harness(opts: { rows?: any[]; users?: any[]; cats?: any[]; progress?: any[] } = {}) {
    const clock = new TestClock();
    const now = clock.now;
    const social = new SocialMemoryModel(
        opts.rows ?? [],
        [{ fields: ['code'] }, { fields: ['_id'] }, { fields: ['nickKey'], partial: { nickKey: { $type: 'string' } } }],
        now
    );
    const users = new SocialMemoryModel(
        opts.users ?? ['A', 'B', 'C', 'D', 'E', 'F'].map(id => ({ _id: id, isGuest: false })),
        [],
        now
    );
    const cats = new SocialMemoryModel(opts.cats ?? [], [], now);
    const progress = new SocialMemoryModel(opts.progress ?? [], [], now);
    const empty = () => new SocialMemoryModel([], [{ fields: ['_id'] }], now);
    const friends = empty();
    const svc = new SocialService(
        social,
        friends,
        empty(),
        empty(),
        empty(),
        new SocialMemoryModel([], [{ fields: ['key'] }], now),
        empty(),
        users,
        cats,
        clock,
        undefined,
        undefined,
        undefined,
        undefined,
        progress
    );
    const names = new NicknameService(
        svc,
        new MemoryModel([], [{ fields: ['_id'] }], now),
        new MemoryModel([], [{ fields: ['accountId', 'ref'] }], now),
        clock
    );
    const jobRuns = new MemoryModel([], [{ fields: ['_id'] }], now) as any;
    const backfill = (instance = 'i1') =>
        runNickBackfill({
            social,
            cats,
            progress,
            jobRuns: {
                findOne: (f: any) => jobRuns.findOne(f).lean(),
                findOneAndUpdate: (f: any, u: any, o: any) => {
                    // the lease owner is this "instance" (acquireLease writes INSTANCE_ID)
                    return jobRuns
                        .findOneAndUpdate(f, u, o)
                        .then((r: any) => (r ? Object.assign(r, { by: instance }) : r));
                },
                updateOne: (f: any, u: any, o?: any) => jobRuns.updateOne(f, u, o),
            },
            registered: ids => svc.registered(ids),
            ensureProfile: id => svc.profile(id),
            now,
        });
    return { clock, social, users, cats, progress, friends, svc, names, jobRuns, backfill };
}

/** A social row as it was before Nov 20: no nickname, a code, maybe a cat name. */
const oldRow = (id: string, minutesAgo: number, extra: Record<string, unknown> = {}) => ({
    _id: id,
    code: `CODE${id.padEnd(4, '0')}`.slice(0, 8),
    name: { kind: 'generated' },
    invisible: false,
    allowRecent: true,
    rev: 0,
    rotations: null,
    createdAt: new Date(Date.UTC(2026, 10, 1) - minutesAgo * 60_000),
    ...extra,
});

describe('nickname = unique username (founder, Nov 20)', () => {
    describe('assigned names (pure)', () => {
        it('starts from the shown name, cut to 16 characters, else the generated name', () => {
            expect(nickFrom('Scout')).toBe('Scout');
            expect(nickFrom('Sir Fluffington the Third')).toBe('Sir Fluffington');
            expect(nickFrom('Admin')).toBeNull();
            expect(nickFrom('Мира')).toBeNull();
            expect(autoNickBase('Scout', 'X')).toBe('Scout');
            expect(autoNickBase('', 'X')).toBe(nickFrom(memberName('X')));
            expect(autoNickBase('<b>', 'X')).toBe(nickFrom(memberName('X')));
        });

        it('candidates are deterministic, valid, 16 characters at most and unique by folded key', () => {
            const a = autoNickCandidates('Scout', 'acc1');
            expect(a).toEqual(autoNickCandidates('Scout', 'acc1'));
            expect(a.slice(0, 3)).toEqual(['Scout', 'Scout2', 'Scout3']);
            const keys = a.map(foldCatName);
            expect(new Set(keys).size).toBe(keys.length);
            const long = autoNickCandidates('Sparkly Whiskers', 'acc1');
            expect(long.every(n => n.length <= 16)).toBe(true);
            expect(long[1]).toBe('Sparkly Whisker2');
            expect(a.length).toBeGreaterThan(90);
        });
    });

    describe('uniqueness', () => {
        it('the live check: case, spaces, accents, leet and full-width forms are one name; mine is available', async () => {
            const { names } = harness();
            await names.change('A', { name: 'Mira Belle' });
            for (const v of [
                'mira belle',
                'MIRA BELLE',
                '  Mira   Belle ',
                'Mîra Bellé',
                'M1ra B3lle',
                'Ｍｉｒａ Belle',
                'MiraBelle',
            ]) {
                expect(await names.check('B', v)).toMatchObject({ available: false, reason: 'taken' });
            }
            expect(await names.check('A', 'mira belle')).toMatchObject({ available: true, mine: true });
            expect(await names.check('B', 'Mirabel')).toEqual({ name: 'Mirabel', available: true });
            expect(await names.check('B', 'x')).toMatchObject({ available: false, reason: 'NAME_TOO_SHORT' });
            expect(await names.check('B', 'Admin')).toMatchObject({ available: false, reason: 'NAME_RESERVED' });
            expect(await names.check('B', ['Mira'])).toMatchObject({ available: false });
            // never an id, a code or an email
            const answer = await names.check('B', 'mira belle');
            expect(Object.keys(answer).sort()).toEqual(['available', 'message', 'name', 'reason']);
            // and the write path agrees
            await expect(names.change('B', { name: 'M1RA  belle' })).rejects.toMatchObject({
                response: { code: 'PAWLEGENDS_NAME_TAKEN' },
            });
        });

        it('a new account gets a unique assigned nickname with no notice; two that would share one get a number', async () => {
            const { svc, social } = harness();
            // force the same generated base for two accounts: the second gets a number
            await svc.profile('A');
            const a = social.docs.find(d => d._id === 'A')!;
            expect(a).toMatchObject({ nickAuto: true, name: { kind: 'nick' } });
            expect(a.nickNotice).toBeUndefined();
            social.docs.push(oldRow('B', 1));
            const { assignAutoNick } = await import('./nick-assign');
            await assignAutoNick(social, 'B', a.nick, { notice: true });
            const b = social.docs.find(d => d._id === 'B')!;
            expect(b.nick).toBe(autoNickCandidates(a.nick, 'B')[1]);
            expect(b.nickNotice).toEqual({ kind: 'taken', from: a.nick });
        });

        it('the check and the notice routes are registered-only', async () => {
            for (const m of ['check', 'notice'] as const) {
                const guards = Reflect.getMetadata(GUARDS_METADATA, (PawlegendsNicknameController.prototype as any)[m]);
                expect(guards).toContain(AppAuthGuard);
            }
        });
    });

    describe('backfill pl-nick-backfill-v1', () => {
        const rows = () => [
            oldRow('B', 30, { name: { kind: 'cat', catId: CAT(2) } }), // Scout, newer
            oldRow('A', 60, { name: { kind: 'cat', catId: CAT(1) } }), // Scout, oldest
            oldRow('C', 10, { name: { kind: 'cat', catId: CAT(3) } }), // scout (case), newest
            oldRow('D', 20, { name: { kind: 'cat', catId: CAT(4) } }), // a name that cannot be a nickname
            oldRow('E', 90, { nick: 'Scoutt', nickKey: foldCatName('Scoutt'), name: { kind: 'nick' }, nameChanges: 1 }),
            oldRow('G', 5, { name: { kind: 'cat', catId: CAT(5) } }), // a guest's row: skipped
            oldRow('F', 15), // the generated name
        ];
        const cats = [
            { _id: CAT(1), name: 'Scout', owner: 'A' },
            { _id: CAT(2), name: 'Scout', owner: 'B' },
            { _id: CAT(3), name: 'scout', owner: 'C' },
            { _id: CAT(4), name: 'Admin Cat', owner: 'D' },
            { _id: CAT(5), name: 'Scout', owner: 'G' },
        ];

        it('the oldest keeps the name, later ones get a number and a one-time notice; picked nicknames stay', async () => {
            const h = harness({
                rows: rows(),
                cats,
                users: [...'ABCDEF']
                    .map(id => ({ _id: id, isGuest: false }))
                    .concat([{ _id: 'G', isGuest: true } as any]),
            });
            const out = await h.backfill();
            expect(out).toMatchObject({ state: 'done', assigned: 5, noticed: 3 });
            const by = (id: string) => h.social.docs.find(d => d._id === id)!;
            expect(by('A')).toMatchObject({ nick: 'Scout', nickAuto: true, name: { kind: 'nick' } });
            expect(by('A').nickNotice).toBeUndefined();
            expect(by('B')).toMatchObject({ nick: 'Scout2', nickNotice: { kind: 'taken', from: 'Scout' } });
            // "scout" folds to the same key: the newest of the three gets the next number
            expect(by('C').nick).toBe('scout3');
            expect(by('C').nickNotice).toEqual({ kind: 'taken', from: 'scout' });
            expect(by('D').nickNotice).toMatchObject({ kind: 'invalid', from: 'Admin Cat' });
            expect(by('E')).toMatchObject({ nick: 'Scoutt', nameChanges: 1 });
            expect(by('E').nickAuto).toBeUndefined();
            expect(by('F').nick).toBe(nickFrom(memberName('F')));
            expect(by('G').nick).toBeUndefined();
            // every nickname is unique
            const keys = h.social.docs.filter(d => d.nickKey).map(d => d.nickKey);
            expect(new Set(keys).size).toBe(keys.length);
            // the first own change stays free
            expect((await h.names.view('B')).free).toBe(true);
            // the notice shows until seen
            expect((await h.names.view('B')).notice).toEqual({ kind: 'taken', from: 'Scout' });
            await h.names.seen('B');
            expect((await h.names.view('B')).notice).toBeNull();
        });

        it('is idempotent: done once, a second run (or a forced rerun) changes nothing', async () => {
            const h = harness({ rows: rows(), cats });
            await h.backfill();
            const snap = JSON.stringify(h.social.docs.map(d => [d._id, d.nick, d.nickNotice]));
            expect(await h.backfill()).toEqual({ state: 'already-done' });
            await h.jobRuns.updateOne(
                { _id: NICK_BACKFILL_JOB },
                { $unset: { doneAt: 1 }, $set: { lockedUntil: new Date(0) } }
            );
            expect(await h.backfill()).toMatchObject({ state: 'done', assigned: 0 });
            expect(JSON.stringify(h.social.docs.map(d => [d._id, d.nick, d.nickNotice]))).toBe(snap);
        });

        it('two instances at once: one holds the lease, the other waits; a dead holder is taken over after expiry', async () => {
            const h = harness({ rows: rows(), cats });
            const [x, y] = await Promise.all([h.backfill('i1'), h.backfill('i2')]);
            expect([x.state, y.state].sort()).toEqual(['done', 'lease-held']);
            const keys = h.social.docs.filter(d => d.nickKey).map(d => d.nickKey);
            expect(new Set(keys).size).toBe(keys.length);

            const dead = harness({ rows: rows(), cats });
            await dead.jobRuns.updateOne(
                { _id: NICK_BACKFILL_JOB },
                { $set: { lockedUntil: new Date(dead.clock.ms + 60_000) } },
                { upsert: true }
            );
            expect(await dead.backfill()).toEqual({ state: 'lease-held' });
            dead.clock.advance(5 * 60_000);
            expect(await dead.backfill()).toMatchObject({ state: 'done' });
        });

        it('creates the social row (and nickname) of a registered player with progress who never opened social', async () => {
            const h = harness({
                progress: [{ _id: 'A' }, { _id: 'G' }],
                users: [
                    { _id: 'A', isGuest: false },
                    { _id: 'G', isGuest: true },
                ],
            });
            expect(await h.backfill()).toMatchObject({ state: 'done', created: 1 });
            expect(h.social.docs.map(d => d._id)).toEqual(['A']);
            expect(h.social.docs[0]).toMatchObject({ nickAuto: true, name: { kind: 'nick' } });
        });

        it('after the backfill a leftover row gets its nickname when read', async () => {
            const h = harness({ rows: [oldRow('A', 5)] });
            expect((await h.svc.profile('A')) as any).not.toHaveProperty('nick');
            h.svc.nickBackfillDone = true;
            expect(((await h.svc.profile('A')) as any).nick).toBe(nickFrom(memberName('A')));
        });
    });

    describe('friends by nickname; the old code still works', () => {
        it('adds by an assigned nickname (any case), by the old code, and never answers a code in search', async () => {
            const h = harness();
            await h.svc.profile('A');
            const b = await h.svc.profile('B');
            const bNick = (b as any).nick as string;
            const add = async (me: string, body: Record<string, unknown>) => {
                const t = await h.svc.targetOf(me, body);
                return h.svc.request(me, t.id, t.via);
            };
            expect(await h.svc.targetOf('A', { name: bNick.toUpperCase() })).toEqual({ id: 'B', via: 'name' });
            expect(await add('A', { name: bNick.toLowerCase() })).toEqual({ state: 'sent' });
            // an old build or an old shared code: still resolves
            await h.svc.profile('C');
            const cCode = formatPlayerCode((await h.svc.profile('C')).code);
            expect(await h.svc.targetOf('A', { code: cCode })).toEqual({ id: 'C', via: 'code' });
            expect(await h.svc.targetOf('A', { code: cCode.toLowerCase().replace(/-/g, '') })).toEqual({
                id: 'C',
                via: 'code',
            });
            const found = await h.svc.search('D', bNick.slice(0, 4));
            for (const p of found.players) {
                expect(
                    Object.keys(p)
                        .sort()
                        .every(k => ['av', 'cc', 'name', 'rel'].includes(k))
                ).toBe(true);
            }
            expect(found.players.map(p => p.name)).toContain(bNick);
        });

        it('a code-shaped nickname ("Whiskers", "Fuzz Ball") and a bare pasted code both resolve, from any build', async () => {
            const h = harness();
            await h.svc.profile('A');
            await h.svc.profile('B');
            await h.svc.profile('C');
            await h.social.updateOne({ _id: 'B' }, { $set: { nick: 'Whiskers', nickKey: 'whiskers' } });
            await h.social.updateOne({ _id: 'C' }, { $set: { nick: 'Fuzz Ball', nickKey: 'fuzzball' } });
            // new build: everything but a PL- code is sent as a name
            expect(await h.svc.targetOf('A', { name: 'whiskers' })).toEqual({ id: 'B', via: 'name' });
            expect(await h.svc.targetOf('A', { name: 'FUZZ BALL' })).toEqual({ id: 'C', via: 'name' });
            const bare = (await h.svc.profile('C')).code;
            expect(await h.svc.targetOf('A', { name: bare })).toEqual({ id: 'C', via: 'code' });
            // old build: an 8-letter name went out as a code
            expect(await h.svc.targetOf('A', { code: 'Whiskers' })).toEqual({ id: 'B', via: 'code' });
            expect(await h.svc.targetOf('A', { code: 'fuzz ball' })).toEqual({ id: 'C', via: 'code' });
            // nobody: the error of the field that was sent
            await expect(h.svc.targetOf('A', { name: 'Nobody' })).rejects.toMatchObject({
                response: expect.objectContaining({ code: 'PAWLEGENDS_SOCIAL_NO_NAME' }),
            });
            await expect(h.svc.targetOf('A', { code: 'ZZZZZZZZ' })).rejects.toMatchObject({
                response: expect.objectContaining({ code: 'PAWLEGENDS_SOCIAL_NOT_FOUND' }),
            });
        });
    });
});
