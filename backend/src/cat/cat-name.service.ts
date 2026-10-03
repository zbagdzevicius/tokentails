import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpStatus,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { FeaturedBlessingService } from 'src/blessing/featured.service';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import {
    CAT_NAME_MESSAGES,
    CAT_RENAME_COOLDOWN_DAYS,
    CatNameErrorCode,
    normalizeCatName,
} from 'src/shared-contracts/name';
import { STARTER_ART } from 'src/user/guest/starter';
import { CatRepository } from './cat.repository';
import {
    NAME_MODERATION_ACTIONS,
    NAME_REPORT_NOTE_LIMIT,
    NAME_REPORT_REASONS,
    NAME_REPORT_STATUSES,
    NameModerationAction,
    NameReportReason,
    NameReportStatus,
} from './name-report.schema';
import { NameReportRepository } from './name-report.repository';

export const RENAME_COOLDOWN_MS = CAT_RENAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
export const NAME_REPORTS_PAGE_SIZE = 20;
/** Reports read per CMS listing before grouping. Far above any real open queue. */
const NAME_REPORTS_SCAN_LIMIT = 2000;
/** Used when a moderator resets a starter that has no breed (very old rows). */
const FALLBACK_STARTER_NAME = 'Kitty';

export interface IRenameResponse {
    success: true;
    cat: { _id: string; name: string; nameChangedAt?: Date; nextRenameAt?: Date };
}

export interface INameReportGroup {
    cat: {
        _id: string;
        name?: string;
        catImg?: string;
        starterBreed?: string;
        nameChangedAt?: Date;
        nameModeratedAt?: Date;
        missing?: boolean;
    };
    status: NameReportStatus;
    count: number;
    reasons: Partial<Record<NameReportReason, number>>;
    names: string[];
    notes: string[];
    firstAt?: Date;
    lastAt?: Date;
    action?: NameModerationAction;
    resolvedAt?: Date;
}

/** 400 with the shared NAME_* code (F5.6), so the client shows the same message as its own check. */
export function catNameError(code: CatNameErrorCode) {
    return new BadRequestException({ statusCode: HttpStatus.BAD_REQUEST, code, message: CAT_NAME_MESSAGES[code] });
}

/** True when the cat has been minted on any chain: its name is frozen (decision #22). */
export function isMinted(cat: { token?: Record<string, unknown> | null } | null | undefined): boolean {
    const token = cat?.token;
    return !!token && typeof token === 'object' && Object.values(token).some(value => !!value);
}

/**
 * Mongo filter for "not minted on any chain", the write-time twin of `isMinted`, so a mint landing
 * between the read and the conditional write still freezes the name (3c review).
 */
export const NOT_MINTED_FILTER: Readonly<Record<string, unknown>> = {
    'token.stellar': { $in: [null, ''] },
    'token.sei': { $in: [null, ''] },
    'token.evm': { $in: [null, ''] },
};

const toObjectId = (id: string, what = 'cat'): Types.ObjectId => {
    if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException(`Invalid ${what} id`);
    }
    return new Types.ObjectId(id);
};

const cleanNote = (value: unknown): string | undefined => {
    if (typeof value !== 'string') {
        return undefined;
    }
    // eslint-disable-next-line no-control-regex
    const note = value
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return note ? note.slice(0, NAME_REPORT_NOTE_LIMIT) : undefined;
};

/** Groups report rows per cat for the CMS. Never includes reporter ids. Pure, for specs. */
export function groupNameReports(reports: any[], cats: any[]): INameReportGroup[] {
    const catsById = new Map(cats.map(cat => [String(cat._id), cat]));
    const groups = new Map<string, INameReportGroup>();
    for (const report of reports) {
        const key = String(report.cat);
        let group = groups.get(key);
        if (!group) {
            const cat = catsById.get(key);
            group = {
                cat: cat
                    ? {
                          _id: key,
                          name: cat.name,
                          catImg: cat.catImg,
                          starterBreed: cat.starterBreed,
                          nameChangedAt: cat.nameChangedAt,
                          nameModeratedAt: cat.nameModeratedAt,
                      }
                    : { _id: key, missing: true },
                status: report.status,
                count: 0,
                reasons: {},
                names: [],
                notes: [],
            };
            groups.set(key, group);
        }
        group.count += 1;
        group.reasons[report.reason as NameReportReason] = (group.reasons[report.reason as NameReportReason] || 0) + 1;
        if (report.nameSnapshot && !group.names.includes(report.nameSnapshot)) {
            group.names.push(report.nameSnapshot);
        }
        if (report.note && group.notes.length < 3) {
            group.notes.push(report.note);
        }
        const created = report.createdAt ? new Date(report.createdAt) : undefined;
        if (created && (!group.firstAt || created < group.firstAt)) group.firstAt = created;
        if (created && (!group.lastAt || created > group.lastAt)) group.lastAt = created;
        if (report.action) group.action = report.action;
        if (report.resolvedAt && (!group.resolvedAt || new Date(report.resolvedAt) > group.resolvedAt)) {
            group.resolvedAt = new Date(report.resolvedAt);
        }
    }
    return [...groups.values()].sort(
        (a, b) => b.count - a.count || (b.lastAt?.getTime() || 0) - (a.lastAt?.getTime() || 0)
    );
}

/**
 * Cat names after Meet your cat (plan G3): the player's rename, reports and moderation.
 *
 * - Only the owner's starter can be renamed, after it is committed, once per 30 days (decision #22),
 *   and never once it is minted. The legacy rename offer (decision #20) skips the window once.
 * - Every stored name passes `normalizeCatName`, with the featured real-cat names reserved.
 * - Reports go to `name_reports`; a moderator resets, replaces or dismisses, which resolves every
 *   open report of that cat.
 */
@Injectable()
export class CatNameService {
    /** Clock, replaceable in specs. */
    now: () => Date = () => new Date();

    constructor(
        private catRepository: CatRepository,
        private nameReportRepository: NameReportRepository,
        private featuredService: FeaturedBlessingService
    ) {}

    /** The stored form of `raw`, or a 400 with the NAME_* code. */
    async validName(raw: unknown): Promise<string> {
        const result = normalizeCatName(raw, { reserved: await this.featuredService.reservedNames() });
        if (!result.ok) {
            throw catNameError(result.code);
        }
        return result.name;
    }

    async rename(catId: string, userId: string, raw: unknown): Promise<IRenameResponse> {
        const _id = toObjectId(catId);
        const owner = toObjectId(String(userId), 'user');
        const cat: any = await this.catRepository.model
            .findOne(
                { _id, owner },
                { name: 1, isStarter: 1, starterLockedAt: 1, token: 1, nameChangedAt: 1, renameOffer: 1 }
            )
            .lean();
        if (!cat) {
            throw new NotFoundException('Cat does not exist');
        }
        if (!cat.isStarter) {
            throw new ForbiddenException('Only your starter cat can be renamed');
        }
        if (!cat.starterLockedAt) {
            throw new ConflictException('Choose your starter cat first');
        }
        if (isMinted(cat)) {
            throw new ConflictException('This cat is minted, so its name is frozen');
        }
        const name = await this.validName(raw);
        if (name === cat.name) {
            return { success: true, cat: this.renameView(cat) };
        }

        const now = this.now();
        const windowStart = new Date(now.getTime() - RENAME_COOLDOWN_MS);
        if (!cat.renameOffer && cat.nameChangedAt && new Date(cat.nameChangedAt) > windowStart) {
            throw this.cooldown(cat.nameChangedAt);
        }
        // One conditional write: parallel renames race on the window, so at most one is stored.
        const renamed: any = await this.catRepository.model
            .findOneAndUpdate(
                {
                    _id,
                    owner,
                    isStarter: true,
                    starterLockedAt: { $exists: true },
                    ...NOT_MINTED_FILTER,
                    $or: [
                        { nameChangedAt: { $exists: false } },
                        { nameChangedAt: { $lte: windowStart } },
                        { renameOffer: true },
                    ],
                },
                { $set: { name, nameChangedAt: now }, $unset: { renameOffer: 1 } },
                { new: true, projection: { name: 1, nameChangedAt: 1 } }
            )
            .lean();
        if (!renamed) {
            const latest: any = await this.catRepository.model
                .findOne({ _id }, { nameChangedAt: 1, token: 1, starterLockedAt: 1 })
                .lean();
            if (isMinted(latest)) {
                throw new ConflictException('This cat is minted, so its name is frozen');
            }
            throw this.cooldown(latest?.nameChangedAt || now);
        }
        return { success: true, cat: this.renameView(renamed) };
    }

    /** "Keep the name" on the legacy rename offer (decision #20). Idempotent. */
    async dismissRenameOffer(catId: string, userId: string): Promise<{ success: true }> {
        const _id = toObjectId(catId);
        const owner = toObjectId(String(userId), 'user');
        const cat = await this.catRepository.model.findOne({ _id, owner }, { _id: 1 }).lean();
        if (!cat) {
            throw new NotFoundException('Cat does not exist');
        }
        await this.catRepository.model.updateOne({ _id, owner }, { $unset: { renameOffer: 1 } });
        return { success: true };
    }

    async report(
        catId: string,
        reporterId: string,
        body: { reason?: unknown; note?: unknown } = {}
    ): Promise<{ success: true }> {
        const _id = toObjectId(catId);
        const reporter = toObjectId(String(reporterId), 'user');
        const reason = (body?.reason ?? 'offensive') as NameReportReason;
        if (!NAME_REPORT_REASONS.includes(reason)) {
            throw new BadRequestException(`reason must be one of ${NAME_REPORT_REASONS.join(', ')}`);
        }
        const cat: any = await this.catRepository.model.findOne({ _id }, { name: 1, owner: 1, isStarter: 1 }).lean();
        if (!cat) {
            throw new NotFoundException('Cat does not exist');
        }
        if (!cat.isStarter) {
            // Shelter cats are named by their shelter; only player names can be reported.
            throw new BadRequestException('Only player-named cats can be reported');
        }
        if (cat.owner && String(cat.owner) === String(reporter)) {
            throw new BadRequestException('You cannot report your own cat');
        }
        const note = cleanNote(body?.note);
        try {
            await this.nameReportRepository.model.findOneAndUpdate(
                { cat: _id, reporter, status: 'open' },
                {
                    $set: {
                        reason,
                        nameSnapshot: String(cat.name || ''),
                        ...(cat.owner ? { catOwner: cat.owner } : {}),
                        ...(note ? { note } : {}),
                    },
                    $setOnInsert: { createdAt: this.now() },
                },
                { upsert: true, new: true }
            );
        } catch (error) {
            // Two parallel reports by one player: the partial unique index kept one. Both succeed.
            if (!isDuplicateKeyError(error)) {
                throw error;
            }
        }
        return { success: true };
    }

    async moderate(
        catId: string,
        moderatorId: string,
        body: { action?: unknown; name?: unknown } = {}
    ): Promise<{ success: true; cat: { _id: string; name: string }; resolved: number }> {
        const _id = toObjectId(catId);
        const action = body?.action as NameModerationAction;
        if (!NAME_MODERATION_ACTIONS.includes(action)) {
            throw new BadRequestException(`action must be one of ${NAME_MODERATION_ACTIONS.join(', ')}`);
        }
        const cat: any = await this.catRepository.model
            .findOne({ _id }, { name: 1, isStarter: 1, starterBreed: 1 })
            .lean();
        // A deleted cat's reports can still be dismissed, so they never stay open forever. Renaming
        // or resetting needs the cat.
        if (!cat && action !== 'dismiss') {
            throw new NotFoundException('Cat does not exist');
        }
        const now = this.now();
        const moderator = Types.ObjectId.isValid(String(moderatorId))
            ? new Types.ObjectId(String(moderatorId))
            : undefined;
        let name = String(cat?.name || '');
        // Moderation overrides the mint freeze (decision #22, recorded in the 3c review): an offensive
        // name must be removable (App Store 1.2), and the NFT name is served off-chain by
        // GET /cat/nft/:tokenId, so it changes there too. Players still cannot rename a minted cat.
        if (action !== 'dismiss') {
            if (!cat.isStarter) {
                throw new BadRequestException('Only player-named cats can be renamed by moderation');
            }
            name =
                action === 'reset'
                    ? STARTER_ART[cat.starterBreed as keyof typeof STARTER_ART]?.name || FALLBACK_STARTER_NAME
                    : await this.validName(body?.name);
            // The 30-day window restarts (decision #22, 3c review): a player whose name was reset
            // cannot pick another offensive one straight away. The legacy rename offer is spent too.
            await this.catRepository.model.updateOne(
                { _id },
                {
                    $set: {
                        name,
                        nameChangedAt: now,
                        nameModeratedAt: now,
                        ...(moderator ? { nameModeratedBy: moderator } : {}),
                    },
                    $unset: { renameOffer: 1 },
                }
            );
        }
        const result: any = await this.nameReportRepository.model.updateMany(
            { cat: _id, status: 'open' },
            {
                $set: {
                    status: action === 'dismiss' ? 'dismissed' : 'actioned',
                    action,
                    resolvedAt: now,
                    ...(moderator ? { resolvedBy: moderator } : {}),
                },
            }
        );
        return { success: true, cat: { _id: String(_id), name }, resolved: result?.modifiedCount ?? 0 };
    }

    async listReports(status: unknown = 'open', page: unknown = 0): Promise<INameReportGroup[]> {
        const wanted = (typeof status === 'string' && status ? status : 'open') as NameReportStatus;
        if (!NAME_REPORT_STATUSES.includes(wanted)) {
            throw new BadRequestException(`status must be one of ${NAME_REPORT_STATUSES.join(', ')}`);
        }
        const pageNumber = Math.max(0, Math.floor(Number(page) || 0));
        const reports: any[] = await this.nameReportRepository.model
            .find(
                { status: wanted },
                { cat: 1, reason: 1, note: 1, nameSnapshot: 1, status: 1, action: 1, resolvedAt: 1, createdAt: 1 }
            )
            .sort({ createdAt: -1 })
            .limit(NAME_REPORTS_SCAN_LIMIT)
            .lean();
        const catIds = [...new Set(reports.map(report => String(report.cat)))].map(id => new Types.ObjectId(id));
        const cats: any[] = catIds.length
            ? await this.catRepository.model
                  .find(
                      { _id: { $in: catIds } },
                      { name: 1, catImg: 1, starterBreed: 1, nameChangedAt: 1, nameModeratedAt: 1 }
                  )
                  .lean()
            : [];
        return groupNameReports(reports, cats).slice(
            pageNumber * NAME_REPORTS_PAGE_SIZE,
            (pageNumber + 1) * NAME_REPORTS_PAGE_SIZE
        );
    }

    private renameView(cat: any): IRenameResponse['cat'] {
        const nameChangedAt = cat.nameChangedAt ? new Date(cat.nameChangedAt) : undefined;
        return {
            _id: String(cat._id),
            name: cat.name,
            ...(nameChangedAt
                ? { nameChangedAt, nextRenameAt: new Date(nameChangedAt.getTime() + RENAME_COOLDOWN_MS) }
                : {}),
        };
    }

    private cooldown(nameChangedAt: Date | string) {
        const nextRenameAt = new Date(new Date(nameChangedAt).getTime() + RENAME_COOLDOWN_MS);
        return new ConflictException({
            statusCode: HttpStatus.CONFLICT,
            message: `You can rename your cat again on ${nextRenameAt.toISOString().slice(0, 10)}`,
            nextRenameAt: nextRenameAt.toISOString(),
        });
    }
}
