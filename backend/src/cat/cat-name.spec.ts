import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
    CAT_NAME_VECTORS,
    isBlockedCatName,
    NAME_MODERATION_ACTIONS,
    NAME_REPORT_REASONS,
    NAME_REPORT_STATUSES,
    normalizeCatName,
} from 'src/shared-contracts/name';
import * as reportSchema from './name-report.schema';
import { MemoryModel, memoryRepository } from 'src/user/guest/memory-model.helper-spec';
import { CatNameService, groupNameReports, isMinted, RENAME_COOLDOWN_MS } from './cat-name.service';

/*
 * Plan G3 "Names": PUT /cat/:id/name (owner, starter only, one free rename per 30 days, frozen after
 * mint, decision #22), the legacy rename offer (decision #20), POST /cat/:id/report into
 * name_reports and PUT /cat/:id/name/moderate. Also runs every shared name vector on the backend.
 */

const owner = new Types.ObjectId();
const reporter = new Types.ObjectId();
const moderator = new Types.ObjectId();

function setup(cats: Record<string, unknown>[], reports: Record<string, unknown>[] = [], reserved: string[] = []) {
    const catModel = new MemoryModel(cats);
    const reportModel = new MemoryModel(reports, [{ fields: ['cat', 'reporter'], partial: { status: 'open' } }]);
    const featured = { reservedNames: jest.fn(async () => reserved) };
    const service = new CatNameService(
        { ...memoryRepository(catModel), model: catModel } as any,
        { ...memoryRepository(reportModel), model: reportModel } as any,
        featured as any
    );
    const now = new Date('2026-10-01T12:00:00Z');
    service.now = () => now;
    return { service, catModel, reportModel, now };
}

const starter = (fields: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    owner,
    name: 'Scout',
    isStarter: true,
    starterBreed: 'SCOUT',
    starterLockedAt: new Date('2026-09-01'),
    ...fields,
});

describe('shared name vectors on the backend', () => {
    it.each(CAT_NAME_VECTORS.map(vector => [JSON.stringify(vector.input), vector]))('%s', (_label, vector) => {
        const result = normalizeCatName(vector.input, { reserved: vector.reserved });
        expect(result.ok ? 'ok' : result.code).toBe(vector.expect);
        if (result.ok) {
            expect(result.name).toBe(vector.name ?? vector.input);
        }
    });
});

describe('shared blocked-name check and report vocabulary', () => {
    it('screens any name for blocked words, whatever its characters', () => {
        expect(isBlockedCatName('VIagra')).toBe(true);
        expect(isBlockedCatName('Mr. Fuck & Co')).toBe(true);
        expect(isBlockedCatName('Mila')).toBe(false);
        expect(isBlockedCatName('Medutė (3 m.)')).toBe(false);
        expect(isBlockedCatName(undefined)).toBe(false);
    });

    it('the schema re-exports the shared vocabulary, so the CMS and the backend agree', () => {
        expect(reportSchema.NAME_REPORT_REASONS).toBe(NAME_REPORT_REASONS);
        expect(reportSchema.NAME_REPORT_STATUSES).toBe(NAME_REPORT_STATUSES);
        expect(reportSchema.NAME_MODERATION_ACTIONS).toBe(NAME_MODERATION_ACTIONS);
    });
});

describe('PUT /cat/:id/name', () => {
    it('renames the owner starter once and reports the next free rename', async () => {
        const cat = starter();
        const { service, catModel, now } = setup([cat]);

        const result = await service.rename(String(cat._id), String(owner), '  Nimbus ');

        expect(result.cat).toMatchObject({
            name: 'Nimbus',
            nextRenameAt: new Date(now.getTime() + RENAME_COOLDOWN_MS),
        });
        expect(catModel.docs[0]).toMatchObject({ name: 'Nimbus', nameChangedAt: now });
    });

    it('refuses a second rename inside the window with the date it opens again', async () => {
        const cat = starter({ nameChangedAt: new Date('2026-09-20T12:00:00Z') });
        const { service } = setup([cat]);

        const error = await service.rename(String(cat._id), String(owner), 'Nimbus').catch(e => e);
        expect(error).toBeInstanceOf(ConflictException);
        expect(error.getResponse()).toMatchObject({ nextRenameAt: '2026-10-20T12:00:00.000Z' });
    });

    it('allows a rename again once 30 days passed', async () => {
        const cat = starter({ nameChangedAt: new Date('2026-08-31T12:00:00Z') });
        const { service } = setup([cat]);
        await expect(service.rename(String(cat._id), String(owner), 'Nimbus')).resolves.toMatchObject({
            success: true,
        });
    });

    it('lets parallel renames store only one name', async () => {
        const cat = starter();
        const { service, catModel } = setup([cat]);

        const results = await Promise.allSettled(
            ['Nimbus', 'Comet', 'Pebble', 'Biscuit'].map(name => service.rename(String(cat._id), String(owner), name))
        );

        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(
            results.filter(r => r.status === 'rejected').every(r => (r as any).reason instanceof ConflictException)
        ).toBe(true);
        expect(['Nimbus', 'Comet', 'Pebble', 'Biscuit']).toContain(catModel.docs[0].name);
    });

    it('is frozen after mint', async () => {
        const cat = starter({ token: { stellar: 'CDXYZ' } });
        const { service } = setup([cat]);
        await expect(service.rename(String(cat._id), String(owner), 'Nimbus')).rejects.toThrow('minted');
        expect(isMinted({ token: {} })).toBe(false);
        expect(isMinted({ token: { sei: '' } })).toBe(false);
        expect(isMinted({ token: { sei: '0xabc' } })).toBe(true);
    });

    it('stays frozen when the mint lands between the read and the write', async () => {
        const cat = starter();
        const { service, catModel } = setup([cat]);
        // validName runs between the two calls; the mint lands while it does.
        jest.spyOn(service, 'validName').mockImplementation(async raw => {
            catModel.docs[0].token = { stellar: 'CDXYZ' };
            return String(raw);
        });
        await expect(service.rename(String(cat._id), String(owner), 'Nimbus')).rejects.toThrow('minted');
        expect(catModel.docs[0].name).toBe('Scout');
    });

    it('renames only the caller own starter, after it is committed', async () => {
        const notStarter = starter({ isStarter: false });
        const someoneElses = starter({ owner: new Types.ObjectId() });
        const uncommitted = starter({ starterLockedAt: undefined });
        const { service } = setup([notStarter, someoneElses, uncommitted]);

        await expect(service.rename(String(notStarter._id), String(owner), 'Nimbus')).rejects.toBeInstanceOf(
            ForbiddenException
        );
        await expect(service.rename(String(someoneElses._id), String(owner), 'Nimbus')).rejects.toBeInstanceOf(
            NotFoundException
        );
        await expect(service.rename(String(uncommitted._id), String(owner), 'Nimbus')).rejects.toBeInstanceOf(
            ConflictException
        );
        await expect(service.rename('nope', String(owner), 'Nimbus')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('answers 400 with the shared code for a bad name, and reserves featured real cats', async () => {
        const cat = starter();
        const { service } = setup([cat], [], ['Mila']);

        for (const [name, code] of [
            ['A', 'NAME_TOO_SHORT'],
            ['аdmin', 'NAME_CHARS'],
            ['Admin', 'NAME_RESERVED'],
            ['MILA', 'NAME_RESERVED'],
            ['Kurva', 'NAME_BLOCKED'],
        ]) {
            const error = await service.rename(String(cat._id), String(owner), name).catch(e => e);
            expect(error).toBeInstanceOf(BadRequestException);
            expect(error.getResponse()).toMatchObject({ code });
        }
    });

    it('a rename to the same name does not use the window', async () => {
        const cat = starter({ name: 'Nimbus' });
        const { service, catModel } = setup([cat]);
        await service.rename(String(cat._id), String(owner), 'Nimbus');
        expect(catModel.docs[0].nameChangedAt).toBeUndefined();
    });

    it('the legacy rename offer skips the window once, then clears', async () => {
        const cat = starter({ name: 'Cleocatra', renameOffer: true, nameChangedAt: new Date('2026-09-30') });
        const { service, catModel } = setup([cat]);

        await service.rename(String(cat._id), String(owner), 'Rosie');
        expect(catModel.docs[0]).toMatchObject({ name: 'Rosie' });
        expect(catModel.docs[0]).not.toHaveProperty('renameOffer');
        await expect(service.rename(String(cat._id), String(owner), 'Daisy')).rejects.toBeInstanceOf(ConflictException);
    });

    it('dismissing the offer keeps the name and clears the flag', async () => {
        const cat = starter({ name: 'Cleocatra', renameOffer: true });
        const { service, catModel } = setup([cat]);
        await service.dismissRenameOffer(String(cat._id), String(owner));
        expect(catModel.docs[0]).toMatchObject({ name: 'Cleocatra' });
        expect(catModel.docs[0]).not.toHaveProperty('renameOffer');
    });
});

describe('POST /cat/:id/report', () => {
    it('stores one open report per reporter, with a name snapshot', async () => {
        const cat = starter({ name: 'Rudeboy' });
        const { service, reportModel } = setup([cat]);

        await service.report(String(cat._id), String(reporter), { reason: 'offensive', note: ' rude\u0000 name ' });
        await service.report(String(cat._id), String(reporter), { reason: 'impersonation' });

        expect(reportModel.docs).toHaveLength(1);
        expect(reportModel.docs[0]).toMatchObject({
            nameSnapshot: 'Rudeboy',
            reason: 'impersonation',
            note: 'rude name',
            status: 'open',
        });
    });

    it('refuses shelter cats, own cats and unknown reasons', async () => {
        const shelterCat = starter({ isStarter: false, owner: undefined });
        const mine = starter({ owner: reporter });
        const { service } = setup([shelterCat, mine]);

        await expect(service.report(String(shelterCat._id), String(reporter))).rejects.toThrow('player-named');
        await expect(service.report(String(mine._id), String(reporter))).rejects.toThrow('own cat');
        await expect(service.report(String(mine._id), String(owner), { reason: 'spam' })).rejects.toBeInstanceOf(
            BadRequestException
        );
    });
});

describe('PUT /cat/:id/name/moderate', () => {
    const report = (cat: Types.ObjectId, by = new Types.ObjectId()) => ({
        cat,
        reporter: by,
        nameSnapshot: 'Rudeboy',
        reason: 'offensive',
        status: 'open',
    });

    it('reset gives the breed name, restarts the rename window and resolves every open report', async () => {
        const cat = starter({ name: 'Rudeboy', starterBreed: 'MISTY', nameChangedAt: new Date('2026-09-30') });
        const { service, catModel, reportModel, now } = setup([cat], [report(cat._id), report(cat._id)]);

        const result = await service.moderate(String(cat._id), String(moderator), { action: 'reset' });

        expect(result).toMatchObject({ success: true, cat: { name: 'Misty' }, resolved: 2 });
        expect(catModel.docs[0]).toMatchObject({ name: 'Misty', nameModeratedBy: moderator, nameChangedAt: now });
        // The player cannot pick another name straight away (3c review): the 30-day window applies.
        await expect(service.rename(String(cat._id), String(owner), 'Rudeboy Two')).rejects.toBeInstanceOf(
            ConflictException
        );
        expect(catModel.docs[0].name).toBe('Misty');
        expect(reportModel.docs.every(doc => doc.status === 'actioned' && doc.action === 'reset')).toBe(true);
    });

    it('overrides the mint freeze: a minted starter can be reset, its owner still cannot rename it', async () => {
        const cat = starter({ name: 'Rudeboy', starterBreed: 'MISTY', token: { stellar: 'CDXYZ' } });
        const { service, catModel } = setup([cat], [report(cat._id)]);

        await expect(service.moderate(String(cat._id), String(moderator), { action: 'reset' })).resolves.toMatchObject({
            success: true,
            cat: { name: 'Misty' },
        });
        expect(catModel.docs[0].name).toBe('Misty');
        await expect(service.rename(String(cat._id), String(owner), 'Rudeboy Two')).rejects.toThrow('minted');
    });

    it('rename validates the moderator name too', async () => {
        const cat = starter({ name: 'Rudeboy' });
        const { service } = setup([cat], [report(cat._id)]);
        await expect(
            service.moderate(String(cat._id), String(moderator), { action: 'rename', name: 'Sh1t' })
        ).rejects.toThrow(BadRequestException);
        await expect(
            service.moderate(String(cat._id), String(moderator), { action: 'rename', name: 'Pebble' })
        ).resolves.toMatchObject({ cat: { name: 'Pebble' }, resolved: 1 });
    });

    it('dismiss keeps the name and marks reports dismissed', async () => {
        const cat = starter({ name: 'Rudeboy' });
        const { service, catModel, reportModel } = setup([cat], [report(cat._id)]);
        await service.moderate(String(cat._id), String(moderator), { action: 'dismiss' });
        expect(catModel.docs[0].name).toBe('Rudeboy');
        expect(reportModel.docs[0]).toMatchObject({ status: 'dismissed', action: 'dismiss' });
    });

    it('dismisses the reports of a deleted cat, and refuses to rename or reset it', async () => {
        const gone = new Types.ObjectId();
        const { service, reportModel } = setup([], [report(gone), report(gone)]);

        await expect(service.moderate(String(gone), String(moderator), { action: 'reset' })).rejects.toBeInstanceOf(
            NotFoundException
        );
        expect(reportModel.docs.every(doc => doc.status === 'open')).toBe(true);

        const result = await service.moderate(String(gone), String(moderator), { action: 'dismiss' });

        expect(result).toMatchObject({ success: true, cat: { _id: String(gone), name: '' }, resolved: 2 });
        expect(reportModel.docs.every(doc => doc.status === 'dismissed' && doc.action === 'dismiss')).toBe(true);
    });

    it('refuses an unknown action', async () => {
        const cat = starter();
        const { service } = setup([cat]);
        await expect(service.moderate(String(cat._id), String(moderator), { action: 'ban' })).rejects.toBeInstanceOf(
            BadRequestException
        );
    });
});

describe('GET /cat/name-reports', () => {
    it('groups open reports per cat, most reported first, never exposing reporters', async () => {
        const loud = starter({ name: 'Rudeboy' });
        const quiet = starter({ name: 'Meh' });
        const at = (day: number) => new Date(Date.UTC(2026, 8, day));
        const { service } = setup(
            [loud, quiet],
            [
                {
                    cat: loud._id,
                    reporter: new Types.ObjectId(),
                    nameSnapshot: 'Rudeboy',
                    reason: 'offensive',
                    status: 'open',
                    createdAt: at(2),
                },
                {
                    cat: loud._id,
                    reporter: new Types.ObjectId(),
                    nameSnapshot: 'Rudeboy',
                    reason: 'offensive',
                    note: 'slur',
                    status: 'open',
                    createdAt: at(3),
                },
                {
                    cat: quiet._id,
                    reporter: new Types.ObjectId(),
                    nameSnapshot: 'Meh',
                    reason: 'other',
                    status: 'open',
                    createdAt: at(4),
                },
                {
                    cat: quiet._id,
                    reporter: new Types.ObjectId(),
                    nameSnapshot: 'Meh',
                    reason: 'other',
                    status: 'dismissed',
                    createdAt: at(1),
                },
            ]
        );

        const groups = await service.listReports('open', 0);

        expect(groups.map(group => [group.cat.name, group.count])).toEqual([
            ['Rudeboy', 2],
            ['Meh', 1],
        ]);
        expect(groups[0]).toMatchObject({ reasons: { offensive: 2 }, notes: ['slur'], names: ['Rudeboy'] });
        expect(JSON.stringify(groups)).not.toContain('reporter');
        await expect(service.listReports('bogus')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('marks a report whose cat is gone', () => {
        const id = new Types.ObjectId();
        expect(groupNameReports([{ cat: id, reason: 'other', status: 'open' }], [])[0].cat).toEqual({
            _id: String(id),
            missing: true,
        });
    });
});
