import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
    ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Transform } from 'class-transformer';
import { IsIn, IsMongoId, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { randomBytes } from 'crypto';
import { formatUnits, parseUnits } from 'ethers';
import { Model, Types } from 'mongoose';
import { IAuthUser } from 'src/common/decorators/auth-user.decorator';
import { Shelter, ShelterDocument } from 'src/shelter/shelter.schema';
import { DeleteObjectCommand, S3 } from '@aws-sdk/client-s3';
import { uploadFile } from 'src/shared/utils/aws.utils';
import { AttestationTier, sha256Hex } from './attestation';
import { parseRegions, redactOutcomeImage } from './outcome-image';
import {
    ANIMAL_NAME,
    OUTCOME_TYPES,
    publishBlocker,
    ShelterOutcome,
    ShelterOutcomeDocument,
    ShelterOutcomeImage,
    ShelterOutcomeImageDocument,
} from './outcome.schema';
import { ImpactPayout, ImpactPayoutDocument } from './payout.schema';
import { ImpactPayoutService } from './payouts.service';

export const OUTCOME_ERROR = {
    SAME_REVIEWER: 'OUTCOME_SAME_REVIEWER',
    NOT_REDACTED: 'OUTCOME_NOT_REDACTED',
    PUBLISHED: 'OUTCOME_PUBLISHED',
} as const;

const blankToUndefined = ({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value;

/** Body of POST /impact/outcomes/manage and PUT /impact/outcomes/manage/:id. */
export class OutcomeWriteDto {
    @IsOptional() @IsMongoId() shelter?: string;
    @IsOptional() @IsIn(OUTCOME_TYPES as unknown as string[]) type?: string;
    @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
    @IsOptional() @Transform(blankToUndefined) @Matches(/^\d{1,12}(\.\d{1,18})?$/) amount?: string;
    @IsOptional()
    @Transform(({ value }) => (typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : undefined))
    @Matches(/^[A-Z]{3,5}$/)
    symbol?: string;
    @IsOptional() @Transform(blankToUndefined) @IsString() @MaxLength(40) @Matches(ANIMAL_NAME) animalName?: string;
    /** Public payout id (`p-...`), or '' to unlink. */
    @IsOptional() @IsString() @Matches(/^(p-[0-9a-f]{12})?$/) payout?: string;
}

export class OutcomeRedactionDto {
    @IsIn([true, false]) redacted: boolean;
}

/** What GET /impact/outcomes serves per outcome (the client's PublicOutcome shape). */
export interface PublicOutcomeItem {
    id: string;
    type: string;
    date: string;
    shelter: string;
    animalName: string | null;
    amountWei: string | null;
    symbol: string | null;
    tier: AttestationTier | null;
    payoutId: string | null;
    payoutTxHash: string | null;
    imageUrl: string | null;
}

export interface OutcomeView extends PublicOutcomeItem {
    status: 'draft' | 'awaiting-redaction' | 'awaiting-approval' | 'published';
    shelterId: string;
    amount: string | null;
    hasImage: boolean;
    imageRegions: number;
    redacted: boolean;
    redactedByMe: boolean;
    createdByMe: boolean;
    approvedByMe: boolean;
    /** The caller may approve and publish: a second reviewer and nothing else is missing. */
    canApprove: boolean;
    blocker: string | null;
    publishedAt: string | null;
}

export type OutcomeImageUploader = (key: string, data: Buffer) => Promise<string>;

/** Uploads the published image to the Spaces bucket the image uploads use. Off under Jest. */
export const defaultOutcomeUploader: OutcomeImageUploader = async (key, data) => {
    const cdn = (process.env.DO_SPACES_CDN || '').trim();
    if (process.env.JEST_WORKER_ID || !cdn || !process.env.DO_SPACES_NAME) {
        throw new ServiceUnavailableException('Image storage is not configured on this instance');
    }
    await uploadFile(key, data, 'webp');
    return `${cdn.replace(/\/+$/, '')}/${key}`;
};

export type OutcomeImageDeleter = (key: string) => Promise<void>;

let spacesClient: S3 | null = null;

/**
 * Deletes a published outcome image from the Spaces bucket (same credentials as `aws.utils.ts`, which
 * has no delete). Throws when storage is not configured, so the caller records a manual purge.
 */
export const defaultOutcomeDeleter: OutcomeImageDeleter = async key => {
    if (process.env.JEST_WORKER_ID || !process.env.DO_SPACES_NAME || !process.env.DO_SPACES_ENDPOINT) {
        throw new ServiceUnavailableException('Image storage is not configured on this instance');
    }
    spacesClient =
        spacesClient ||
        new S3({
            endpoint: process.env.DO_SPACES_ENDPOINT,
            region: 'fra1',
            credentials: {
                accessKeyId: process.env.DO_SPACES_KEY!,
                secretAccessKey: process.env.DO_SPACES_SECRET!,
            },
        });
    await spacesClient.send(new DeleteObjectCommand({ Bucket: process.env.DO_SPACES_NAME, Key: key }));
};

/** The bucket key of a published outcome image: stored as `image.key`, or read off an older url. */
export function outcomeImageKey(image: { key?: string; url?: string } | null | undefined): string | null {
    if (image?.key) {
        return image.key;
    }
    const match = /(outcomes\/[0-9a-f]{24}\.webp)$/.exec(String(image?.url || ''));
    return match ? match[1] : null;
}

const PUBLIC_LIMIT = 100;
const CACHE_MS = 60 * 1000;

/**
 * Shelter outcomes (plan G11 `ShelterOutcome`, decision #78). Managers draft them; a reviewer marks the
 * processed image and text redacted; a second reviewer (neither the author nor the redactor) approves,
 * which uploads the image and publishes. Only published outcomes reach a public response, and an
 * unpublished image never leaves Mongo.
 */
@Injectable()
export class ShelterOutcomeService {
    private readonly logger = new Logger(ShelterOutcomeService.name);
    uploader: OutcomeImageUploader = defaultOutcomeUploader;
    deleter: OutcomeImageDeleter = defaultOutcomeDeleter;
    private publicCache: {
        expiresAt: number;
        value: Promise<{ published: number; items: PublicOutcomeItem[] }>;
    } | null = null;

    constructor(
        @InjectModel(ShelterOutcome.name) private outcomeModel: Model<ShelterOutcomeDocument>,
        @InjectModel(ShelterOutcomeImage.name) private imageModel: Model<ShelterOutcomeImageDocument>,
        @InjectModel(Shelter.name) private shelterModel: Model<ShelterDocument>,
        @InjectModel(ImpactPayout.name) private payoutModel: Model<ImpactPayoutDocument>,
        @Optional() private payouts?: ImpactPayoutService
    ) {}

    private async byPublicId(id: string): Promise<any> {
        const outcome = await this.outcomeModel.findOne({ publicId: String(id || '') }).lean();
        if (!outcome) {
            throw new NotFoundException();
        }
        return outcome;
    }

    private async shelterOf(id: unknown): Promise<any> {
        if (!Types.ObjectId.isValid(String(id))) {
            throw new BadRequestException('Unknown shelter');
        }
        const shelter = await this.shelterModel
            .findOne({ _id: new Types.ObjectId(String(id)) }, { slug: 1, name: 1 })
            .lean();
        if (!shelter) {
            throw new BadRequestException('Unknown shelter');
        }
        return shelter;
    }

    private async payoutRef(publicId: string | undefined): Promise<Types.ObjectId | null | undefined> {
        if (publicId === undefined) {
            return undefined;
        }
        if (publicId === '') {
            return null;
        }
        const payout: any = await this.payoutModel.findOne({ publicId }, { _id: 1, status: 1 }).lean();
        if (!payout || payout.status === 'VOID') {
            throw new BadRequestException('Unknown payout');
        }
        return payout._id;
    }

    private writeOf(body: OutcomeWriteDto, existing?: any): Record<string, any> {
        const write: Record<string, any> = {};
        if (body.type !== undefined) write.type = body.type;
        if (body.date !== undefined) {
            const date = new Date(`${body.date}T00:00:00Z`);
            if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
                throw new BadRequestException('date must be a real date, not in the future');
            }
            write.date = date;
        }
        if (body.animalName !== undefined) write.animalName = body.animalName;
        // '' clears a field (the DTO maps it to undefined; direct callers may send it).
        if (body.amount !== undefined) {
            const wei = body.amount === '' ? BigInt(0) : parseUnits(body.amount, 18);
            write.amount = wei > BigInt(0) ? wei.toString() : undefined;
        }
        if (body.symbol !== undefined) write.symbol = body.symbol || undefined;
        const amount = 'amount' in write ? write.amount : existing?.amount;
        const symbol = 'symbol' in write ? write.symbol : existing?.symbol;
        if (!!amount !== !!symbol) {
            throw new BadRequestException('An amount needs its currency symbol, and the other way round');
        }
        return write;
    }

    async create(body: OutcomeWriteDto, author: IAuthUser): Promise<OutcomeView> {
        if (!body.shelter || !body.type || !body.date) {
            throw new BadRequestException('shelter, type and date are required');
        }
        const shelter = await this.shelterOf(body.shelter);
        const payout = await this.payoutRef(body.payout);
        const created = await this.outcomeModel.create({
            ...this.writeOf(body),
            publicId: `o-${randomBytes(6).toString('hex')}`,
            shelter: shelter._id,
            payout: payout || undefined,
            redacted: false,
            published: false,
            createdBy: new Types.ObjectId(String(author._id)),
        });
        return this.view((created as any).toObject ? (created as any).toObject() : created, author);
    }

    /** Any change to a draft clears the redaction mark and the approval: both must be redone. */
    async update(id: string, body: OutcomeWriteDto, user: IAuthUser): Promise<OutcomeView> {
        const outcome = await this.byPublicId(id);
        if (outcome.published) {
            throw new ConflictException({ code: OUTCOME_ERROR.PUBLISHED, message: 'Unpublish it before editing' });
        }
        const write = this.writeOf(body, outcome);
        if (body.shelter) {
            write.shelter = (await this.shelterOf(body.shelter))._id;
        }
        const payout = await this.payoutRef(body.payout);
        const unset: Record<string, 1> = { redactedBy: 1, redactedAt: 1, approvedBy: 1, approvedAt: 1 };
        if (payout === null) unset.payout = 1;
        else if (payout) write.payout = payout;
        for (const key of Object.keys(write)) {
            if (write[key] === undefined) {
                delete write[key];
                unset[key] = 1;
            }
        }
        const updated = await this.outcomeModel
            .findOneAndUpdate(
                { _id: outcome._id, published: false },
                { $set: { ...write, redacted: false }, $unset: unset },
                { new: true }
            )
            .lean();
        if (!updated) {
            throw new ConflictException({ code: OUTCOME_ERROR.PUBLISHED, message: 'Unpublish it before editing' });
        }
        return this.view(updated, user);
    }

    /** Runs the redaction pipeline and keeps the result private. Clears the redaction mark and approval. */
    async setImage(id: string, file: { buffer?: Buffer } | undefined, regionsRaw: unknown, user: IAuthUser) {
        const outcome = await this.byPublicId(id);
        if (outcome.published) {
            throw new ConflictException({ code: OUTCOME_ERROR.PUBLISHED, message: 'Unpublish it before editing' });
        }
        const regions = parseRegions(regionsRaw);
        const processed = await redactOutcomeImage(file?.buffer as Buffer, regions);
        await this.imageModel.updateOne(
            { _id: outcome._id },
            { $set: { data: processed.data, sha256: processed.sha256 } },
            { upsert: true }
        );
        const updated = await this.outcomeModel
            .findOneAndUpdate(
                { _id: outcome._id, published: false },
                {
                    $set: {
                        image: {
                            sha256: processed.sha256,
                            width: processed.width,
                            height: processed.height,
                            regions: processed.regions,
                            processedAt: new Date(),
                        },
                        redacted: false,
                    },
                    $unset: { redactedBy: 1, redactedAt: 1, approvedBy: 1, approvedAt: 1 },
                },
                { new: true }
            )
            .lean();
        if (!updated) {
            // Published (or deleted) between the read and the write. approve() checks the bytes' hash
            // against `image.sha256`, so the new bytes written above can never be published unreviewed.
            throw new ConflictException({ code: OUTCOME_ERROR.PUBLISHED, message: 'Unpublish it before editing' });
        }
        return this.view(updated, user);
    }

    async removeImage(id: string, user: IAuthUser) {
        const outcome = await this.byPublicId(id);
        if (outcome.published) {
            throw new ConflictException({ code: OUTCOME_ERROR.PUBLISHED, message: 'Unpublish it before editing' });
        }
        await this.imageModel.deleteOne({ _id: outcome._id });
        const updated = await this.outcomeModel
            .findOneAndUpdate(
                { _id: outcome._id },
                {
                    $set: { redacted: false },
                    $unset: { image: 1, redactedBy: 1, redactedAt: 1, approvedBy: 1, approvedAt: 1 },
                },
                { new: true }
            )
            .lean();
        return this.view(updated, user);
    }

    /** The processed (redacted) image, for the reviewers' preview. Never the original upload. */
    async imageBytes(id: string): Promise<Buffer> {
        const outcome = await this.byPublicId(id);
        const image: any = await this.imageModel.findOne({ _id: outcome._id }).lean();
        if (!image?.data) {
            throw new NotFoundException();
        }
        const data = image.data;
        return Buffer.isBuffer(data) ? data : Buffer.from(data.buffer || data);
    }

    /** The redaction checkbox. Ticking it again after an edit is a new review. */
    async setRedacted(id: string, redacted: boolean, user: IAuthUser) {
        const outcome = await this.byPublicId(id);
        if (outcome.published) {
            throw new ConflictException({ code: OUTCOME_ERROR.PUBLISHED, message: 'Unpublish it before editing' });
        }
        const update = redacted
            ? {
                  $set: { redacted: true, redactedBy: new Types.ObjectId(String(user._id)), redactedAt: new Date() },
                  $unset: { approvedBy: 1, approvedAt: 1 },
              }
            : { $set: { redacted: false }, $unset: { redactedBy: 1, redactedAt: 1, approvedBy: 1, approvedAt: 1 } };
        const updated = await this.outcomeModel
            .findOneAndUpdate({ _id: outcome._id, published: false }, update, { new: true })
            .lean();
        if (!updated) {
            throw new ConflictException({ code: OUTCOME_ERROR.PUBLISHED, message: 'Unpublish it before editing' });
        }
        return this.view(updated, user);
    }

    /**
     * Second-reviewer approval (decision #78): the approver is neither the author nor the redactor, the
     * outcome is marked redacted, and only then is the image uploaded and the outcome published.
     */
    async approve(id: string, user: IAuthUser): Promise<OutcomeView> {
        const outcome = await this.byPublicId(id);
        if (outcome.published) {
            return this.view(outcome, user);
        }
        if (!outcome.redacted || !outcome.redactedBy) {
            throw new ConflictException({
                code: OUTCOME_ERROR.NOT_REDACTED,
                message: 'Mark it redacted (photo and text checked) before approving',
            });
        }
        const me = String(user._id);
        if (me === String(outcome.createdBy) || me === String(outcome.redactedBy)) {
            throw new ForbiddenException({
                code: OUTCOME_ERROR.SAME_REVIEWER,
                message: 'A second reviewer must approve: not the author and not the redactor',
            });
        }
        const set: Record<string, any> = {
            approvedBy: new Types.ObjectId(me),
            approvedAt: new Date(),
            published: true,
            publishedAt: new Date(),
        };
        const changed = () =>
            new ConflictException({ code: OUTCOME_ERROR.NOT_REDACTED, message: 'It changed while you reviewed it' });
        let data: Buffer | null = null;
        if (outcome.image) {
            data = await this.imageBytes(id);
            // A new image written by a concurrent setImage has a different hash from the one reviewed.
            if (sha256Hex(data) !== outcome.image.sha256) {
                throw changed();
            }
        }
        const key = data ? `outcomes/${randomBytes(12).toString('hex')}.webp` : null;
        const candidate = {
            ...outcome,
            ...set,
            image: outcome.image ? { ...outcome.image, url: 'pending' } : undefined,
        };
        const blocker = publishBlocker(candidate);
        if (blocker) {
            throw new ConflictException({ code: OUTCOME_ERROR.NOT_REDACTED, message: `Cannot publish: ${blocker}` });
        }
        if (data && key) {
            set['image.url'] = await this.uploader(key, data);
            set['image.key'] = key;
        }
        const filter: Record<string, any> = {
            _id: outcome._id,
            published: false,
            redacted: true,
            redactedBy: outcome.redactedBy,
        };
        if (outcome.image) {
            filter['image.sha256'] = outcome.image.sha256;
        } else {
            filter.image = { $exists: false };
        }
        const updated = await this.outcomeModel.findOneAndUpdate(filter, { $set: set }, { new: true }).lean();
        if (!updated) {
            // Nothing published: take the copy we just uploaded back down.
            if (key) {
                await this.purge(outcome._id, key);
            }
            throw changed();
        }
        this.publicCache = null;
        return this.view(updated, user);
    }

    /**
     * Deletes a public image object. When that fails (or storage is not configured) the key is recorded
     * in `unpurgedImageKeys` and logged, for a manual purge from the bucket and the CDN cache.
     */
    private async purge(outcomeId: unknown, key: string): Promise<boolean> {
        try {
            await this.deleter(key);
            return true;
        } catch (error) {
            this.logger.error(
                `outcome image ${key} could not be deleted (${(error as any)?.name || 'Error'}): purge it manually`
            );
            await this.outcomeModel
                .updateOne({ _id: outcomeId }, { $addToSet: { unpurgedImageKeys: key } })
                .catch(() => undefined);
            return false;
        }
    }

    /**
     * Takes an outcome down (usually because something was missed in review): the public image object is
     * deleted, and the outcome goes back to "awaiting redaction", so it needs a fresh redaction mark and a
     * second reviewer before it can be published again. The caller (ImpactAdminController) also strips
     * it from the stored snapshots.
     */
    async unpublish(id: string, user: IAuthUser): Promise<OutcomeView> {
        const outcome = await this.byPublicId(id);
        const key = outcomeImageKey(outcome.image);
        const updated = await this.outcomeModel
            .findOneAndUpdate(
                { _id: outcome._id },
                {
                    $set: { published: false, redacted: false },
                    $unset: {
                        publishedAt: 1,
                        approvedBy: 1,
                        approvedAt: 1,
                        redactedBy: 1,
                        redactedAt: 1,
                        'image.url': 1,
                        'image.key': 1,
                    },
                },
                { new: true }
            )
            .lean();
        this.publicCache = null;
        if (!updated) {
            throw new NotFoundException();
        }
        if (key) {
            await this.purge(outcome._id, key);
        }
        return this.view(updated, user);
    }

    async list(user: IAuthUser, filter: { status?: string } = {}): Promise<OutcomeView[]> {
        const query: Record<string, any> = {};
        if (filter.status === 'published') query.published = true;
        if (filter.status === 'unpublished') query.published = false;
        const rows: any[] = await this.outcomeModel.find(query).sort({ date: -1 }).limit(200).lean();
        const out: OutcomeView[] = [];
        for (const row of rows || []) {
            out.push(await this.view(row, user));
        }
        return out;
    }

    async get(id: string, user: IAuthUser) {
        return this.view(await this.byPublicId(id), user);
    }

    private async publicItem(row: any, slugs: Map<string, string>): Promise<PublicOutcomeItem> {
        const key = String(row.shelter);
        if (!slugs.has(key)) {
            const shelter: any = await this.shelterModel.findOne({ _id: row.shelter }, { slug: 1 }).lean();
            slugs.set(key, shelter?.slug || '');
        }
        const link = (await this.payouts?.linkOf(row.payout)) || null;
        const isPublic = !!row.published && !publishBlocker(row);
        return {
            id: row.publicId,
            type: row.type,
            date: new Date(row.date).toISOString().slice(0, 10),
            shelter: slugs.get(key) || '',
            animalName: row.animalName || null,
            amountWei: row.amount && row.symbol ? row.amount : null,
            symbol: row.amount && row.symbol ? row.symbol : null,
            tier: link?.tier || null,
            payoutId: link?.tier ? link.id : null,
            payoutTxHash: link?.tier ? link.txHash : null,
            imageUrl: isPublic && row.redacted && row.image?.url ? row.image.url : null,
        };
    }

    /** Published outcomes only (and only those whose stored state still passes the publish rules). */
    async publicOutcomes(now: Date = new Date()): Promise<{ published: number; items: PublicOutcomeItem[] }> {
        const cached = this.publicCache;
        if (cached && cached.expiresAt > now.getTime()) {
            return cached.value;
        }
        const value = (async () => {
            // `published` counts with the same rule as the items (publishBlocker), over the fields it reads.
            const rows: any[] = await this.outcomeModel
                .find(
                    { published: true, redacted: true },
                    { redacted: 1, redactedBy: 1, approvedBy: 1, createdBy: 1, image: 1, date: 1 }
                )
                .sort({ date: -1 })
                .lean();
            const validIds = (rows || []).filter(row => !publishBlocker(row)).map(row => row._id);
            const shown: any[] = validIds.length
                ? await this.outcomeModel
                      .find({ _id: { $in: validIds.slice(0, PUBLIC_LIMIT) } })
                      .sort({ date: -1 })
                      .lean()
                : [];
            const slugs = new Map<string, string>();
            const items: PublicOutcomeItem[] = [];
            for (const row of (shown || []).filter(r => !publishBlocker(r))) {
                items.push(await this.publicItem(row, slugs));
            }
            return { published: validIds.length, items };
        })();
        this.publicCache = { expiresAt: now.getTime() + CACHE_MS, value };
        value.catch(() => (this.publicCache = null));
        return value;
    }

    private async view(row: any, user: IAuthUser | null): Promise<OutcomeView> {
        const me = user ? String(user._id) : '';
        const item = await this.publicItem({ ...row, published: false }, new Map());
        const status: OutcomeView['status'] = row.published
            ? 'published'
            : !row.redacted
            ? row.image
                ? 'awaiting-redaction'
                : 'draft'
            : 'awaiting-approval';
        const createdByMe = me === String(row.createdBy);
        const redactedByMe = !!row.redactedBy && me === String(row.redactedBy);
        return {
            ...item,
            imageUrl: row.published ? row.image?.url || null : null,
            status,
            shelterId: String(row.shelter),
            amount: row.amount ? formatUnits(BigInt(row.amount), 18) : null,
            hasImage: !!row.image,
            imageRegions: row.image?.regions?.length || 0,
            redacted: !!row.redacted,
            redactedByMe,
            createdByMe,
            approvedByMe: !!row.approvedBy && me === String(row.approvedBy),
            canApprove: !row.published && !!row.redacted && !createdByMe && !redactedByMe,
            blocker: row.published ? null : !row.redacted ? 'not marked redacted' : 'waiting for a second reviewer',
            publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
        };
    }
}
