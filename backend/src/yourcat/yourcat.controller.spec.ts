import { HttpException } from '@nestjs/common';
import { GUARDS_METADATA, INTERCEPTORS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Types } from 'mongoose';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { UserThrottlerGuard } from 'src/shared/guards/user-throttler.guard';
import { ThrottlerException } from '@nestjs/throttler';
import { USER_THROTTLE_KEY } from 'src/shared/guards/user-throttler.guard';
import {
    portraitCheckoutQuotaId,
    secondsToUtcMidnight,
    STATS_ALWAYS_COUNTERS,
    withStatsDefaults,
    YOURCAT_THROTTLES,
    YourcatController,
    YourcatEnabledGuard,
} from './yourcat.controller';
import { YOURCAT_ERROR_CODES } from './yourcat.contracts';
import { catPhoto, DAY, guestUser, harness, NOW, registeredUser, uploadReq } from './yourcat-harness.helper-spec';

// Modules that create API clients at import time; the harness replaces every call they make.
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('stripe', () => ({ __esModule: true, default: jest.fn(() => ({})) }));
jest.mock('src/shared/utils/ai.utils', () => ({ generateCat: jest.fn() }));
jest.mock('src/shared/utils/ai-avatar', () => ({ generatePixelAvatar: jest.fn() }));
jest.mock('src/shared/utils/ai-portrait', () => ({ generatePortraitForImage: jest.fn() }));
jest.mock('src/shared/utils/aws.utils', () => ({
    PRIVATE_URL_PREFIX: 's3private://',
    YOURCAT_ORIGINALS_PREFIX: 'yourcat/originals/',
    uploadFile: jest.fn(),
    uploadPrivateObject: jest.fn(),
    uploadPublicObject: jest.fn(),
    deleteObject: jest.fn(),
}));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));

const body = { consent: 'true', noticeVersion: '2026-10-11' };

async function refusal(promise: Promise<unknown>) {
    const error = await promise.then(
        () => null,
        e => e
    );
    expect(error).toBeInstanceOf(HttpException);
    const response = (error as HttpException).getResponse() as any;
    expect(response.statusCode).toBe((error as HttpException).getStatus());
    return { status: (error as HttpException).getStatus(), code: response.code };
}

describe('/yourcat', () => {
    const OLD_ENV = process.env;
    beforeEach(() => {
        process.env = { ...OLD_ENV, NODE_ENV: 'test', YOURCAT_ENABLED: 'true', DO_SPACES_CDN: 'https://cdn.test' };
        delete process.env.AI_BUDGET_EUR_PER_DAY;
    });
    afterAll(() => {
        process.env = OLD_ENV;
    });

    describe('routes', () => {
        const proto = YourcatController.prototype as any;
        const guardsOf = (handler: string) => Reflect.getMetadata(GUARDS_METADATA, proto[handler]) || [];

        it('declares status, me, stats and manual before the :id routes', () => {
            const order = Object.getOwnPropertyNames(proto)
                .filter(
                    name =>
                        typeof proto[name] === 'function' &&
                        Reflect.getMetadata(METHOD_METADATA, proto[name]) !== undefined
                )
                .map(name => Reflect.getMetadata(PATH_METADATA, proto[name]));
            const firstId = order.findIndex(path => String(path).startsWith(':id'));
            for (const literal of ['status', 'me', 'stats', 'manual']) {
                expect(order.indexOf(literal)).toBeLessThan(firstId);
            }
        });

        it('guards: AppAuthGuard first, then the per-user and per-IP throttlers; kill switch before multer', () => {
            expect(guardsOf('upload')).toEqual([
                AppAuthGuard,
                YourcatEnabledGuard,
                UserThrottlerGuard,
                ClientIpThrottlerGuard,
            ]);
            expect(Reflect.getMetadata(INTERCEPTORS_METADATA, proto.upload)).toHaveLength(1);
            for (const handler of ['me', 'findOne', 'rename', 'remove', 'portraitCheckout']) {
                expect(guardsOf(handler)).toEqual([AppAuthGuard, UserThrottlerGuard, ClientIpThrottlerGuard]);
            }
            expect(guardsOf('status')).toEqual([]);
            expect(Reflect.getMetadata('THROTTLER:SKIPdefault', YourcatController)).toBe(true);
        });

        it('the kill switch answers 503 YOURCAT_DISABLED', async () => {
            process.env.YOURCAT_ENABLED = 'false';
            expect(() => new YourcatEnabledGuard().canActivate()).toThrow(HttpException);
            try {
                new YourcatEnabledGuard().canActivate();
            } catch (error) {
                expect((error as HttpException).getStatus()).toBe(503);
                expect(((error as HttpException).getResponse() as any).code).toBe('YOURCAT_DISABLED');
            }
        });

        it('every error code used is in the contract list', () => {
            expect(YOURCAT_ERROR_CODES).toContain('YOURCAT_PORTRAIT_EXISTS');
            expect(YOURCAT_ERROR_CODES).toContain('YOURCAT_STYLE_INVALID');
            expect(YOURCAT_ERROR_CODES).toHaveLength(23);
        });
    });

    describe('POST /yourcat', () => {
        it('without consent is 400 CONSENT_REQUIRED and calls nothing', async () => {
            const h = harness({ users: [guestUser()] });
            const user = h.users.docs[0];
            expect(
                await refusal(
                    h.service.uploadPhoto(user, uploadReq(), { buffer: await catPhoto() }, { noticeVersion: 'v1' })
                )
            ).toEqual({ status: 400, code: 'YOURCAT_CONSENT_REQUIRED' });
            expect(h.io.generateCat).not.toHaveBeenCalled();
        });

        it.each([
            ['a dog photo', { screen: { isCat: false, personVisible: false } }, 422, 'YOURCAT_NO_CAT'],
            [
                'a photo with a person',
                { screen: { isCat: true, personVisible: true }, origin: 'BLACK', type: 'ICE' },
                422,
                'YOURCAT_PERSON_VISIBLE',
            ],
        ])(
            '%s: refused, nothing uploaded, attempt released, failure counted, cost settled',
            async (_, answer, status, code) => {
                const h = harness({ users: [guestUser()] });
                const user = h.users.docs[0];
                h.io.generateCat.mockImplementationOnce(async (_name: string, _url: string, options: any) => {
                    options.onUsage({
                        provider: 'openai',
                        model: 'gpt-4o-mini',
                        inputTokens: 10_000,
                        outputTokens: 20,
                        images: 0,
                        imageSize: null,
                    });
                    return answer;
                });

                expect(
                    await refusal(h.service.uploadPhoto(user, uploadReq(), { buffer: await catPhoto() }, body))
                ).toEqual({
                    status,
                    code,
                });
                expect(h.s3).toEqual([]);
                const attempts = h.quotas.docs.filter(doc => !doc._id.includes(':fail:'));
                expect(attempts.map(doc => doc.count)).toEqual([0, 0]);
                expect(h.quotas.docs.find(doc => doc._id.includes(':fail:'))?.count).toBe(1);
                // Settled at the measured cost (10,000 input tokens at €0.14 per million), not the €0.08 reservation.
                expect(h.days.byKey(DAY)).toMatchObject({ committedMicroEur: 1410 + 1, spentMicroEur: 1411 });
                expect(h.yourcats.docs).toEqual([]);
            }
        );

        it('calls the classifier (with a data URL) before any S3 write', async () => {
            const h = harness({ users: [guestUser()] });
            const order: string[] = [];
            h.io.generateCat.mockImplementationOnce(async (_name: string, url: string) => {
                order.push(`classify:${url.slice(0, 23)}`);
                return {
                    name: 'My cat',
                    resqueStory: 'x',
                    type: 'FIRE',
                    origin: 'Black.',
                    spriteImg: '',
                    catImg: '',
                    screen: { isCat: true, personVisible: false },
                };
            });
            h.io.uploadPrivateObject.mockImplementationOnce(async (key: string) => {
                order.push(`put:${key.slice(0, 18)}`);
            });
            await h.service.uploadPhoto(h.users.docs[0], uploadReq(), { buffer: await catPhoto() }, body);
            expect(order).toEqual(['classify:data:image/webp;base64,', 'put:yourcat/originals/']);
        });

        it('a classifier timeout aborts the request and settles the fallback cost', async () => {
            const h = harness({ users: [guestUser()] });
            h.service.timeouts.classifyMs = 20;
            let aborted = false;
            h.io.generateCat.mockImplementationOnce(
                (_name: string, _url: string, options: any) =>
                    new Promise(resolve =>
                        options.signal.addEventListener('abort', () => {
                            aborted = true;
                            resolve(null);
                        })
                    )
            );
            expect(
                await refusal(h.service.uploadPhoto(h.users.docs[0], uploadReq(), { buffer: await catPhoto() }, body))
            ).toEqual({ status: 502, code: 'YOURCAT_CLASSIFY_FAILED' });
            expect(aborted).toBe(true);
            expect(h.days.byKey(DAY)).toMatchObject({ spentMicroEur: 10_000, committedMicroEur: 10_000 });
            expect(h.s3).toEqual([]);
        });

        it('guest: restyles the starter, removes starterBreed, sets user.cat and onboarding done, keeps starterLockedAt', async () => {
            const guest = guestUser();
            const locked = new Date('2026-10-01T00:00:00Z');
            const starterId = new Types.ObjectId();
            const h = harness({
                users: [guest],
                cats: [
                    {
                        _id: starterId,
                        owner: guest._id,
                        isStarter: true,
                        isGuestStarter: true,
                        starterBreed: 'SCOUT',
                        origin: 'starter',
                        name: 'Scout',
                        starterLockedAt: locked,
                    },
                ],
            });

            const view = await h.service.uploadPhoto(h.users.docs[0], uploadReq(), { buffer: await catPhoto() }, body);
            await h.service.lastAvatarJob;

            const cat = h.cats.docs.find(doc => String(doc._id) === String(starterId))!;
            expect(cat.starterBreed).toBeUndefined();
            expect(cat).toMatchObject({
                name: 'My cat',
                type: 'FIRE',
                origin: 'starter',
                isGuestStarter: true,
                spriteImg: 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/YELLOW/base.png',
                catImg: 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/YELLOW/base/GROOMING.gif',
                resqueStory: 'Made from a photo on tokentails.com/yourcat.',
            });
            expect(cat.starterLockedAt).toEqual(locked);
            const user = h.users.docs[0];
            expect(String(user.cat)).toBe(String(starterId));
            expect(user.onboarding).toMatchObject({ state: 'done', version: 1, skipped: false, starterChosenAt: NOW });
            expect(view).toMatchObject({ name: 'My cat', named: false, family: 'YELLOW', familyLabel: 'Ginger' });
            expect(view.cat._id).toBe(String(starterId));
            expect(h.catService.createBlessingWithCat).not.toHaveBeenCalled();
        });

        it('guest: a starter without a lock gets one; a second upload restyles the same cat', async () => {
            const h = harness({ users: [guestUser()] });
            const user = h.users.docs[0];
            const first = await h.service.uploadPhoto(user, uploadReq(), { buffer: await catPhoto() }, body);
            h.io.generateCat.mockResolvedValueOnce({
                name: 'Tom',
                resqueStory: 'x',
                type: 'ICE',
                origin: 'OREO',
                spriteImg: '',
                catImg: '',
                screen: { isCat: true, personVisible: false },
            });
            const second = await h.service.uploadPhoto(
                h.users.docs[0],
                uploadReq(),
                { buffer: await catPhoto() },
                body
            );
            expect(second.cat._id).toBe(first.cat._id);
            expect(h.cats.docs.filter(doc => String(doc.owner) === String(user._id))).toHaveLength(1);
            expect(h.cats.docs[0]).toMatchObject({ starterLockedAt: NOW, type: 'ICE' });
            expect(h.cats.docs[0].spriteImg).toContain('/OREO/base.png');
        });

        it('registered: creates one cat, then reuses it; a pending onboarding is set done', async () => {
            const h = harness({ users: [registeredUser({ onboarding: { state: 'pending', version: 1 } })] });
            const user = h.users.docs[0];
            const first = await h.service.uploadPhoto(user, uploadReq(), { buffer: await catPhoto() }, body);
            expect(h.catService.addCatToTheOwner).toHaveBeenCalledTimes(1);
            expect(String(h.users.docs[0].cat)).toBe(first.cat._id);
            expect(h.users.docs[0].onboarding).toMatchObject({ state: 'done', starterChosenAt: NOW });
            const created = h.cats.docs[0];
            expect(created).toMatchObject({ tier: 'COMMON', isBlueprint: false, status: { EAT: 0 } });
            for (const field of ['origin', 'blessing', 'shelter', 'isStarter', 'starterBreed']) {
                expect(created[field]).toBeUndefined();
            }

            const second = await h.service.uploadPhoto(
                h.users.docs[0],
                uploadReq(),
                { buffer: await catPhoto() },
                body
            );
            expect(second.cat._id).toBe(first.cat._id);
            expect(h.cats.docs).toHaveLength(1);
            expect(h.catService.addCatToTheOwner).toHaveBeenCalledTimes(1);
        });

        it('registered: an onboarding already done is left untouched', async () => {
            const chosen = new Date('2026-01-01T00:00:00Z');
            const h = harness({
                users: [
                    registeredUser({
                        onboarding: { state: 'done', version: 1, skipped: true, starterChosenAt: chosen },
                    }),
                ],
            });
            await h.service.uploadPhoto(h.users.docs[0], uploadReq(), { buffer: await catPhoto() }, body);
            expect(h.users.docs[0].onboarding).toEqual({
                state: 'done',
                version: 1,
                skipped: true,
                starterChosenAt: chosen,
            });
        });

        it('the response never contains originalKey, s3private or an IP', async () => {
            const h = harness({ users: [guestUser()] });
            const view = await h.service.uploadPhoto(h.users.docs[0], uploadReq(), { buffer: await catPhoto() }, body);
            const text = JSON.stringify(view);
            expect(text).not.toContain('originalKey');
            expect(text).not.toContain('s3private');
            expect(text).not.toContain('yourcat/originals');
            expect(text).not.toContain('203.0.113.7');
            expect(view.photo).toEqual({ stored: true, deleteAfter: '2026-11-10T12:00:00.000Z' });
            expect(JSON.stringify(h.yourcats.docs)).not.toContain('203.0.113.7');
        });

        it('draws the avatar in the background and settles the measured cost', async () => {
            const h = harness({ users: [guestUser()] });
            const view = await h.service.uploadPhoto(h.users.docs[0], uploadReq(), { buffer: await catPhoto() }, body);
            expect(view.avatar).toEqual({ status: 'pending', url: null });
            await h.service.lastAvatarJob;
            const record = h.yourcats.docs[0];
            expect(record.avatarStatus).toBe('ready');
            expect(record.avatarUrl).toMatch(/^https:\/\/cdn\.test\/yourcat\/avatars\/.+\.png$/);
            // KI-18: a deleted avatar leaves the CDN edge within 5 minutes.
            expect(h.io.uploadPublicObject).toHaveBeenCalledWith(
                expect.objectContaining({ cacheControl: 'public, max-age=300' })
            );
            expect(h.s3.filter(entry => entry.startsWith('put-public:yourcat/avatars/'))).toHaveLength(1);
            const day = h.days.byKey(DAY)!;
            expect(day.counts).toMatchObject({ yourcatAdmitted: 1, yourcatDone: 1, avatarsReady: 1 });
            expect(day.committedMicroEur).toBe(day.spentMicroEur);
        });

        it('a Gemini safety block marks the avatar failed and uploads nothing', async () => {
            const h = harness({ users: [guestUser()] });
            h.io.generatePixelAvatar.mockResolvedValueOnce(null as any);
            await h.service.uploadPhoto(h.users.docs[0], uploadReq(), { buffer: await catPhoto() }, body);
            await h.service.lastAvatarJob;
            expect(h.yourcats.docs[0].avatarStatus).toBe('failed');
            expect(h.s3.some(entry => entry.startsWith('put-public:'))).toBe(false);
            expect(h.days.byKey(DAY)?.counts?.avatarsFailed).toBe(1);
        });

        it('a record still pending 60 s after creation reads as failed', async () => {
            const h = harness({ users: [guestUser()] });
            const user = h.users.docs[0];
            h.io.generatePixelAvatar.mockImplementationOnce(() => new Promise(() => undefined));
            const view = await h.service.uploadPhoto(user, uploadReq(), { buffer: await catPhoto() }, body);
            expect(view.avatar.status).toBe('pending');
            h.service.now = () => new Date(NOW.getTime() + 61_000);
            expect((await h.service.get(user, view.id)).avatar.status).toBe('failed');
        });
    });

    describe('POST /yourcat/manual', () => {
        it('creates a playable cat with no S3 call and no budget write', async () => {
            process.env.AI_MANUAL_USER_DAILY = '5';
            const h = harness({ users: [guestUser()] });
            const view = await h.service.createManual(h.users.docs[0], { family: 'OREO', name: 'Pip' });
            expect(view).toMatchObject({
                family: 'OREO',
                named: true,
                name: 'Pip',
                avatar: { status: 'none', url: null },
            });
            expect(view.photo).toEqual({ stored: false, deleteAfter: null });
            expect(h.s3).toEqual([]);
            expect(h.io.generateCat).not.toHaveBeenCalled();
            expect(h.days.docs.map(doc => doc.committedMicroEur || 0)).toEqual([0]);
            expect(h.cats.docs[0].resqueStory).toBe('Made on tokentails.com/yourcat.');
        });

        it('refuses PEACHES and unknown families', async () => {
            const h = harness({ users: [guestUser()] });
            for (const family of ['PEACHES', 'TABBY', undefined]) {
                expect((await refusal(h.service.createManual(h.users.docs[0], { family }))).code).toBe(
                    'YOURCAT_FAMILY_INVALID'
                );
            }
        });
    });

    describe('reads, rename and delete', () => {
        async function uploaded() {
            const h = harness({ users: [guestUser(), registeredUser()] });
            const user = h.users.docs[0];
            const view = await h.service.uploadPhoto(user, uploadReq(), { buffer: await catPhoto() }, body);
            await h.service.lastAvatarJob;
            return { h, user, view };
        }

        it("another user's id, a deleted record and a malformed id are 404 NOT_FOUND", async () => {
            const { h, view } = await uploaded();
            const other = h.users.docs[1];
            expect(await refusal(h.service.get(other, view.id))).toEqual({ status: 404, code: 'YOURCAT_NOT_FOUND' });
            expect((await refusal(h.service.get(h.users.docs[0], 'me'))).code).toBe('YOURCAT_NOT_FOUND');
            expect((await refusal(h.service.remove(other, view.id))).code).toBe('YOURCAT_NOT_FOUND');
        });

        it('GET /yourcat/me returns the latest record, null for a transient guest', async () => {
            const { h, user, view } = await uploaded();
            expect((await h.service.latest(user)).item?.id).toBe(view.id);
            expect(await h.service.latest({ transient: true, isGuest: true })).toEqual({ item: null });
        });

        it('PATCH renames the record and the cat and sets named, inside the 24 h window only', async () => {
            const { h, user, view } = await uploaded();
            const renamed = await h.service.rename(user, view.id, 'Biscuit');
            expect(renamed).toMatchObject({ name: 'Biscuit', named: true });
            expect(h.cats.docs[0].name).toBe('Biscuit');
            expect(h.cats.docs[0].nameChangedAt).toBeUndefined();
            expect((await refusal(h.service.rename(user, view.id, 'B4d!'))).code).toBe('YOURCAT_NAME_INVALID');

            h.service.now = () => new Date(NOW.getTime() + 25 * 60 * 60 * 1000);
            expect(await refusal(h.service.rename(user, view.id, 'Later'))).toEqual({
                status: 400,
                code: 'YOURCAT_NAME_INVALID',
            });
        });

        it('DELETE deletes both objects and clears originalSha256', async () => {
            const { h, user, view } = await uploaded();
            const record = { ...h.yourcats.docs[0] };
            await expect(h.service.remove(user, view.id)).resolves.toEqual({
                success: true,
                photoKeptUntilDelivery: false,
            });
            expect(h.s3).toEqual(
                expect.arrayContaining([`delete:${record.avatarKey}`, `delete:${record.originalKey}`])
            );
            expect(h.yourcats.docs[0]).toMatchObject({
                originalKey: null,
                originalSha256: null,
                avatarKey: null,
                avatarUrl: null,
                deletedAt: NOW,
            });
            expect((await refusal(h.service.get(user, view.id))).code).toBe('YOURCAT_NOT_FOUND');
            // The game cat keeps its look and name.
            expect(h.cats.docs[0].spriteImg).toContain('/YELLOW/base.png');
        });

        it('DELETE with a paid undelivered portrait keeps the original until delivery', async () => {
            const { h, user, view } = await uploaded();
            const image: any = await h.images.create({ url: 's3private://x', source: 'yourcat' });
            await h.yourcats.updateOne({}, { $set: { portraitImage: image._id } });
            await h.orders.create({ image: image._id, entityType: 'IMAGE', status: 'COMPLETE', hash: 'cs_paid' });
            const originalKey = h.yourcats.docs[0].originalKey;

            await expect(h.service.remove(user, view.id)).resolves.toEqual({
                success: true,
                photoKeptUntilDelivery: true,
            });
            expect(h.s3).not.toContain(`delete:${originalKey}`);
            expect(h.yourcats.docs[0]).toMatchObject({
                originalKey,
                deleteOriginalAfterDelivery: true,
                avatarKey: null,
            });
        });

        it('DELETE expires an open checkout session', async () => {
            const { h, user, view } = await uploaded();
            const image: any = await h.images.create({ url: 's3private://x', source: 'yourcat' });
            await h.yourcats.updateOne({}, { $set: { portraitImage: image._id } });
            const session = await h.stripe.checkout.sessions.create({ metadata: {} });
            await h.orders.create({ image: image._id, entityType: 'IMAGE', status: 'PENDING', hash: session.id });

            await h.service.remove(user, view.id);
            expect(h.stripe.checkout.sessions.expire).toHaveBeenCalledWith(session.id);
            expect(h.stripe.sessions.get(session.id).status).toBe('expired');
        });

        it('DELETE treats a session that turned out complete as paid', async () => {
            const { h, user, view } = await uploaded();
            const image: any = await h.images.create({ url: 's3private://x', source: 'yourcat' });
            await h.yourcats.updateOne({}, { $set: { portraitImage: image._id } });
            const session = await h.stripe.checkout.sessions.create({ metadata: {} });
            session.status = 'complete';
            await h.orders.create({ image: image._id, entityType: 'IMAGE', status: 'PENDING', hash: session.id });

            await expect(h.service.remove(user, view.id)).resolves.toMatchObject({ photoKeptUntilDelivery: true });
        });

        it('DELETE after the third failed delivery deletes the original at once', async () => {
            const { h, user, view } = await uploaded();
            const image: any = await h.images.create({ url: 's3private://x', source: 'yourcat' });
            await h.yourcats.updateOne({}, { $set: { portraitImage: image._id, portraitAttempts: 3 } });
            await h.orders.create({ image: image._id, entityType: 'IMAGE', status: 'COMPLETE', hash: 'cs_paid' });
            const originalKey = h.yourcats.docs[0].originalKey;

            await expect(h.service.remove(user, view.id)).resolves.toEqual({
                success: true,
                photoKeptUntilDelivery: false,
            });
            expect(h.s3).toContain(`delete:${originalKey}`);
            expect(h.yourcats.docs[0]).toMatchObject({ originalKey: null, deletedAt: NOW });
        });

        it('DELETE keeps the photo 3 days when an open session can be neither expired nor read', async () => {
            const { h, user, view } = await uploaded();
            const image: any = await h.images.create({ url: 's3private://x', source: 'yourcat' });
            await h.yourcats.updateOne({}, { $set: { portraitImage: image._id } });
            const session = await h.stripe.checkout.sessions.create({ metadata: {} });
            await h.orders.create({
                image: image._id,
                entityType: 'IMAGE',
                status: 'PENDING',
                hash: session.id,
                createdAt: new Date(NOW.getTime() - 10 * 60 * 1000),
            });
            h.stripe.checkout.sessions.expire.mockRejectedValueOnce(new Error('stripe 500'));
            h.stripe.checkout.sessions.retrieve.mockRejectedValueOnce(new Error('stripe 500'));
            const originalKey = h.yourcats.docs[0].originalKey;

            await expect(h.service.remove(user, view.id)).resolves.toEqual({
                success: true,
                photoKeptUntilDelivery: true,
            });
            expect(h.s3).not.toContain(`delete:${originalKey}`);
            expect(h.yourcats.docs[0]).toMatchObject({
                originalKey,
                deleteOriginalAfterDelivery: true,
                originalDeleteAfter: new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000),
                deletedAt: NOW,
            });
        });

        it('an upload whose record cannot be stored deletes the private original again', async () => {
            const h = harness({ users: [guestUser()] });
            const user = h.users.docs[0];
            const create = jest.spyOn(h.yourcats, 'create').mockRejectedValueOnce(new Error('mongo down'));
            await expect(h.service.uploadPhoto(user, uploadReq(), { buffer: await catPhoto() }, body)).rejects.toThrow(
                'mongo down'
            );
            create.mockRestore();
            const put = h.s3.find(entry => entry.startsWith('put-private:')) as string;
            expect(put).toBeDefined();
            expect(h.s3).toContain(`delete:${put.slice('put-private:'.length)}`);
        });
    });

    describe('KI-01 / KI-02: the record is stored before the cat changes', () => {
        function guestWithStarter() {
            const guest = guestUser();
            const starterId = new Types.ObjectId();
            const h = harness({
                users: [guest],
                cats: [
                    {
                        _id: starterId,
                        owner: guest._id,
                        isStarter: true,
                        isGuestStarter: true,
                        starterBreed: 'SCOUT',
                        origin: 'starter',
                        name: 'Scout',
                    },
                ],
            });
            return { h, starterId };
        }

        const expectUntouched = (h: ReturnType<typeof harness>, starterId: Types.ObjectId) => {
            const cat = h.cats.docs.find(doc => String(doc._id) === String(starterId))!;
            expect(cat).toMatchObject({ name: 'Scout', starterBreed: 'SCOUT' });
            expect(cat.spriteImg).toBeUndefined();
            expect(cat.starterLockedAt).toBeUndefined();
            const user = h.users.docs[0];
            expect(user.cat).toBeUndefined();
            expect(user.onboarding.state).toBe('pending');
        };

        it('upload: repository.create throws, so the cat look, user.cat and onboarding are unchanged', async () => {
            const { h, starterId } = guestWithStarter();
            jest.spyOn(h.yourcats, 'create').mockRejectedValueOnce(new Error('mongo down'));
            jest.spyOn((h.service as any).logger, 'error').mockImplementation(() => undefined);
            await expect(
                h.service.uploadPhoto(h.users.docs[0], uploadReq(), { buffer: await catPhoto() }, body)
            ).rejects.toThrow('mongo down');
            expectUntouched(h, starterId);
            expect(h.yourcats.docs).toEqual([]);
            // The attempt is given back.
            const attempts = h.quotas.docs.filter(doc => !doc._id.includes(':fail:'));
            expect(attempts.map(doc => doc.count)).toEqual([0, 0]);
        });

        it('upload: makePlayable throws, so the placeholder and the original are deleted and the attempt released', async () => {
            const { h, starterId } = guestWithStarter();
            jest.spyOn(h.service, 'makePlayable').mockRejectedValueOnce(new Error('cats down'));
            jest.spyOn((h.service as any).logger, 'error').mockImplementation(() => undefined);
            await expect(
                h.service.uploadPhoto(h.users.docs[0], uploadReq(), { buffer: await catPhoto() }, body)
            ).rejects.toThrow('cats down');
            expectUntouched(h, starterId);
            expect(h.yourcats.docs).toEqual([]);
            const put = h.s3.find(entry => entry.startsWith('put-private:')) as string;
            expect(h.s3).toContain(`delete:${put.slice('put-private:'.length)}`);
            const attempts = h.quotas.docs.filter(doc => !doc._id.includes(':fail:'));
            expect(attempts.map(doc => doc.count)).toEqual([0, 0]);
            expect(h.days.byKey(DAY)?.counts?.yourcatFailed).toBe(1);
        });

        it('upload: the placeholder is inserted before the cat is restyled, then finished in one write', async () => {
            const { h } = guestWithStarter();
            const seen: any[] = [];
            const makePlayable = h.service.makePlayable.bind(h.service);
            jest.spyOn(h.service, 'makePlayable').mockImplementationOnce(async (...args) => {
                seen.push(...h.yourcats.docs.map(doc => ({ ...doc })));
                return makePlayable(...args);
            });
            const view = await h.service.uploadPhoto(h.users.docs[0], uploadReq(), { buffer: await catPhoto() }, body);
            expect(seen).toHaveLength(1);
            expect(seen[0]).toMatchObject({ cat: null, creatingAt: NOW });
            expect(h.yourcats.docs[0].creatingAt).toBeUndefined();
            expect(String(h.yourcats.docs[0].cat)).toBe(view.cat._id);
        });

        it('a placeholder is invisible to GET /yourcat/me, GET /:id and DELETE, and never reused as the cat', async () => {
            const h = harness({ users: [registeredUser()] });
            const user = h.users.docs[0];
            const placeholder: any = await h.yourcats.create({
                owner: user._id,
                source: 'photo',
                name: 'My cat',
                family: 'OREO',
                cat: null,
                creatingAt: NOW,
                avatarStatus: 'pending',
                deletedAt: null,
            });
            expect(await h.service.latest(user)).toEqual({ item: null });
            expect((await refusal(h.service.get(user, String(placeholder._id)))).code).toBe('YOURCAT_NOT_FOUND');
            expect((await refusal(h.service.remove(user, String(placeholder._id)))).code).toBe('YOURCAT_NOT_FOUND');

            await h.service.makePlayable(user, { name: 'Pip', family: 'OREO', type: 'FIRE', source: 'manual' });
            expect(h.catService.addCatToTheOwner).toHaveBeenCalledTimes(1);
        });

        it('manual: makePlayable throws, so the placeholder is deleted and the cat is unchanged', async () => {
            process.env.AI_MANUAL_USER_DAILY = '5';
            const { h, starterId } = guestWithStarter();
            jest.spyOn(h.service, 'makePlayable').mockRejectedValueOnce(new Error('cats down'));
            jest.spyOn((h.service as any).logger, 'error').mockImplementation(() => undefined);
            await expect(h.service.createManual(h.users.docs[0], { family: 'OREO', name: 'Pip' })).rejects.toThrow(
                'cats down'
            );
            expect(h.yourcats.docs).toEqual([]);
            expectUntouched(h, starterId);
            expect(h.days.byKey(DAY)?.counts?.manualCats).toBeUndefined();
        });

        it('manual: repository.create throws, so the cat is unchanged', async () => {
            process.env.AI_MANUAL_USER_DAILY = '5';
            const { h, starterId } = guestWithStarter();
            jest.spyOn(h.yourcats, 'create').mockRejectedValueOnce(new Error('mongo down'));
            await expect(h.service.createManual(h.users.docs[0], { family: 'OREO' })).rejects.toThrow('mongo down');
            expectUntouched(h, starterId);
        });

        describe('KI-01 remainder: finishing the placeholder fails after the cat was made', () => {
            const failFinish = (h: ReturnType<typeof harness>, times: number) => {
                const finish = (h.service as any).finishPlaceholder.bind(h.service);
                let left = times;
                return jest.spyOn(h.service as any, 'finishPlaceholder').mockImplementation(async (...args: any[]) => {
                    if (left > 0) {
                        left -= 1;
                        throw new Error('write lost');
                    }
                    return finish(...args);
                });
            };

            it('upload: one failure is retried, the record is stored and no alert goes out', async () => {
                const { h, starterId } = guestWithStarter();
                const spy = failFinish(h, 1);
                jest.spyOn((h.service as any).logger, 'warn').mockImplementation(() => undefined);
                const view = await h.service.uploadPhoto(
                    h.users.docs[0],
                    uploadReq(),
                    { buffer: await catPhoto() },
                    body
                );
                expect(spy).toHaveBeenCalledTimes(2);
                expect(h.yourcats.docs).toHaveLength(1);
                expect(h.yourcats.docs[0].creatingAt).toBeUndefined();
                expect(String(h.yourcats.docs[0].cat)).toBe(String(starterId));
                expect(view.cat._id).toBe(String(starterId));
                expect(h.budget.alert).not.toHaveBeenCalled();
                expect(h.days.byKey(DAY)?.counts?.yourcatDone).toBe(1);
            });

            it('upload: two failures alert with ids only, then the upload fails and cleans up', async () => {
                const { h, starterId } = guestWithStarter();
                const spy = failFinish(h, 2);
                jest.spyOn((h.service as any).logger, 'warn').mockImplementation(() => undefined);
                const error = jest.spyOn((h.service as any).logger, 'error').mockImplementation(() => undefined);
                const user = h.users.docs[0];
                await expect(
                    h.service.uploadPhoto(user, uploadReq(), { buffer: await catPhoto() }, body)
                ).rejects.toThrow('write lost');
                expect(spy).toHaveBeenCalledTimes(2);

                // The cat was made and user.cat points at it, with no record: that is alerted.
                expect(String(h.users.docs[0].cat)).toBe(String(starterId));
                expect(h.yourcats.docs).toEqual([]);
                expect(h.budget.alert).toHaveBeenCalledTimes(1);
                const [subject, text] = (h.budget.alert as jest.Mock).mock.calls[0];
                expect(subject).toBe(`/yourcat cat made without a record (cat ${starterId})`);
                expect(text).toContain(String(starterId));
                expect(text).toContain(String(user._id));
                // Ids only: no photo key or URL, no name.
                expect(text).not.toMatch(/s3private:|https?:|yourcat\/originals|\.webp/);
                expect(error.mock.calls.some(call => String(call[0]).includes('made without a record'))).toBe(true);

                // The usual failure path: original deleted, attempt released, counted as failed.
                const put = h.s3.find(entry => entry.startsWith('put-private:')) as string;
                expect(h.s3).toContain(`delete:${put.slice('put-private:'.length)}`);
                const attempts = h.quotas.docs.filter(doc => !doc._id.includes(':fail:'));
                expect(attempts.map(doc => doc.count)).toEqual([0, 0]);
                expect(h.days.byKey(DAY)?.counts?.yourcatFailed).toBe(1);
                expect(h.days.byKey(DAY)?.counts?.yourcatDone).toBeUndefined();
            });

            it('upload: an alert sender that throws does not hide the original error', async () => {
                const { h } = guestWithStarter();
                failFinish(h, 2);
                jest.spyOn((h.service as any).logger, 'warn').mockImplementation(() => undefined);
                jest.spyOn((h.service as any).logger, 'error').mockImplementation(() => undefined);
                (h.budget.alert as jest.Mock).mockRejectedValueOnce(new Error('sendgrid down'));
                await expect(
                    h.service.uploadPhoto(h.users.docs[0], uploadReq(), { buffer: await catPhoto() }, body)
                ).rejects.toThrow('write lost');
            });

            it('a finish whose write landed but whose reply was lost returns the finished record', async () => {
                const { h, starterId } = guestWithStarter();
                const update = h.yourcats.findOneAndUpdate.bind(h.yourcats);
                let first = true;
                jest.spyOn(h.yourcats, 'findOneAndUpdate').mockImplementation(((...args: any[]) => {
                    const query = (update as any)(...args);
                    if (!first) {
                        return query;
                    }
                    first = false;
                    // The write is applied, then the reply is lost.
                    return {
                        lean: async () => {
                            await query.lean();
                            throw new Error('reply lost');
                        },
                    };
                }) as any);
                jest.spyOn((h.service as any).logger, 'warn').mockImplementation(() => undefined);
                const view = await h.service.uploadPhoto(
                    h.users.docs[0],
                    uploadReq(),
                    { buffer: await catPhoto() },
                    body
                );
                expect(view.cat._id).toBe(String(starterId));
                expect(h.yourcats.docs).toHaveLength(1);
                expect(h.budget.alert).not.toHaveBeenCalled();
            });

            it('manual: two failures alert and fail; one failure is retried', async () => {
                process.env.AI_MANUAL_USER_DAILY = '5';
                const { h, starterId } = guestWithStarter();
                jest.spyOn((h.service as any).logger, 'warn').mockImplementation(() => undefined);
                jest.spyOn((h.service as any).logger, 'error').mockImplementation(() => undefined);
                const spy = failFinish(h, 2);
                await expect(h.service.createManual(h.users.docs[0], { family: 'OREO', name: 'Pip' })).rejects.toThrow(
                    'write lost'
                );
                expect(h.yourcats.docs).toEqual([]);
                expect(h.budget.alert).toHaveBeenCalledTimes(1);
                expect((h.budget.alert as jest.Mock).mock.calls[0][1]).toContain('manual');
                expect(h.days.byKey(DAY)?.counts?.manualCats).toBeUndefined();

                spy.mockRestore();
                failFinish(h, 1);
                const view = await h.service.createManual(h.users.docs[0], { family: 'OREO', name: 'Pip' });
                expect(view.cat._id).toBe(String(starterId));
                expect(h.yourcats.docs).toHaveLength(1);
                expect(h.budget.alert).toHaveBeenCalledTimes(1);
            });
        });

        it('manual: the stored record has its cat and no creatingAt', async () => {
            process.env.AI_MANUAL_USER_DAILY = '5';
            const h = harness({ users: [guestUser()] });
            const view = await h.service.createManual(h.users.docs[0], { family: 'OREO', name: 'Pip' });
            expect(h.yourcats.docs).toHaveLength(1);
            expect(h.yourcats.docs[0].creatingAt).toBeUndefined();
            expect(String(h.yourcats.docs[0].cat)).toBe(view.cat._id);
        });
    });

    describe('POST /yourcat/:id/portrait-checkout style', () => {
        it('an unknown style is 400 YOURCAT_STYLE_INVALID; a bad noticeVersion stays CONSENT_REQUIRED', async () => {
            process.env.YOURCAT_PORTRAIT_ENABLED = 'true';
            const h = harness({ users: [guestUser()] });
            const user = h.users.docs[0];
            const view = await h.service.uploadPhoto(user, uploadReq(), { buffer: await catPhoto() }, body);
            for (const style of ['cubist', undefined, 42]) {
                expect(await refusal(h.service.portraitCheckout(user, view.id, style))).toEqual({
                    status: 400,
                    code: 'YOURCAT_STYLE_INVALID',
                });
            }
            expect(h.checkoutService.create).not.toHaveBeenCalled();
            expect(
                await refusal(
                    h.service.uploadPhoto(
                        user,
                        uploadReq(),
                        { buffer: await catPhoto() },
                        { consent: 'true', noticeVersion: 'x'.repeat(17) }
                    )
                )
            ).toEqual({ status: 400, code: 'YOURCAT_CONSENT_REQUIRED' });
        });
    });

    describe('POST /yourcat/:id/portrait-checkout limits (KI-15)', () => {
        it('the per-minute burst stays in memory: 5 a minute per user and per address', () => {
            const proto = YourcatController.prototype as any;
            expect(Reflect.getMetadata(USER_THROTTLE_KEY, proto.portraitCheckout)).toEqual({ limit: 5, ttl: 60000 });
            expect(YOURCAT_THROTTLES.checkout.ip).toEqual({ limit: 5, ttl: 60000 });
        });

        it('10 checkouts a day per user, counted in the Mongo quota collection; then 429 until UTC midnight', async () => {
            const h = harness({ users: [guestUser(), guestUser()] });
            const controller = new YourcatController(h.service, h.budget, {} as any);
            const [user, other] = h.users.docs;
            for (let index = 0; index < 10; index++) {
                await controller.claimDailyCheckout(user);
            }
            const res = { header: jest.fn() };
            await expect(controller.claimDailyCheckout(user, res)).rejects.toThrow(ThrottlerException);
            expect(res.header).toHaveBeenCalledWith('Retry-After', 12 * 60 * 60);
            expect(h.quotas.byKey(portraitCheckoutQuotaId(String(user._id), DAY))?.count).toBe(10);

            // Another user has its own counter; a new UTC day starts a new one.
            await controller.claimDailyCheckout(other);
            h.budget.now = () => new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
            await controller.claimDailyCheckout(user);
            expect(h.quotas.byKey(portraitCheckoutQuotaId(String(user._id), '2026-10-12'))?.count).toBe(1);
        });

        it('the handler claims the daily slot before the service runs', async () => {
            const h = harness({ users: [guestUser()] });
            const service = { portraitCheckout: jest.fn(async () => ({ checkoutUrl: 'u', orderId: 'o' })) };
            const controller = new YourcatController(service as any, h.budget, {} as any);
            const user = h.users.docs[0];
            await h.quotas.updateOne(
                { _id: portraitCheckoutQuotaId(String(user._id), DAY) },
                { $set: { count: 10 } },
                { upsert: true }
            );
            await expect(controller.portraitCheckout(user, 'id', { style: 'monarch' }, {})).rejects.toThrow(
                ThrottlerException
            );
            expect(service.portraitCheckout).not.toHaveBeenCalled();
        });

        it('secondsToUtcMidnight', () => {
            expect(secondsToUtcMidnight(new Date('2026-10-11T23:59:59.500Z'))).toBe(1);
            expect(secondsToUtcMidnight(new Date('2026-10-11T00:00:00Z'))).toBe(24 * 60 * 60);
        });
    });

    describe('GET /yourcat/stats (KI-11)', () => {
        it('is admins only', () => {
            const guards = Reflect.getMetadata(GUARDS_METADATA, (YourcatController.prototype as any).stats) || [];
            expect(guards[0]).toBe(AppAuthGuard);
            expect(guards).toHaveLength(2);
        });

        it('every day carries portraitsEmailFailed and the delivery counters, 0 when not counted', async () => {
            const h = harness({ users: [guestUser()] });
            const controller = new YourcatController(h.service, h.budget, {} as any);
            await h.budget.count('portraitsEmailFailed', DAY, 2);
            await h.budget.count('yourcatDone', '2026-10-10');

            const { days } = await controller.stats('14');
            expect(STATS_ALWAYS_COUNTERS).toContain('portraitsEmailFailed');
            const today = days.find(day => day.day === DAY)!;
            expect(today.counts).toMatchObject({
                portraitsEmailFailed: 2,
                portraitsDelivered: 0,
                portraitsDeliveryFailed: 0,
            });
            const yesterday = days.find(day => day.day === '2026-10-10')!;
            expect(yesterday.counts).toEqual({
                portraitsDelivered: 0,
                portraitsDeliveryFailed: 0,
                portraitsEmailFailed: 0,
                yourcatDone: 1,
            });
        });

        it('withStatsDefaults keeps counted values and fills the rest', () => {
            expect(withStatsDefaults(undefined)).toEqual({
                portraitsDelivered: 0,
                portraitsDeliveryFailed: 0,
                portraitsEmailFailed: 0,
            });
            expect(withStatsDefaults({ portraitsDelivered: 3 }).portraitsDelivered).toBe(3);
        });
    });
});
