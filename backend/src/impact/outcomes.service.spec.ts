import { Types } from 'mongoose';
import sharp = require('sharp');
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { memoryModel } from './memory-model.fakes-spec';
import { parseRegions, redactOutcomeImage } from './outcome-image';
import { OUTCOME_TYPES, publishBlocker, ShelterOutcome, ShelterOutcomeSchema } from './outcome.schema';
import { OUTCOME_ERROR, ShelterOutcomeService } from './outcomes.service';
import { ImpactPayoutService } from './payouts.service';
import mongoose = require('mongoose');

jest.mock('src/shared/utils/aws.utils', () => ({ uploadFile: jest.fn(), uploadPublicObject: jest.fn() }));

/*
 * Shelter outcomes (plan G11, decision #78): no image and no outcome is public before it is marked
 * redacted and approved by a second reviewer; the redaction pipeline drops metadata and pixelates boxes.
 */

async function photo(width = 400, height = 300): Promise<Buffer> {
    // A JPEG with EXIF (camera make and a GPS-like comment) and an orientation flag.
    return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 90 } } })
        .composite([
            {
                input: await sharp({
                    create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
                })
                    .composite([
                        {
                            input: await sharp({
                                create: { width: 56, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
                            })
                                .png()
                                .toBuffer(),
                            left: 0,
                            top: 0,
                        },
                    ])
                    .png()
                    .toBuffer(),
                left: 0,
                top: 0,
            },
        ])
        .withExif({ IFD0: { Make: 'SecretPhone', ImageDescription: 'Home of Jane, 54.6872N 25.2797E' } })
        .jpeg()
        .toBuffer();
}

function setup() {
    const outcomes = memoryModel({ unique: [['publicId']] });
    const images = memoryModel();
    const shelters = memoryModel();
    const payouts = memoryModel({ unique: [['publicId']] });
    const payoutService = new ImpactPayoutService(payouts as any, shelters as any);
    const service = new ShelterOutcomeService(
        outcomes as any,
        images as any,
        shelters as any,
        payouts as any,
        payoutService
    );
    const uploads: { key: string; data: Buffer }[] = [];
    const deleted: string[] = [];
    service.uploader = async (key, data) => {
        uploads.push({ key, data });
        return `https://cdn.test/${key}`;
    };
    service.deleter = async key => {
        deleted.push(key);
    };
    const shelter = { _id: new Types.ObjectId(), slug: 'rozine-pedute', name: 'Pink Paw' };
    shelters.rows.push(shelter);
    const staff = (name: string) => ({ _id: new Types.ObjectId(), name, permission: PERMISSION_LEVEL.MANAGER });
    return {
        service,
        outcomes,
        images,
        payouts,
        uploads,
        deleted,
        shelter,
        author: staff('author'),
        redactor: staff('redactor'),
        reviewer: staff('reviewer'),
    };
}

const body = (t: ReturnType<typeof setup>, fields: Record<string, any> = {}) => ({
    shelter: String(t.shelter._id),
    type: 'surgery',
    date: '2026-09-20',
    animalName: 'Murka',
    amount: '120',
    symbol: 'EUR',
    ...fields,
});

describe('outcome redaction pipeline', () => {
    it('drops EXIF and GPS metadata, re-encodes as WebP and pixelates the boxes', async () => {
        const input = await photo();
        expect((await sharp(input).metadata()).exif).toBeDefined();
        const box = parseRegions(JSON.stringify([{ x: 0, y: 0, w: 0.25, h: 1 / 3 }]));

        const out = await redactOutcomeImage(input, box);
        const meta = await sharp(out.data).metadata();

        expect(meta.format).toBe('webp');
        expect(meta.exif).toBeUndefined();
        expect(meta.icc).toBeUndefined();
        expect(out.data.toString('latin1')).not.toContain('SecretPhone');
        expect(out.data.toString('latin1')).not.toContain('Jane');
        // Inside the box, pixels 51 and 61 straddle a hard white/black edge at x=56; after pixelation they
        // sit in one 12.5 px block (50 to 62.5) and come out the same grey. Outside the box nothing changes.
        const px = async (buf: Buffer, x: number, y: number) =>
            (await sharp(buf).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer())[0];
        expect(await px(input, 51, 50)).toBeGreaterThan(200);
        expect(await px(input, 61, 50)).toBeLessThan(50);
        expect(Math.abs((await px(out.data, 51, 50)) - (await px(out.data, 61, 50)))).toBeLessThan(16);
        expect(await px(out.data, 300, 200)).toBeGreaterThan(150);
        expect(out.width).toBe(400);
    });

    it('refuses non-images, other formats and bad boxes', async () => {
        await expect(redactOutcomeImage(Buffer.from('not an image'))).rejects.toThrow('not an image');
        const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } })
            .gif()
            .toBuffer();
        await expect(redactOutcomeImage(gif)).rejects.toThrow('JPEG, PNG or WebP');
        expect(() => parseRegions('[{"x":2,"y":0,"w":1,"h":1}]')).toThrow();
        expect(() => parseRegions('nope')).toThrow('JSON');
        expect(parseRegions(undefined)).toEqual([]);
    });
});

describe('outcome publishing (decision #78)', () => {
    it('keeps a draft, its image and its text out of the public list until a second reviewer approves', async () => {
        const t = setup();
        const draft = await t.service.create(body(t), t.author);
        await t.service.setImage(draft.id, { buffer: await photo() }, undefined, t.author);

        expect(await t.service.publicOutcomes(new Date(1))).toEqual({ published: 0, items: [] });
        expect(t.uploads).toHaveLength(0);
        // The processed bytes are previewable by managers, never by URL.
        expect((await t.service.get(draft.id, t.author)).imageUrl).toBeNull();
        expect((await t.service.imageBytes(draft.id)).length).toBeGreaterThan(0);

        expect(await errorStatus(t.service.approve(draft.id, t.reviewer))).toEqual({
            status: 409,
            code: OUTCOME_ERROR.NOT_REDACTED,
        });
        await t.service.setRedacted(draft.id, true, t.redactor);
        for (const sameReviewer of [t.author, t.redactor]) {
            expect(await errorStatus(t.service.approve(draft.id, sameReviewer))).toEqual({
                status: 403,
                code: OUTCOME_ERROR.SAME_REVIEWER,
            });
        }
        expect(t.uploads).toHaveLength(0);

        const published = await t.service.approve(draft.id, t.reviewer);
        expect(published.status).toBe('published');
        expect(t.uploads).toHaveLength(1);
        const list = await t.service.publicOutcomes(new Date(2));
        expect(list.published).toBe(1);
        expect(list.items[0]).toEqual({
            id: draft.id,
            type: 'surgery',
            date: '2026-09-20',
            shelter: 'rozine-pedute',
            animalName: 'Murka',
            amountWei: '120000000000000000000',
            symbol: 'EUR',
            tier: null,
            payoutId: null,
            payoutTxHash: null,
            imageUrl: `https://cdn.test/${t.uploads[0].key}`,
        });
        const json = JSON.stringify(list);
        [t.author, t.redactor, t.reviewer].forEach(u => expect(json).not.toContain(String(u._id)));
        expect(json).not.toMatch(/"[0-9a-f]{24}"/);
    });

    it('the author may also redact; the approver must then be someone else', async () => {
        const t = setup();
        const draft = await t.service.create(body(t, { amount: '', symbol: '' }), t.author);
        await t.service.setRedacted(draft.id, true, t.author);
        expect((await errorStatus(t.service.approve(draft.id, t.author))).status).toBe(403);
        expect((await t.service.approve(draft.id, t.redactor)).status).toBe('published');
    });

    it('any edit or new image clears the redaction mark and the approval', async () => {
        const t = setup();
        const draft = await t.service.create(body(t), t.author);
        await t.service.setRedacted(draft.id, true, t.redactor);
        const edited = await t.service.update(draft.id, { animalName: 'Pūkas' }, t.author);
        expect(edited).toEqual(expect.objectContaining({ redacted: false, status: 'draft', animalName: 'Pūkas' }));

        await t.service.setRedacted(draft.id, true, t.redactor);
        const imaged = await t.service.setImage(draft.id, { buffer: await photo() }, '[]', t.author);
        expect(imaged).toEqual(
            expect.objectContaining({ redacted: false, status: 'awaiting-redaction', hasImage: true })
        );
    });

    it('unpublishing takes it off the public list and removes its public image link', async () => {
        const t = setup();
        const draft = await t.service.create(body(t), t.author);
        await t.service.setImage(draft.id, { buffer: await photo() }, undefined, t.author);
        await t.service.setRedacted(draft.id, true, t.redactor);
        await t.service.approve(draft.id, t.reviewer);
        const key = t.outcomes.rows[0].image.key;
        expect(key).toBe(t.uploads[0].key);
        const down = await t.service.unpublish(draft.id, t.reviewer);
        expect(await t.service.publicOutcomes(new Date(3))).toEqual({ published: 0, items: [] });
        expect(t.outcomes.rows[0].image.url).toBeUndefined();
        // The public object is deleted, and it has to be redacted and approved again.
        expect(t.deleted).toEqual([key]);
        expect(down).toEqual(expect.objectContaining({ status: 'awaiting-redaction', redacted: false }));
        await expect(t.service.approve(draft.id, t.reviewer)).rejects.toThrow('redacted');
        await expect(t.service.update(draft.id, { animalName: 'Ok' }, t.author)).resolves.toBeTruthy();
    });

    it('records a manual purge when the public image cannot be deleted', async () => {
        const t = setup();
        t.service.deleter = async () => {
            throw new Error('spaces down');
        };
        const draft = await t.service.create(body(t), t.author);
        await t.service.setImage(draft.id, { buffer: await photo() }, undefined, t.author);
        await t.service.setRedacted(draft.id, true, t.redactor);
        await t.service.approve(draft.id, t.reviewer);
        await t.service.unpublish(draft.id, t.reviewer);
        expect(t.outcomes.rows[0].unpurgedImageKeys).toEqual([t.uploads[0].key]);
        expect(t.outcomes.rows[0].published).toBe(false);
    });

    it('never publishes image bytes nobody reviewed (a setImage racing approve)', async () => {
        const t = setup();
        const draft = await t.service.create(body(t), t.author);
        await t.service.setImage(draft.id, { buffer: await photo() }, undefined, t.author);
        await t.service.setRedacted(draft.id, true, t.redactor);
        // The race: new bytes land in shelteroutcomeimages while the outcome still says redacted.
        t.images.rows[0].data = Buffer.from('unreviewed bytes');
        await expect(t.service.approve(draft.id, t.reviewer)).rejects.toThrow('changed');
        expect(t.uploads).toHaveLength(0);
        expect(t.outcomes.rows[0].published).toBe(false);
    });

    it('takes an uploaded copy back down when the publish write loses a race', async () => {
        const t = setup();
        const draft = await t.service.create(body(t), t.author);
        await t.service.setImage(draft.id, { buffer: await photo() }, undefined, t.author);
        await t.service.setRedacted(draft.id, true, t.redactor);
        const upload = t.service.uploader;
        t.service.uploader = async (key, data) => {
            const url = await upload(key, data);
            t.outcomes.rows[0].redacted = false; // a concurrent un-tick
            return url;
        };
        await expect(t.service.approve(draft.id, t.reviewer)).rejects.toThrow('changed');
        expect(t.deleted).toEqual([t.uploads[0].key]);
        expect(t.outcomes.rows[0].published).toBe(false);
    });

    it('editing a published outcome refuses with 409, not a 500', async () => {
        const t = setup();
        const draft = await t.service.create(body(t), t.author);
        await t.service.setRedacted(draft.id, true, t.redactor);
        await t.service.approve(draft.id, t.reviewer);
        for (const call of [
            () => t.service.setRedacted(draft.id, false, t.redactor),
            async () => t.service.setImage(draft.id, { buffer: await photo() }, undefined, t.author),
        ]) {
            await expect(call()).rejects.toThrow('Unpublish');
        }
    });

    it('counts published outcomes with the same rule as the items, past the page limit', async () => {
        const t = setup();
        const base = {
            shelter: t.shelter._id,
            type: 'food',
            redacted: true,
            redactedBy: t.redactor._id,
            approvedBy: t.reviewer._id,
            createdBy: t.author._id,
            published: true,
        };
        for (let i = 0; i < 101; i++) {
            t.outcomes.rows.push({
                ...base,
                _id: new Types.ObjectId(),
                publicId: `o-${String(i).padStart(12, '0')}`,
                date: new Date(Date.UTC(2026, 0, 1 + i)),
            });
        }
        // Stored as published but approved by its own author: fails publishBlocker.
        t.outcomes.rows.push({
            ...base,
            _id: new Types.ObjectId(),
            publicId: 'o-bad000000000',
            date: new Date(Date.UTC(2026, 8, 1)),
            approvedBy: t.author._id,
        });
        const list = await t.service.publicOutcomes(new Date(9));
        expect(list.published).toBe(101);
        expect(list.items).toHaveLength(100);
        expect(list.items.map(i => i.id)).not.toContain('o-bad000000000');
    });

    it('a linked confirmed payout gives the outcome its tier; a draft payout gives none', async () => {
        const t = setup();
        t.payouts.rows.push(
            { _id: new Types.ObjectId(), publicId: 'p-aaaaaaaaaaaa', status: 'SHELTER_CONFIRMED', txHash: null },
            { _id: new Types.ObjectId(), publicId: 'p-bbbbbbbbbbbb', status: 'DRAFT' }
        );
        const a = await t.service.create(body(t, { payout: 'p-aaaaaaaaaaaa' }), t.author);
        const b = await t.service.create(body(t, { payout: 'p-bbbbbbbbbbbb', date: '2026-09-21' }), t.author);
        for (const o of [a, b]) {
            await t.service.setRedacted(o.id, true, t.redactor);
            await t.service.approve(o.id, t.reviewer);
        }
        const items = (await t.service.publicOutcomes(new Date(4))).items;
        expect(items.find(i => i.id === a.id)).toEqual(
            expect.objectContaining({ tier: 'shelter-confirmed', payoutId: 'p-aaaaaaaaaaaa' })
        );
        expect(items.find(i => i.id === b.id)).toEqual(expect.objectContaining({ tier: null, payoutId: null }));
        await expect(t.service.create(body(t, { payout: 'p-cccccccccccc' }), t.author)).rejects.toThrow(
            'Unknown payout'
        );
    });

    it('the schema refuses a published outcome that is not redacted or not approved by a second reviewer', async () => {
        const Model = mongoose.model(`OutcomeSpec${Date.now()}`, ShelterOutcomeSchema);
        const author = new Types.ObjectId();
        const base = {
            publicId: 'o-000000000001',
            shelter: new Types.ObjectId(),
            type: 'food',
            date: new Date(),
            createdBy: author,
            published: true,
        };
        await expect(new Model({ ...base, redacted: false }).validate()).rejects.toThrow('not marked redacted');
        await expect(new Model({ ...base, redacted: true, redactedBy: author }).validate()).rejects.toThrow(
            'second reviewer'
        );
        await expect(
            new Model({ ...base, redacted: true, redactedBy: author, approvedBy: author }).validate()
        ).rejects.toThrow('second reviewer');
        await expect(
            new Model({ ...base, redacted: true, redactedBy: author, approvedBy: new Types.ObjectId() }).validate()
        ).resolves.toBeUndefined();
        await expect(
            new Model({ ...base, published: false, animalName: 'Call 555-1234' }).validate()
        ).rejects.toThrow();
        expect(
            publishBlocker({
                redacted: true,
                redactedBy: author,
                approvedBy: new Types.ObjectId(),
                createdBy: author,
                image: { sha256: 'x' } as any,
            })
        ).toBe('the image is not uploaded');
        expect(ShelterOutcome).toBeDefined();
        expect(OUTCOME_TYPES).toContain('surgery');
    });
});

async function errorStatus(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (error: any) {
        return { status: error.getStatus?.(), code: error.getResponse?.()?.code };
    }
    throw new Error('expected a rejection');
}
