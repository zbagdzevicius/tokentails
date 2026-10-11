import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Types } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { AiBudgetService, AiTicket } from 'src/ai-budget/ai-budget.service';
import { AiUsage, measuredOrFallback } from 'src/ai-budget/ai-cost';
import { AiUploadGate } from 'src/ai-budget/ai-upload-gate';
import { CatNameService } from 'src/cat/cat-name.service';
import { CatRepository } from 'src/cat/cat.repository';
import { CatAbilityType, Tier } from 'src/cat/cat.schema';
import { CatService } from 'src/cat/cat.service';
import { generateRandomNumber } from 'src/common/utils';
import { IAuthUser } from 'src/common/decorators/auth-user.decorator';
import { PortraitCheckoutService } from 'src/image/portrait-checkout.service';
import { ImageRepository } from 'src/image/image.repository';
import { ImageStyle } from 'src/image/image.schema';
import { getPortraitCheckoutPrice } from 'src/payments/price-table';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { generatePixelAvatar } from 'src/shared/utils/ai-avatar';
import { generateCat } from 'src/shared/utils/ai.utils';
import {
    deleteObject,
    PRIVATE_URL_PREFIX,
    uploadPrivateObject,
    uploadPublicObject,
    YOURCAT_ORIGINALS_PREFIX,
} from 'src/shared/utils/aws.utils';
import { PhotoError, PHOTO_MAX_BYTES, PHOTO_MIME_TYPES, sanitizePhoto } from 'src/shared/utils/photo-upload';
import { ensureStarterCat } from 'src/user/guest/starter';
import { ONBOARDING_VERSION } from 'src/user/user.schema';
import { UserRepository } from 'src/user/user.repository';
import { OrderRepository } from 'src/web3/order.repository';
import { OrderStatus, ProductType } from 'src/web3/order.schema';
import { familyLabel, familyOptions, familySprites, isPlayableFamily, normaliseFamily } from './family';
import { pixelateAvatar } from './pixelate';
import {
    YourcatCheckoutView,
    YourcatDeleteView,
    YourcatPortraitStatus,
    YourcatPortraitStyle,
    YourcatStatusView,
    YourcatView,
} from './yourcat.contracts';
import { YOURCAT_ERRORS, yourcatError } from './yourcat.errors';
import { YourcatRepository } from './yourcat.repository';
import { IYourCat, YourcatSource } from './yourcat.schema';

/*
 * Bet #3 "your cat is the hero" (docs/plans/yourcat-v2.md). One photo becomes the visitor's playable
 * cat: the classifier picks a family (in memory, before anything is stored), the cat takes that family's
 * look, and a pixel avatar is drawn in the background. Nothing here touches scores, Game rows or
 * `lastPlayedAt`: `POST /user/catbassadors/live` copies `user.cat` into game rows on its own.
 */

export const DEFAULT_CAT_NAME = 'My cat';
export const PHOTO_STORY = 'Made from a photo on tokentails.com/yourcat.';
export const MANUAL_STORY = 'Made on tokentails.com/yourcat.';
export const ORIGINAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const CHECKOUT_PHOTO_HOLD_MS = 3 * 24 * 60 * 60 * 1000;
export const NAMING_WINDOW_MS = 24 * 60 * 60 * 1000;
export const AVATAR_STALE_MS = 60 * 1000;
export const AVATAR_CDN_MAX_AGE_S = 300;
export const CLASSIFY_TIMEOUT_MS = 20 * 1000;
export const AVATAR_TIMEOUT_MS = 45 * 1000;
export const PORTRAIT_OPEN_SESSION_MS = 2 * 60 * 60 * 1000;
export const MAX_DELIVERY_ATTEMPTS = 3;
export const PORTRAIT_STYLES: YourcatPortraitStyle[] = ['highness', 'monarch', 'aristocrat', 'commander'];
export const NOTICE_VERSION_MAX = 16;

export const yourcatEnabled = (env: NodeJS.ProcessEnv = process.env) => env.YOURCAT_ENABLED === 'true';
export const yourcatPortraitEnabled = (env: NodeJS.ProcessEnv = process.env) => env.YOURCAT_PORTRAIT_ENABLED === 'true';

export interface IUploadBody {
    consent?: unknown;
    noticeVersion?: unknown;
    name?: unknown;
}

/** What expiring a record's open Checkout Sessions found. */
export interface ISessionSweep {
    paid: boolean;
    unsure: boolean;
}

/** The AI and storage calls, replaceable in specs. */
export interface IYourcatIo {
    generateCat: typeof generateCat;
    generatePixelAvatar: typeof generatePixelAvatar;
    pixelateAvatar: typeof pixelateAvatar;
    uploadPrivateObject: typeof uploadPrivateObject;
    uploadPublicObject: typeof uploadPublicObject;
    deleteObject: typeof deleteObject;
}

const randomAbility = (): CatAbilityType => {
    const values = Object.values(CatAbilityType);
    return values[Math.floor(Math.random() * values.length)];
};

const objectId = (value: unknown) => new Types.ObjectId(String(value));

/** Stripe could not confirm the old session is closed: retry later (no contract code; generic copy). */
const checkoutBusy = () =>
    new ServiceUnavailableException({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Checkout could not be opened right now. Try again in a minute.',
    });

@Injectable()
export class YourcatService {
    private readonly logger = new Logger(YourcatService.name);
    /** Clock, replaceable in specs. */
    now: () => Date = () => new Date();
    io: IYourcatIo = {
        generateCat,
        generatePixelAvatar,
        pixelateAvatar,
        uploadPrivateObject,
        uploadPublicObject,
        deleteObject,
    };
    /** The last background avatar job (specs await it). */
    lastAvatarJob: Promise<void> | null = null;
    /** AbortController timeouts, shortened in specs. */
    timeouts = { classifyMs: CLASSIFY_TIMEOUT_MS, avatarMs: AVATAR_TIMEOUT_MS };

    constructor(
        private readonly repository: YourcatRepository,
        private readonly catRepository: CatRepository,
        private readonly userRepository: UserRepository,
        private readonly catService: CatService,
        private readonly catNameService: CatNameService,
        private readonly gate: AiUploadGate,
        private readonly budget: AiBudgetService,
        private readonly imageRepository: ImageRepository,
        private readonly orderRepository: OrderRepository,
        private readonly checkoutService: PortraitCheckoutService
    ) {}

    // ----- status -----

    async status(): Promise<YourcatStatusView> {
        const enabled = yourcatEnabled();
        let uploadsOpen = false;
        if (enabled) {
            try {
                uploadsOpen = await this.budget.hasRoomFor('yourcat');
            } catch (error) {
                this.logger.warn(`budget read failed: ${(error as Error)?.message}`);
            }
        }
        return {
            enabled,
            uploadsOpen,
            appCheckEnforced: process.env.AI_UPLOAD_APPCHECK_ENFORCE === 'true',
            limits: { maxBytes: PHOTO_MAX_BYTES, types: [...PHOTO_MIME_TYPES] },
            families: familyOptions(),
            portrait: {
                enabled: yourcatPortraitEnabled(),
                priceCents: getPortraitCheckoutPrice(ProductType.DIGITAL).cents,
                currency: 'EUR',
                styles: [...PORTRAIT_STYLES],
            },
        };
    }

    // ----- names -----

    /** The stored name and whether the visitor gave one; a bad name is 400 NAME_INVALID. */
    async nameOf(raw: unknown): Promise<{ name: string; named: boolean }> {
        if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
            return { name: DEFAULT_CAT_NAME, named: false };
        }
        try {
            return { name: await this.catNameService.validName(raw), named: true };
        } catch (error) {
            if (error instanceof HttpException && error.getStatus() === HttpStatus.BAD_REQUEST) {
                throw YOURCAT_ERRORS.nameInvalid(this.messageOf(error, 'Choose another name.'));
            }
            throw error;
        }
    }

    // ----- POST /yourcat -----

    /**
     * The photo pipeline (section 2.3, steps 3 to 10). The controller has checked the kill switch and
     * multer has applied the size, count and type limits.
     */
    async uploadPhoto(user: IAuthUser, req: any, file: { buffer?: Buffer } | undefined, body: IUploadBody) {
        if (body?.consent !== 'true') {
            throw YOURCAT_ERRORS.consentRequired();
        }
        const noticeVersion = typeof body?.noticeVersion === 'string' ? body.noticeVersion.trim() : '';
        if (!noticeVersion || noticeVersion.length > NOTICE_VERSION_MAX) {
            throw YOURCAT_ERRORS.consentRequired();
        }
        if (!file?.buffer?.length) {
            throw YOURCAT_ERRORS.fileRequired();
        }
        const { name, named } = await this.nameOf(body?.name);

        const ticket = await this.gate.admit(req, user, 'yourcat');

        let photo;
        try {
            photo = await sanitizePhoto(file.buffer);
        } catch (error) {
            await this.gate.refuseBeforeAi(ticket);
            await this.budget.count('yourcatFailed', ticket.day);
            throw this.photoError(error);
        }

        // Classify in memory, before anything is stored.
        const usages: AiUsage[] = [];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeouts.classifyMs);
        let result: Awaited<ReturnType<typeof generateCat>> = null;
        try {
            result = await this.io.generateCat(name, `data:image/webp;base64,${photo.data.toString('base64')}`, {
                screen: true,
                onUsage: usage => usages.push(usage),
                signal: controller.signal,
            });
        } catch (error) {
            this.logger.warn(`classifier failed: ${(error as Error)?.message}`);
            result = null;
        } finally {
            clearTimeout(timer);
        }
        const classifierCost = measuredOrFallback(usages, { kind: 'text' });

        const screen = result && 'screen' in result ? result.screen : undefined;
        if (screen?.personVisible) {
            await this.gate.refuseAfterAi(ticket, classifierCost);
            await this.budget.count('yourcatRefusedPerson', ticket.day);
            throw YOURCAT_ERRORS.personVisible();
        }
        if (screen && !screen.isCat) {
            await this.gate.refuseAfterAi(ticket, classifierCost);
            await this.budget.count('yourcatRefusedNoCat', ticket.day);
            throw YOURCAT_ERRORS.noCat();
        }
        const family = result && 'origin' in result ? normaliseFamily(result.origin) : null;
        if (!screen || !family || !result || !('type' in result)) {
            await this.gate.refuseAfterAi(ticket, classifierCost);
            await this.budget.count('yourcatFailed', ticket.day);
            throw YOURCAT_ERRORS.classifyFailed();
        }

        let record: IYourCat & { _id: Types.ObjectId };
        const originalKey = `${YOURCAT_ORIGINALS_PREFIX}${uuid()}.webp`;
        let uploaded = false;
        let placeholderId: Types.ObjectId | null = null;
        try {
            // Store the sanitized original privately.
            await this.io.uploadPrivateObject(originalKey, photo.data, 'image/webp');
            uploaded = true;

            // The record first, as a placeholder (KI-01): if it cannot be stored, the cat, `user.cat` and
            // onboarding are still untouched. Then the cat, then the record points at it.
            const now = this.now();
            const placeholder: any = await this.repository.create({
                owner: objectId(user._id),
                source: 'photo',
                name,
                named,
                family,
                cat: null,
                creatingAt: now,
                consentAt: now,
                privacyNoticeVersion: noticeVersion,
                originalKey,
                originalSha256: photo.sha256,
                originalDeleteAfter: new Date(now.getTime() + ORIGINAL_RETENTION_MS),
                deleteOriginalAfterDelivery: false,
                avatarKey: null,
                avatarUrl: null,
                avatarStatus: 'pending',
                costMicroEur: classifierCost,
                portraitImage: null,
                portraitAttempts: 0,
                deliveryEmailAt: null,
                deliveryEmailAttempts: 0,
                deletedAt: null,
            } as any);
            placeholderId = placeholder._id;
            const cat = await this.makePlayable(user, { name, family, type: result.type, source: 'photo' });
            record = await this.finishMadeCat(placeholder._id, cat._id, user, 'photo');
        } catch (error) {
            await this.dropPlaceholder(placeholderId);
            // No record points at the original, so the retention job would never find it: delete it now.
            if (uploaded) {
                await this.io
                    .deleteObject(originalKey)
                    .catch(cleanup => this.logger.error(`orphan original not deleted: ${(cleanup as Error)?.message}`));
            }
            // Not the visitor's fault: the attempt back, the classifier cost settled.
            await this.gate.release(ticket);
            await this.gate.settle(ticket, classifierCost);
            await this.budget.count('yourcatFailed', ticket.day);
            this.logger.error(`yourcat upload could not be stored: ${(error as Error)?.message}`);
            throw error;
        }

        await this.budget.count('yourcatDone', ticket.day);
        this.lastAvatarJob = this.drawAvatar(record._id, photo.data, ticket, classifierCost).catch(error =>
            this.logger.error(`avatar job for ${record._id} failed: ${(error as Error)?.message}`)
        );
        return this.view(record);
    }

    /** Step 10, in the background: the pixel avatar, then the budget settles with the measured cost. */
    async drawAvatar(recordId: Types.ObjectId, photo: Buffer, ticket: AiTicket, classifierCost: number) {
        const usages: AiUsage[] = [];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeouts.avatarMs);
        let ready = false;
        let called = false;
        try {
            called = true;
            const drawing = await this.io.generatePixelAvatar(photo, 'image/webp', {
                onUsage: usage => usages.push(usage),
                signal: controller.signal,
            });
            if (drawing) {
                const png = await this.io.pixelateAvatar(drawing);
                const avatarKey = `yourcat/avatars/${uuid()}.png`;
                await this.io.uploadPublicObject({
                    key: avatarKey,
                    body: png,
                    contentType: 'image/png',
                    // Short, so a deleted avatar leaves the CDN edge within minutes (KI-18).
                    cacheControl: `public, max-age=${AVATAR_CDN_MAX_AGE_S}`,
                });
                const updated = await this.repository.model.updateOne(
                    { _id: recordId, deletedAt: null },
                    {
                        $set: {
                            avatarKey,
                            avatarUrl: `${process.env.DO_SPACES_CDN}/${avatarKey}`,
                            avatarStatus: 'ready',
                        },
                    }
                );
                if (updated?.matchedCount === 0) {
                    // Deleted while the avatar was drawn: nothing personal stays behind.
                    await this.io.deleteObject(avatarKey).catch(() => undefined);
                } else {
                    ready = true;
                }
            }
        } catch (error) {
            this.logger.warn(`avatar for ${recordId} failed: ${(error as Error)?.message}`);
        } finally {
            clearTimeout(timer);
        }

        // A timeout or provider error still bills: the flat image fallback when no usage came back.
        const avatarCost = called ? measuredOrFallback(usages, { kind: 'image', imageSize: '1K' }) : 0;
        const total = classifierCost + avatarCost;
        if (!ready) {
            await this.repository.model.updateOne(
                { _id: recordId, avatarStatus: 'pending' },
                { $set: { avatarStatus: 'failed' } }
            );
        }
        await this.repository.model.updateOne({ _id: recordId }, { $set: { costMicroEur: total } });
        await this.budget.count(ready ? 'avatarsReady' : 'avatarsFailed', ticket.day);
        await this.gate.settle(ticket, total);
        await this.budget.noteCost('yourcat', ticket.day, total);
        await this.budget.checkBudgetAlerts(ticket.day);
    }

    // ----- POST /yourcat/manual -----

    async createManual(user: IAuthUser, body: { family?: unknown; name?: unknown }) {
        if (!isPlayableFamily(body?.family)) {
            throw YOURCAT_ERRORS.familyInvalid();
        }
        const family = body.family as string;
        const { name, named } = await this.nameOf(body?.name);
        await this.gate.admitManual(user);
        // The placeholder first (KI-02), as for a photo: a failed insert leaves the cat untouched.
        const placeholder: any = await this.repository.create({
            owner: objectId(user._id),
            source: 'manual',
            name,
            named,
            family,
            cat: null,
            creatingAt: this.now(),
            consentAt: null,
            privacyNoticeVersion: null,
            originalKey: null,
            originalSha256: null,
            originalDeleteAfter: null,
            deleteOriginalAfterDelivery: false,
            avatarKey: null,
            avatarUrl: null,
            avatarStatus: 'none',
            costMicroEur: 0,
            portraitImage: null,
            portraitAttempts: 0,
            deliveryEmailAt: null,
            deliveryEmailAttempts: 0,
            deletedAt: null,
        } as any);
        let record: any;
        try {
            const cat = await this.makePlayable(user, { name, family, type: randomAbility(), source: 'manual' });
            record = await this.finishMadeCat(placeholder._id, cat._id, user, 'manual');
        } catch (error) {
            await this.dropPlaceholder(placeholder._id);
            this.logger.error(`manual yourcat could not be made: ${(error as Error)?.message}`);
            throw error;
        }
        await this.budget.count('manualCats');
        return this.view(record);
    }

    /**
     * Finishes the placeholder once its cat exists (KI-01 remainder). By then `user.cat` already points at
     * the cat, so one failed write is retried. If the retry fails too, the cat has no record behind it:
     * that is logged and alerted (ids only) before the error goes on to the caller, which deletes the
     * placeholder and answers an error. The player keeps the cat; `/yourcat/me` shows nothing for it.
     */
    private async finishMadeCat(
        id: Types.ObjectId,
        catId: Types.ObjectId,
        user: IAuthUser,
        source: YourcatSource
    ): Promise<any> {
        try {
            return await this.finishPlaceholder(id, catId);
        } catch (error) {
            this.logger.warn(`yourcat placeholder ${id} not finished, retrying once: ${(error as Error)?.message}`);
        }
        try {
            return await this.finishPlaceholder(id, catId);
        } catch (error) {
            this.logger.error(
                `yourcat cat ${catId} made without a record (placeholder ${id}, user ${user._id}, ${source}): ${
                    (error as Error)?.message
                }`
            );
            try {
                await this.budget.alert(
                    `/yourcat cat made without a record (cat ${catId})`,
                    `A ${source} /yourcat request restyled cat ${catId} and pointed user ${user._id} at it, but ` +
                        `placeholder ${id} could not be finished after one retry. The placeholder is deleted and ` +
                        'the request answered an error, so the cat has no YourCat record (GET /yourcat/me shows ' +
                        'nothing, the avatar is not drawn). Check the cat and user.cat; a new upload makes a fresh record.'
                );
            } catch (alertError) {
                this.logger.error(`missing-record alert not sent: ${(alertError as Error)?.message}`);
            }
            throw error;
        }
    }

    /**
     * Points the placeholder at its cat and ends the placeholder state, in one write. Idempotent: a record
     * that already points at this cat (an earlier write that landed but whose reply was lost) is returned.
     */
    private async finishPlaceholder(id: Types.ObjectId, catId: Types.ObjectId): Promise<any> {
        const record: any = await this.repository.model
            .findOneAndUpdate(
                { _id: id, creatingAt: { $ne: null } },
                { $set: { cat: catId }, $unset: { creatingAt: 1 } },
                { new: true }
            )
            .lean();
        if (record) {
            return record;
        }
        const finished: any = await this.repository.model.findOne({ _id: id, cat: catId }).lean();
        if (finished && !finished.creatingAt) {
            return finished;
        }
        throw new Error(`yourcat placeholder ${id} is gone`);
    }

    /** Hard-deletes a placeholder whose cat could not be made (no-op for null). */
    private async dropPlaceholder(id: Types.ObjectId | null): Promise<void> {
        if (!id) {
            return;
        }
        await this.repository.model
            .deleteOne({ _id: id, creatingAt: { $ne: null } })
            .catch(error => this.logger.error(`placeholder ${id} not deleted: ${(error as Error)?.message}`));
    }

    // ----- section 4: the playable cat -----

    /**
     * Gives the caller a cat with the family look and makes it `user.cat` (section 4). A guest's own
     * starter is restyled in place; a registered account gets one photo cat, reused on later uploads.
     */
    async makePlayable(
        user: IAuthUser,
        input: { name: string; family: string; type: CatAbilityType | string; source: YourcatSource }
    ): Promise<any> {
        const owner = objectId(user._id);
        const now = this.now();
        const look = {
            name: input.name,
            type: input.type,
            ...familySprites(input.family),
            resqueStory: input.source === 'photo' ? PHOTO_STORY : MANUAL_STORY,
        };
        const cats = this.catRepository.model as any;
        const users = this.userRepository.model as any;

        if (user.isGuest) {
            await ensureStarterCat(cats, users, owner, { guest: true });
            // One pipeline write: the lobby draws a starter that has a breed with the Meet-your-cat art, not
            // its catImg, so the breed goes and the uploaded look shows; the starter is committed (an
            // earlier lock time is kept), so Meet your cat never changes it again. `origin: 'starter'` and
            // `isGuestStarter` stay. `$literal`: a pipeline reads a string starting with `$` as a field.
            const literalLook = Object.fromEntries(
                Object.entries(look).map(([key, value]) => [key, { $literal: value }])
            );
            const cat = await cats
                .findOneAndUpdate(
                    { owner, isStarter: true },
                    [
                        {
                            $set: {
                                ...literalLook,
                                starterBreed: '$$REMOVE',
                                starterLockedAt: { $ifNull: ['$starterLockedAt', now] },
                            },
                        },
                    ],
                    { new: true }
                )
                .lean();
            if (!cat?._id) {
                throw new Error('guest starter could not be restyled');
            }
            await users.updateOne({ _id: owner }, [{ $set: { cat: cat._id, ...this.doneOnboarding(now) } }]);
            return cat;
        }

        const latest: any = await this.repository.model
            .findOne({ owner, cat: { $ne: null } }, { cat: 1 })
            .sort({ createdAt: -1 })
            .lean();
        let cat: any = latest?.cat
            ? await cats.findOneAndUpdate({ _id: latest.cat, owner }, { $set: look }, { new: true }).lean()
            : null;
        if (!cat) {
            const created: any = await this.catRepository.create({
                owner,
                ...look,
                tier: Tier.COMMON,
                status: { EAT: 0 },
                isBlueprint: false,
                createdAt: now,
                tokenId: generateRandomNumber(),
            } as any);
            cat = await this.catService.addCatToTheOwner(created, { _id: owner } as any);
            cat = cat || created;
        }
        await this.userRepository.update(owner, { cat: cat._id });
        // A registered account still in Meet your cat would see the ceremony on /game instead of this cat.
        await users.updateOne({ _id: owner, 'onboarding.state': 'pending' }, [{ $set: this.doneOnboarding(now) }]);
        return cat;
    }

    /** `onboarding: done` as an update-pipeline `$set` (dotted paths; an earlier choice time is kept). */
    private doneOnboarding(now: Date) {
        return {
            'onboarding.state': 'done',
            'onboarding.version': ONBOARDING_VERSION,
            'onboarding.skipped': false,
            'onboarding.starterChosenAt': { $ifNull: ['$onboarding.starterChosenAt', now] },
        };
    }

    // ----- reads -----

    async latest(user: IAuthUser): Promise<{ item: YourcatView | null }> {
        if (!user?._id || user.transient) {
            return { item: null };
        }
        const record: any = await this.repository.model
            .findOne({ owner: objectId(user._id), deletedAt: null, creatingAt: null })
            .sort({ createdAt: -1 })
            .lean();
        return { item: record ? await this.view(record) : null };
    }

    async get(user: IAuthUser, id: string): Promise<YourcatView> {
        return this.view(await this.ownRecord(user, id));
    }

    /** The caller's own, non-deleted record, else 404 (also for another user's id or a malformed id). */
    async ownRecord(user: IAuthUser, id: string): Promise<any> {
        if (!user?._id || !Types.ObjectId.isValid(id) || String(new Types.ObjectId(id)) !== String(id)) {
            throw YOURCAT_ERRORS.notFound();
        }
        const record: any = await this.repository.model
            .findOne({ _id: new Types.ObjectId(id), owner: objectId(user._id), deletedAt: null, creatingAt: null })
            .lean();
        if (!record) {
            throw YOURCAT_ERRORS.notFound();
        }
        return record;
    }

    // ----- PATCH /yourcat/:id -----

    /** The card naming step: renames the record and its cat inside the 24 h naming window only. */
    async rename(user: IAuthUser, id: string, raw: unknown): Promise<YourcatView> {
        const record = await this.ownRecord(user, id);
        if (this.now().getTime() - new Date(record.createdAt).getTime() > NAMING_WINDOW_MS) {
            throw YOURCAT_ERRORS.nameInvalid('Rename your cat in the game.');
        }
        if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
            throw YOURCAT_ERRORS.nameInvalid('Give your cat a name.');
        }
        const { name } = await this.nameOf(raw);
        const owner = objectId(user._id);
        // No `nameChangedAt`: naming the card is not the game's rename (its cooldown stays untouched).
        await this.catRepository.model.updateOne({ _id: record.cat, owner }, { $set: { name } });
        const updated: any = await this.repository.model
            .findOneAndUpdate({ _id: record._id, owner }, { $set: { name, named: true } }, { new: true })
            .lean();
        return this.view(updated || { ...record, name, named: true });
    }

    // ----- DELETE /yourcat/:id -----

    async remove(user: IAuthUser, id: string): Promise<YourcatDeleteView> {
        const found = await this.ownRecord(user, id);
        // `deletedAt` first, atomically: a portrait checkout running in parallel re-reads the record after
        // it creates its session and expires that session when the record is gone (section 2.8).
        const marked = await this.repository.model.updateOne(
            { _id: found._id, deletedAt: null },
            { $set: { deletedAt: this.now() } }
        );
        if (marked?.matchedCount === 0) {
            throw YOURCAT_ERRORS.notFound();
        }
        const record: any = (await this.repository.model.findOne({ _id: found._id }).lean()) || {
            ...found,
            deletedAt: this.now(),
        };

        let sessions: ISessionSweep = { paid: false, unsure: false };
        if (record.portraitImage) {
            sessions = await this.expireOpenSessions(record.portraitImage);
        }
        const attemptsLeft = (record.portraitAttempts || 0) < MAX_DELIVERY_ATTEMPTS;
        const undelivered = (sessions.paid && attemptsLeft) || (await this.hasUndeliveredPaidPortrait(record));

        if (record.avatarKey) {
            await this.io
                .deleteObject(record.avatarKey)
                .catch(error => this.logger.warn(`avatar of ${record._id} not deleted: ${(error as Error)?.message}`));
        }
        const set: Record<string, unknown> = { avatarKey: null, avatarUrl: null };
        let kept = false;
        if (record.originalKey && undelivered) {
            set.deleteOriginalAfterDelivery = true;
            kept = true;
        } else if (record.originalKey && sessions.unsure) {
            // An open session could not be expired or read: it may still be paid within its 2 h. The photo
            // stays for the checkout hold only; a payment in that time is delivered, then the photo goes.
            set.deleteOriginalAfterDelivery = true;
            set.originalDeleteAfter = new Date(this.now().getTime() + CHECKOUT_PHOTO_HOLD_MS);
            kept = true;
        } else if (record.originalKey) {
            await this.io.deleteObject(record.originalKey);
            set.originalKey = null;
            set.originalSha256 = null;
            set.originalDeleteAfter = null;
        }
        await this.repository.model.updateOne({ _id: record._id }, { $set: set });
        return { success: true, photoKeptUntilDelivery: kept };
    }

    /**
     * Expires every open Checkout Session of the image. `paid`: one turned out to be complete (a paid
     * order: the photo must stay until delivery). `unsure`: a session that may still be open could be
     * neither expired nor read (a Stripe outage), so it may still be paid.
     */
    async expireOpenSessions(imageId: Types.ObjectId): Promise<ISessionSweep> {
        const pending: any[] = await this.orderRepository.model
            .find(
                { image: imageId, entityType: EntityType.IMAGE, status: OrderStatus.PENDING },
                { hash: 1, createdAt: 1 }
            )
            .lean();
        const result: ISessionSweep = { paid: false, unsure: false };
        for (const order of pending) {
            if (!order.hash) {
                continue;
            }
            try {
                await this.checkoutService.stripe.checkout.sessions.expire(order.hash);
            } catch {
                const session: any = await this.checkoutService.stripe.checkout.sessions
                    .retrieve(order.hash)
                    .catch(error => {
                        this.logger.warn(`session of order ${order._id} not readable: ${(error as Error)?.message}`);
                        return null;
                    });
                if (session?.status === 'complete') {
                    result.paid = true;
                } else if (session?.status !== 'expired' && this.mayStillBeOpen(order)) {
                    result.unsure = true;
                }
            }
        }
        return result;
    }

    /** A session lives 2 h (`PORTRAIT_SESSION_TTL_MS`); an order older than that cannot be paid any more. */
    private mayStillBeOpen(order: { createdAt?: Date | string | null }): boolean {
        if (!order.createdAt) {
            return true;
        }
        return this.now().getTime() - new Date(order.createdAt).getTime() <= PORTRAIT_OPEN_SESSION_MS;
    }

    /**
     * A COMPLETE order on the record's portrait image whose portrait is not painted yet and still has a
     * delivery attempt left. After the third failed attempt nothing retries it (the alert asks for a
     * manual delivery or a refund), so the photo no longer waits for it: DELETE removes it at once and
     * retention removes it at `originalDeleteAfter` (section 2.8).
     */
    async hasUndeliveredPaidPortrait(record: {
        portraitImage?: Types.ObjectId | null;
        portraitAttempts?: number | null;
    }): Promise<boolean> {
        if (!record.portraitImage || (record.portraitAttempts || 0) >= MAX_DELIVERY_ATTEMPTS) {
            return false;
        }
        const paid = await this.orderRepository.model.exists({
            image: record.portraitImage,
            entityType: EntityType.IMAGE,
            status: OrderStatus.COMPLETE,
        });
        if (!paid) {
            return false;
        }
        const image: any = await this.imageRepository.model.findOne({ _id: record.portraitImage }, { aiUrl: 1 }).lean();
        return !image?.aiUrl;
    }

    /** Deletes the private original of a record and clears its key and hash. */
    async deleteOriginal(record: { _id: Types.ObjectId; originalKey?: string | null }): Promise<void> {
        if (record.originalKey) {
            await this.io.deleteObject(record.originalKey);
        }
        await this.repository.model.updateOne(
            { _id: record._id },
            { $set: { originalKey: null, originalSha256: null, originalDeleteAfter: null } }
        );
    }

    // ----- POST /yourcat/:id/portrait-checkout -----

    async portraitCheckout(user: IAuthUser, id: string, rawStyle: unknown): Promise<YourcatCheckoutView> {
        if (!yourcatPortraitEnabled()) {
            throw YOURCAT_ERRORS.portraitDisabled();
        }
        if (!PORTRAIT_STYLES.includes(rawStyle as YourcatPortraitStyle)) {
            throw yourcatError(HttpStatus.BAD_REQUEST, 'YOURCAT_STYLE_INVALID', 'Pick one of the portrait styles.');
        }
        const style = rawStyle as YourcatPortraitStyle;
        const record = await this.ownRecord(user, id);
        if (record.source !== 'photo' || !record.originalKey) {
            throw YOURCAT_ERRORS.photoExpired();
        }

        let imageId: Types.ObjectId | null = record.portraitImage || null;
        if (imageId) {
            const paid = await this.orderRepository.model.exists({
                image: imageId,
                entityType: EntityType.IMAGE,
                status: OrderStatus.COMPLETE,
            });
            if (paid) {
                throw YOURCAT_ERRORS.portraitExists();
            }
            const open = await this.openSession(imageId, style);
            if (open) {
                await this.assertStillPayable(record._id, null);
                return open;
            }
            await this.imageRepository.model.updateOne({ _id: imageId }, { $set: { style: style as ImageStyle } });
        } else {
            imageId = await this.portraitImageOf(record, user, style);
        }

        const owner = String(user._id);
        const account: any = await this.userRepository.model
            .findOne({ _id: objectId(owner) }, { email: 1, emailVerifiedAt: 1 })
            .lean();
        const domain = process.env.MAIN_FE_DOMAIN || 'http://localhost:3000';
        const result = await this.checkoutService.create({
            productType: ProductType.DIGITAL,
            image: imageId,
            userId: owner,
            email: account?.emailVerifiedAt && account?.email ? account.email : null,
            successUrl: `${domain}/yourcat?yc=${record._id}&paid=1`,
            cancelUrl: `${domain}/yourcat?yc=${record._id}&checkout=cancelled`,
            metadata: { source: 'yourcat', yourcatId: String(record._id), style },
        });
        // DELETE may have run while the session was made: then the session goes and the photo is gone.
        await this.assertStillPayable(record._id, result.sessionId);
        // A session can never be paid after its photo is gone: keep the photo past the session's life.
        await this.repository.model.updateOne(
            { _id: record._id },
            { $max: { originalDeleteAfter: new Date(this.now().getTime() + CHECKOUT_PHOTO_HOLD_MS) } }
        );
        await this.budget.count('portraitCheckouts');
        return { checkoutUrl: result.url, orderId: result.orderId };
    }

    /** The record's one Image (created on the first checkout; a parallel first checkout reuses the winner's). */
    private async portraitImageOf(record: any, user: IAuthUser, style: YourcatPortraitStyle): Promise<Types.ObjectId> {
        const image: any = await this.imageRepository.create({
            url: `${PRIVATE_URL_PREFIX}${record.originalKey}`,
            name: record.name,
            owner: objectId(user._id),
            source: 'yourcat',
            style: style as ImageStyle,
            isTemporary: false,
        } as any);
        const claimed: any = await this.repository.model
            .findOneAndUpdate(
                { _id: record._id, portraitImage: null, deletedAt: null, originalKey: { $ne: null } },
                { $set: { portraitImage: image._id } },
                { new: true }
            )
            .lean();
        if (claimed) {
            return image._id;
        }
        await this.imageRepository.model.deleteOne({ _id: image._id });
        const current: any = await this.repository.model
            .findOne({ _id: record._id }, { portraitImage: 1, deletedAt: 1, originalKey: 1 })
            .lean();
        if (!current || current.deletedAt || !current.originalKey || !current.portraitImage) {
            // Deleted (or its photo removed) while this checkout ran.
            throw YOURCAT_ERRORS.photoExpired();
        }
        await this.imageRepository.model.updateOne(
            { _id: current.portraitImage },
            { $set: { style: style as ImageStyle } }
        );
        return current.portraitImage;
    }

    /**
     * After a checkout made or reused its session: the record must still exist with its photo. If DELETE
     * ran in the meantime, the new session is expired (best effort; DELETE expires the rest) and the
     * checkout answers 410, so no payment can be taken for a photo that is gone.
     */
    private async assertStillPayable(recordId: Types.ObjectId, sessionId: string | null): Promise<void> {
        const current: any = await this.repository.model
            .findOne({ _id: recordId }, { deletedAt: 1, originalKey: 1 })
            .lean();
        if (current && !current.deletedAt && current.originalKey) {
            return;
        }
        if (sessionId) {
            await this.checkoutService.stripe.checkout.sessions
                .expire(sessionId)
                .catch(error =>
                    this.logger.error(`session of deleted record ${recordId} not expired: ${(error as Error)?.message}`)
                );
        }
        throw YOURCAT_ERRORS.photoExpired();
    }

    /**
     * At most one payable session per record: an open session with the same style is returned as is; one
     * with another style is expired first (if Stripe says it is already complete: 409). When a session
     * that may still be open can be neither read nor expired, the checkout stops with a retryable 503:
     * a second payable session (and a portrait in a style the buyer did not pay for) is worse than a retry.
     */
    private async openSession(imageId: Types.ObjectId, style: string): Promise<YourcatCheckoutView | null> {
        const pending: any[] = await this.orderRepository.model
            .find(
                { image: imageId, entityType: EntityType.IMAGE, status: OrderStatus.PENDING },
                { hash: 1, createdAt: 1 }
            )
            .sort({ createdAt: -1 })
            .lean();
        let reuse: YourcatCheckoutView | null = null;
        for (const order of pending) {
            if (!order.hash) {
                continue;
            }
            let session: any;
            try {
                session = await this.checkoutService.stripe.checkout.sessions.retrieve(order.hash);
            } catch (error) {
                this.logger.warn(`session of order ${order._id} not readable: ${(error as Error)?.message}`);
                if (this.mayStillBeOpen(order)) {
                    throw checkoutBusy();
                }
                continue;
            }
            if (session.status === 'complete') {
                throw YOURCAT_ERRORS.portraitExists();
            }
            if (session.status !== 'open') {
                continue;
            }
            if (!reuse && session.metadata?.style === style && session.url) {
                reuse = { checkoutUrl: session.url, orderId: String(order._id) };
                continue;
            }
            try {
                await this.checkoutService.stripe.checkout.sessions.expire(order.hash);
            } catch {
                const again: any = await this.checkoutService.stripe.checkout.sessions
                    .retrieve(order.hash)
                    .catch(() => null);
                if (again?.status === 'complete') {
                    throw YOURCAT_ERRORS.portraitExists();
                }
                if (again?.status !== 'expired') {
                    throw checkoutBusy();
                }
            }
        }
        return reuse;
    }

    // ----- views -----

    async view(record: any): Promise<YourcatView> {
        const now = this.now();
        const cat: any =
            (await this.catRepository.model
                .findOne({ _id: record.cat }, { name: 1, type: 1, spriteImg: 1, catImg: 1 })
                .lean()) || {};
        const sprites = familySprites(record.family);
        let avatarStatus = record.avatarStatus;
        if (avatarStatus === 'pending' && now.getTime() - new Date(record.createdAt).getTime() > AVATAR_STALE_MS) {
            // The process died mid-way (the avatar job times out after 45 s).
            avatarStatus = 'failed';
        }
        return {
            id: String(record._id),
            name: record.name,
            named: !!record.named,
            family: record.family,
            familyLabel: familyLabel(record.family),
            cat: {
                _id: String(record.cat),
                name: cat.name ?? record.name,
                type: cat.type ?? '',
                spriteImg: cat.spriteImg ?? sprites.spriteImg,
                catImg: cat.catImg ?? sprites.catImg,
            },
            avatar: { status: avatarStatus, url: avatarStatus === 'ready' ? record.avatarUrl || null : null },
            photo: {
                stored: !!record.originalKey,
                deleteAfter:
                    record.originalKey && record.originalDeleteAfter
                        ? new Date(record.originalDeleteAfter).toISOString()
                        : null,
            },
            portrait: await this.portraitView(record, now),
            createdAt: new Date(record.createdAt || now).toISOString(),
        };
    }

    /** Resolved from every order on the record's portrait image, so a paid older tab is always seen. */
    async portraitView(
        record: any,
        now: Date = this.now()
    ): Promise<{ status: YourcatPortraitStatus; style: YourcatPortraitStyle | null; url: string | null }> {
        if (!record.portraitImage) {
            return { status: 'none', style: null, url: null };
        }
        const [image, orders]: [any, any[]] = await Promise.all([
            this.imageRepository.model.findOne({ _id: record.portraitImage }, { aiUrl: 1, style: 1 }).lean(),
            this.orderRepository.model
                .find({ image: record.portraitImage, entityType: EntityType.IMAGE }, { status: 1, createdAt: 1 })
                .lean(),
        ]);
        const style = (image?.style as YourcatPortraitStyle) || null;
        if (orders.some(order => order.status === OrderStatus.COMPLETE)) {
            if (image?.aiUrl) {
                return { status: 'ready', style, url: image.aiUrl };
            }
            return {
                status: (record.portraitAttempts || 0) >= MAX_DELIVERY_ATTEMPTS ? 'failed' : 'painting',
                style,
                url: null,
            };
        }
        const openSince = now.getTime() - PORTRAIT_OPEN_SESSION_MS;
        if (
            orders.some(
                order =>
                    order.status === OrderStatus.PENDING &&
                    order.createdAt &&
                    new Date(order.createdAt).getTime() > openSince
            )
        ) {
            return { status: 'pending_payment', style, url: null };
        }
        return { status: 'none', style, url: null };
    }

    // ----- helpers -----

    private photoError(error: unknown): HttpException {
        if (error instanceof PhotoError) {
            switch (error.code) {
                case 'FILE_REQUIRED':
                    return YOURCAT_ERRORS.fileRequired();
                case 'FILE_TOO_LARGE':
                    return YOURCAT_ERRORS.fileTooLarge();
                case 'FILE_TYPE':
                    return YOURCAT_ERRORS.fileType();
                default:
                    return YOURCAT_ERRORS.notDecodable();
            }
        }
        return YOURCAT_ERRORS.notDecodable();
    }

    private messageOf(error: HttpException, fallback: string): string {
        const response = error.getResponse();
        const message = typeof response === 'string' ? response : (response as { message?: unknown })?.message;
        return typeof message === 'string' && message ? message : fallback;
    }
}
