import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { randomBytes } from 'crypto';
import { formatUnits, parseUnits } from 'ethers';
import { Model, Types } from 'mongoose';
import { IAuthUser } from 'src/common/decorators/auth-user.decorator';
import { isStaff, ShelterMembersService } from 'src/shelter/shelter-members.service';
import { Shelter, ShelterDocument } from 'src/shelter/shelter.schema';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import {
    AttestationFields,
    attestationHash,
    attestationMessage,
    AttestationTier,
    looksPersonal,
    PAYOUT_METHODS,
    PAYOUT_PURPOSES,
    PayoutStatus,
    recoverSigner,
    sha256Hex,
    tierOf,
} from './attestation';
import { ImpactPayout, ImpactPayoutDocument } from './payout.schema';

export const PAYOUT_ERROR = {
    AUTHOR_CANNOT_CONFIRM: 'PAYOUT_AUTHOR_CANNOT_CONFIRM',
    STAFF_CANNOT_CONFIRM: 'PAYOUT_STAFF_CANNOT_CONFIRM',
    NOT_A_MEMBER: 'PAYOUT_NOT_A_MEMBER',
    RECEIPT_MISMATCH: 'PAYOUT_RECEIPT_MISMATCH',
    STALE_ATTESTATION: 'PAYOUT_STALE_ATTESTATION',
    NOT_DRAFT: 'PAYOUT_NOT_DRAFT',
    BAD_SIGNATURE: 'PAYOUT_BAD_SIGNATURE',
    HANDOVER_PENDING: 'PAYOUT_HANDOVER_PENDING',
} as const;

export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
const RECEIPT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const isManager = (user?: IAuthUser | null) => (user?.permission ?? 0) >= PERMISSION_LEVEL.MANAGER;
const isAdmin = (user?: IAuthUser | null) => (user?.permission ?? 0) >= PERMISSION_LEVEL.ADMIN;
// eslint-disable-next-line no-control-regex
export const SINGLE_LINE = /^[^\u0000-\u001f\u007f]*$/;
const blankToUndefined = ({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value;

/** The draft's creator or anyone who edited it. None of them may confirm it. */
function isAuthor(payout: any, user: IAuthUser): boolean {
    const id = String(user._id);
    return [payout.createdBy, ...(payout.editors || [])].some(author => String(author) === id);
}

/** Multipart fields of POST /impact/payouts and PUT /impact/payouts/:id (all strings on the wire). */
export class PayoutWriteDto {
    @IsOptional() @IsMongoId() shelter?: string;
    @IsOptional() @IsIn(PAYOUT_PURPOSES as unknown as string[]) purpose?: string;
    /** Decimal, e.g. "12.40". */
    @IsOptional() @Matches(/^\d{1,12}(\.\d{1,18})?$/) amount?: string;
    @IsOptional()
    @Transform(({ value }) =>
        String(value || '')
            .trim()
            .toUpperCase()
    )
    @Matches(/^[A-Z]{3,5}$/)
    symbol?: string;
    @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) paidAt?: string;
    @IsOptional() @IsIn(PAYOUT_METHODS as unknown as string[]) method?: string;
    @IsOptional() @Transform(blankToUndefined) @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) pledgeMonth?: string;
    @IsOptional()
    @Transform(({ value }) => (value === '' || value == null ? undefined : Number(value)))
    @IsInt()
    @Min(0)
    @Max(1_000_000_000)
    usdCents?: number;
    @IsOptional() @Transform(blankToUndefined) @Matches(/^\d{4}-\d{2}-\d{2}$/) fxDate?: string;
    /** Single line: a newline could add a fake line to the attestation text the confirmer reads. */
    @IsOptional() @Transform(blankToUndefined) @IsString() @MaxLength(80) @Matches(SINGLE_LINE) fxSource?: string;
    @IsOptional() @Transform(blankToUndefined) @IsString() @MaxLength(80) @Matches(SINGLE_LINE) reference?: string;
    @IsOptional()
    @Transform(({ value }) => (typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : undefined))
    @Matches(/^0x[0-9a-f]{64}$/)
    txHash?: string;
}

export class PayoutConfirmDto {
    @Matches(/^[0-9a-f]{64}$/) attestationHash: string;
}

export class PayoutSignatureDto {
    @Matches(/^0x[0-9a-fA-F]{130}$/) signature: string;
}

export interface UploadedReceipt {
    buffer: Buffer;
    size?: number;
    mimetype?: string;
}

export interface PayoutView {
    id: string;
    shelter: { _id: string; slug: string; name: string; handoverStatus: string | null };
    status: PayoutStatus;
    tier: AttestationTier | null;
    purpose: string;
    amountWei: string;
    amount: string;
    symbol: string;
    paidAt: string;
    method: string;
    pledgeMonth: string | null;
    usdEquivalent: { cents: number; fxDate: string; fxSource: string } | null;
    reference: string | null;
    txHash: string | null;
    receipt: { sha256: string; size: number; mime: string; uploadedAt: string };
    attestationHash: string;
    attestationMessage: string;
    createdByMe: boolean;
    /** The caller edited this draft after it was written, so they cannot confirm it either. */
    editedByMe: boolean;
    confirmedAt: string | null;
    signature: { signer: string; signedAt: string } | null;
    /** The caller may confirm: a member of the shelter who is not the draft's author. */
    canConfirm: boolean;
    canSign: boolean;
    createdAt: string | null;
}

/** One confirmed or signed payout in the public snapshot. Slugs and public ids only. */
export interface PublicPayout {
    id: string;
    shelter: string;
    paidAt: string;
    purpose: string;
    amountWei: string;
    symbol: string;
    tier: AttestationTier;
    receiptSha256: string;
    signer: string | null;
    txHash: string | null;
}

/**
 * Hashes an uploaded receipt. `checkType` is off on confirm: the confirmer re-uploads the same file only to
 * prove they hold it, and some browsers report HEIC with an empty type, so only size and hash matter there.
 */
function receiptOf(file: UploadedReceipt | undefined | null, checkType = true) {
    if (!file?.buffer?.length) {
        throw new BadRequestException('Attach the receipt file');
    }
    if (file.buffer.length > RECEIPT_MAX_BYTES) {
        throw new BadRequestException('The receipt is larger than 10 MB');
    }
    const mime = String(file.mimetype || 'application/octet-stream').toLowerCase();
    if (checkType && !RECEIPT_TYPES.includes(mime)) {
        throw new BadRequestException('The receipt must be a PDF or an image');
    }
    return { sha256: sha256Hex(file.buffer), size: file.buffer.length, mime, uploadedAt: new Date() };
}

/**
 * Payout attestation (plan G4): drafts with a server-computed receipt hash, confirmation by a shelter
 * member who did not write the draft, and EIP-191 signatures from a handed-over shelter wallet.
 */
@Injectable()
export class ImpactPayoutService {
    constructor(
        @InjectModel(ImpactPayout.name) private payoutModel: Model<ImpactPayoutDocument>,
        @InjectModel(Shelter.name) private shelterModel: Model<ShelterDocument>,
        @Optional() private members?: ShelterMembersService
    ) {}

    private async shelterById(id: unknown): Promise<any> {
        if (!Types.ObjectId.isValid(String(id))) {
            throw new BadRequestException('Unknown shelter');
        }
        const shelter = await this.shelterModel
            .findOne(
                { _id: new Types.ObjectId(String(id)) },
                { slug: 1, name: 1, handoverStatus: 1, publicWallet: 1, role: 1 }
            )
            .lean();
        if (!shelter) {
            throw new BadRequestException('Unknown shelter');
        }
        return shelter;
    }

    private async byPublicId(id: string): Promise<any> {
        const payout = await this.payoutModel.findOne({ publicId: String(id || '') }).lean();
        if (!payout) {
            throw new NotFoundException();
        }
        return payout;
    }

    private fields(payout: any, shelter: any): AttestationFields {
        return {
            publicId: payout.publicId,
            shelterSlug: shelter.slug,
            amount: payout.amount,
            symbol: payout.symbol,
            paidAt: payout.paidAt,
            method: payout.method,
            purpose: payout.purpose,
            pledgeMonth: payout.pledgeMonth || null,
            usdEquivalent: payout.usdEquivalent || null,
            reference: payout.reference || null,
            txHash: payout.txHash || null,
            receiptSha256: payout.receipt.sha256,
        };
    }

    /** Normalises and checks a write. `existing` is the stored draft on an update. */
    private writeOf(body: PayoutWriteDto, existing?: any): Record<string, unknown> {
        const merged: Record<string, any> = {
            purpose: body.purpose ?? existing?.purpose,
            symbol: body.symbol ?? existing?.symbol,
            method: body.method ?? existing?.method,
            pledgeMonth: body.pledgeMonth ?? existing?.pledgeMonth,
            reference: body.reference ?? existing?.reference,
            txHash: body.txHash ?? existing?.txHash,
        };
        const write: Record<string, any> = {};
        for (const key of ['purpose', 'symbol', 'method', 'pledgeMonth', 'reference', 'txHash']) {
            if ((body as any)[key] !== undefined) {
                write[key] = (body as any)[key];
            }
        }
        if (body.amount !== undefined) {
            const wei = parseUnits(body.amount, 18);
            if (wei <= BigInt(0)) {
                throw new BadRequestException('amount must be more than 0');
            }
            write.amount = wei.toString();
        }
        if (body.paidAt !== undefined) {
            const paidAt = new Date(`${body.paidAt}T00:00:00Z`);
            if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
                throw new BadRequestException('paidAt must be a real date, not in the future');
            }
            write.paidAt = paidAt;
        }
        if (body.usdCents !== undefined || body.fxDate !== undefined || body.fxSource !== undefined) {
            if (body.usdCents === undefined || !body.fxDate || !body.fxSource) {
                throw new BadRequestException('A USD equivalent needs usdCents, fxDate and fxSource');
            }
            write.usdEquivalent = { cents: body.usdCents, fxDate: body.fxDate, fxSource: body.fxSource };
        }
        const usd = write.usdEquivalent ?? existing?.usdEquivalent;
        for (const required of ['purpose', 'symbol', 'method']) {
            if (!merged[required]) {
                throw new BadRequestException(`Missing ${required}`);
            }
        }
        if (!(write.amount ?? existing?.amount) || !(write.paidAt ?? existing?.paidAt)) {
            throw new BadRequestException('Missing amount or paidAt');
        }
        if (merged.purpose === 'purchase-pledge') {
            if (!merged.pledgeMonth) {
                throw new BadRequestException('A purchase pledge payout needs pledgeMonth');
            }
            // No mixed-currency sums: the pledge is in USD, so other currencies carry a dated USD figure.
            if (merged.symbol !== 'USD' && !usd) {
                throw new BadRequestException(
                    'A pledge payout not in USD needs its USD equivalent (FX date and source)'
                );
            }
        }
        if (merged.method === 'onchain' && !merged.txHash) {
            throw new BadRequestException('An on-chain payout needs its txHash');
        }
        for (const text of [merged.reference, usd?.fxSource]) {
            if (text != null && !SINGLE_LINE.test(String(text))) {
                throw new BadRequestException('reference and fxSource must be a single line of text');
            }
        }
        if (looksPersonal(merged.reference) || looksPersonal(usd?.fxSource)) {
            throw new BadRequestException('Remove personal data (emails, phone numbers, IBANs) from the reference');
        }
        return write;
    }

    async createDraft(body: PayoutWriteDto, file: UploadedReceipt | undefined, author: IAuthUser): Promise<PayoutView> {
        if (!body.shelter) {
            throw new BadRequestException('Missing shelter');
        }
        const shelter = await this.shelterById(body.shelter);
        const write = this.writeOf(body);
        const receipt = receiptOf(file);
        const draft: any = {
            ...write,
            publicId: `p-${randomBytes(6).toString('hex')}`,
            shelter: shelter._id,
            status: 'DRAFT',
            receipt,
            createdBy: new Types.ObjectId(String(author._id)),
        };
        draft.attestationHash = attestationHash(this.fields(draft, shelter));
        const created = await this.payoutModel.create(draft);
        return this.view((created as any).toObject ? (created as any).toObject() : created, shelter, author);
    }

    async updateDraft(
        id: string,
        body: PayoutWriteDto,
        file: UploadedReceipt | undefined,
        editor: IAuthUser
    ): Promise<PayoutView> {
        const payout = await this.byPublicId(id);
        if (payout.status !== 'DRAFT') {
            throw new ConflictException({ code: PAYOUT_ERROR.NOT_DRAFT, message: 'Only a draft can be edited' });
        }
        const shelter = await this.shelterById(body.shelter ?? payout.shelter);
        const write: Record<string, any> = this.writeOf(body, payout);
        if (body.shelter) {
            write.shelter = shelter._id;
        }
        if (file?.buffer?.length) {
            write.receipt = receiptOf(file);
        }
        const next = { ...payout, ...write };
        write.attestationHash = attestationHash(this.fields(next, shelter));
        // Everyone who edits a draft becomes one of its authors and so cannot confirm it (four-eyes rule).
        const updated = await this.payoutModel
            .findOneAndUpdate(
                { _id: payout._id, status: 'DRAFT' },
                { $set: write, $addToSet: { editors: new Types.ObjectId(String(editor._id)) } },
                { new: true }
            )
            .lean();
        if (!updated) {
            throw new ConflictException({ code: PAYOUT_ERROR.NOT_DRAFT, message: 'Only a draft can be edited' });
        }
        return this.view(updated, shelter, editor);
    }

    async voidPayout(id: string, user: IAuthUser): Promise<PayoutView> {
        const payout = await this.byPublicId(id);
        if (payout.status === 'VOID') {
            return this.view(payout, await this.shelterById(payout.shelter), user);
        }
        if (payout.status !== 'DRAFT' && !isAdmin(user)) {
            throw new ForbiddenException('Only an admin can void a confirmed or signed payout');
        }
        const updated = await this.payoutModel
            .findOneAndUpdate(
                { _id: payout._id, status: payout.status },
                { $set: { status: 'VOID', voidedBy: new Types.ObjectId(String(user._id)), voidedAt: new Date() } },
                { new: true }
            )
            .lean();
        return this.view(updated || payout, await this.shelterById(payout.shelter), user);
    }

    /** MANAGER and above see every payout; a member sees their shelters'; anyone else is refused. */
    async list(user: IAuthUser, filter: { shelter?: string; status?: string } = {}): Promise<PayoutView[]> {
        const query: Record<string, any> = {};
        if (!isManager(user)) {
            const shelters = (await this.members?.sheltersOf(user._id)) || [];
            if (!shelters.length) {
                throw new ForbiddenException({ code: PAYOUT_ERROR.NOT_A_MEMBER, message: 'Not a shelter member' });
            }
            query.shelter = { $in: shelters };
        }
        if (filter.shelter && Types.ObjectId.isValid(filter.shelter)) {
            query.shelter = query.shelter
                ? { $in: query.shelter.$in.filter((s: Types.ObjectId) => String(s) === filter.shelter) }
                : new Types.ObjectId(filter.shelter);
        }
        if (filter.status) {
            query.status = String(filter.status);
        }
        const rows: any[] = await this.payoutModel.find(query).sort({ paidAt: -1 }).limit(200).lean();
        const shelters = new Map<string, any>();
        const views: PayoutView[] = [];
        for (const row of rows || []) {
            const key = String(row.shelter);
            if (!shelters.has(key)) {
                shelters.set(key, await this.shelterById(row.shelter).catch(() => ({ _id: row.shelter, slug: '?' })));
            }
            views.push(await this.view(row, shelters.get(key), user));
        }
        return views;
    }

    async get(id: string, user: IAuthUser): Promise<PayoutView> {
        const payout = await this.byPublicId(id);
        if (!isManager(user) && !(await this.members?.isMember(payout.shelter, user._id))) {
            throw new NotFoundException();
        }
        return this.view(payout, await this.shelterById(payout.shelter), user);
    }

    /**
     * SHELTER-CONFIRMED. The caller must be a member of the payout's shelter and not the draft's author;
     * the uploaded receipt must hash to the stored SHA-256 and `attestationHash` must match the current
     * fields (so an edit after review cannot slip through).
     */
    async confirm(
        id: string,
        body: PayoutConfirmDto,
        file: UploadedReceipt | undefined,
        user: IAuthUser
    ): Promise<PayoutView> {
        const payout = await this.byPublicId(id);
        if (!(await this.members?.isMember(payout.shelter, user._id))) {
            throw new ForbiddenException({
                code: PAYOUT_ERROR.NOT_A_MEMBER,
                message: 'Only a member of this shelter can confirm',
            });
        }
        // Members cannot be staff (ShelterMembersService refuses them), but a member promoted later is
        // re-checked here: SHELTER-CONFIRMED must mean someone at the shelter, not a Token Tails manager.
        if (isStaff(user)) {
            throw new ForbiddenException({
                code: PAYOUT_ERROR.STAFF_CANNOT_CONFIRM,
                message: 'Token Tails staff cannot confirm a payout; a shelter member must',
            });
        }
        if (isAuthor(payout, user)) {
            throw new ForbiddenException({
                code: PAYOUT_ERROR.AUTHOR_CANNOT_CONFIRM,
                message: 'The author or an editor of a draft cannot confirm it',
            });
        }
        if (payout.status !== 'DRAFT') {
            throw new ConflictException({ code: PAYOUT_ERROR.NOT_DRAFT, message: 'Only a draft can be confirmed' });
        }
        const shelter = await this.shelterById(payout.shelter);
        const receipt = receiptOf(file, false);
        if (receipt.sha256 !== payout.receipt?.sha256 || receipt.size !== payout.receipt?.size) {
            throw new BadRequestException({
                code: PAYOUT_ERROR.RECEIPT_MISMATCH,
                message: 'This receipt is not the one attached to the draft',
            });
        }
        const confirmer = new Types.ObjectId(String(user._id));
        const current = attestationHash(this.fields(payout, shelter));
        if (body?.attestationHash !== current || current !== payout.attestationHash) {
            throw new ConflictException({
                code: PAYOUT_ERROR.STALE_ATTESTATION,
                message: 'The draft changed since you reviewed it. Review it again.',
            });
        }
        const updated = await this.payoutModel
            .findOneAndUpdate(
                // `editors` re-checked atomically: an edit racing this confirm cannot add the confirmer unseen.
                { _id: payout._id, status: 'DRAFT', attestationHash: current, editors: { $ne: confirmer } },
                {
                    $set: {
                        status: 'SHELTER_CONFIRMED',
                        confirmedBy: confirmer,
                        confirmedAt: new Date(),
                    },
                },
                { new: true }
            )
            .lean();
        if (!updated) {
            throw new ConflictException({ code: PAYOUT_ERROR.NOT_DRAFT, message: 'Only a draft can be confirmed' });
        }
        return this.view(updated, shelter, user);
    }

    /** SHELTER-SIGNED: an EIP-191 signature of the attestation message by the handed-over shelter wallet. */
    async sign(id: string, body: PayoutSignatureDto, user: IAuthUser): Promise<PayoutView> {
        const payout = await this.byPublicId(id);
        if (!isManager(user) && !(await this.members?.isMember(payout.shelter, user._id))) {
            throw new NotFoundException();
        }
        if (!['DRAFT', 'SHELTER_CONFIRMED'].includes(payout.status)) {
            throw new ConflictException({ code: PAYOUT_ERROR.NOT_DRAFT, message: 'This payout cannot be signed' });
        }
        const shelter = await this.shelterById(payout.shelter);
        if (shelter.handoverStatus !== 'handed-over' || !shelter.publicWallet) {
            throw new ConflictException({
                code: PAYOUT_ERROR.HANDOVER_PENDING,
                message: 'Signatures open once the shelter holds its own wallet key',
            });
        }
        const message = attestationMessage(this.fields(payout, shelter));
        const signer = recoverSigner(message, body?.signature);
        if (!signer || signer !== String(shelter.publicWallet).toLowerCase()) {
            throw new BadRequestException({
                code: PAYOUT_ERROR.BAD_SIGNATURE,
                message: "The signature is not the shelter wallet's signature of this payout",
            });
        }
        const updated = await this.payoutModel
            .findOneAndUpdate(
                { _id: payout._id, status: payout.status },
                {
                    $set: {
                        status: 'SHELTER_SIGNED',
                        signature: { signer, signature: body.signature.trim(), signedAt: new Date() },
                    },
                },
                { new: true }
            )
            .lean();
        return this.view(updated || payout, shelter, user);
    }

    private async view(payout: any, shelter: any, user: IAuthUser | null): Promise<PayoutView> {
        const fields = this.fields(payout, shelter);
        const member = user ? !!(await this.members?.isMember(payout.shelter, user._id)) : false;
        const mine = !!user && String(payout.createdBy) === String(user._id);
        const authored = !!user && isAuthor(payout, user);
        return {
            id: payout.publicId,
            shelter: {
                _id: String(shelter._id),
                slug: shelter.slug,
                name: shelter.name || shelter.slug,
                handoverStatus: shelter.handoverStatus || null,
            },
            status: payout.status,
            tier: tierOf(payout.status),
            purpose: payout.purpose,
            amountWei: payout.amount,
            amount: formatUnits(BigInt(payout.amount), 18),
            symbol: payout.symbol,
            paidAt: new Date(payout.paidAt).toISOString().slice(0, 10),
            method: payout.method,
            pledgeMonth: payout.pledgeMonth || null,
            usdEquivalent: payout.usdEquivalent || null,
            reference: payout.reference || null,
            txHash: payout.txHash || null,
            receipt: {
                sha256: payout.receipt.sha256,
                size: payout.receipt.size,
                mime: payout.receipt.mime,
                uploadedAt: new Date(payout.receipt.uploadedAt).toISOString(),
            },
            attestationHash: payout.attestationHash,
            attestationMessage: attestationMessage(fields),
            createdByMe: mine,
            editedByMe: !!user && (payout.editors || []).some((e: unknown) => String(e) === String(user._id)),
            confirmedAt: payout.confirmedAt ? new Date(payout.confirmedAt).toISOString() : null,
            signature: payout.signature
                ? { signer: payout.signature.signer, signedAt: new Date(payout.signature.signedAt).toISOString() }
                : null,
            canConfirm: payout.status === 'DRAFT' && member && !authored && !isStaff(user),
            canSign:
                ['DRAFT', 'SHELTER_CONFIRMED'].includes(payout.status) &&
                shelter.handoverStatus === 'handed-over' &&
                !!shelter.publicWallet,
            createdAt: payout.createdAt ? new Date(payout.createdAt).toISOString() : null,
        };
    }

    /** Confirmed and signed payouts, for the snapshot. `tierFor` uses the same statuses. */
    async publicPayouts(limit = 50): Promise<PublicPayout[]> {
        const rows: any[] = await this.payoutModel
            .find({ status: { $in: ['SHELTER_CONFIRMED', 'SHELTER_SIGNED'] } })
            .sort({ paidAt: -1 })
            .limit(limit)
            .lean();
        const slugs = new Map<string, string>();
        const out: PublicPayout[] = [];
        for (const row of rows || []) {
            const key = String(row.shelter);
            if (!slugs.has(key)) {
                const shelter: any = await this.shelterModel.findOne({ _id: row.shelter }, { slug: 1 }).lean();
                slugs.set(key, shelter?.slug || '');
            }
            out.push({
                id: row.publicId,
                shelter: slugs.get(key) || '',
                paidAt: new Date(row.paidAt).toISOString().slice(0, 10),
                purpose: row.purpose,
                amountWei: row.amount,
                symbol: row.symbol,
                tier: tierOf(row.status) as AttestationTier,
                receiptSha256: row.receipt?.sha256 || '',
                signer: row.signature?.signer || null,
                txHash: row.txHash || null,
            });
        }
        return out;
    }

    /** `{ tier: { symbol: amountWei } }` over every confirmed and signed payout. Never mixed currencies. */
    async totalsByTier(): Promise<Record<AttestationTier, Record<string, string>>> {
        const rows: any[] = await this.payoutModel
            .find({ status: { $in: ['SHELTER_CONFIRMED', 'SHELTER_SIGNED'] } }, { status: 1, amount: 1, symbol: 1 })
            .lean();
        const totals: Record<AttestationTier, Record<string, bigint>> = {
            'shelter-confirmed': {},
            'shelter-signed': {},
        };
        for (const row of rows || []) {
            const tier = tierOf(row.status) as AttestationTier;
            if (/^\d+$/.test(String(row.amount))) {
                totals[tier][row.symbol] = (totals[tier][row.symbol] || BigInt(0)) + BigInt(row.amount);
            }
        }
        const str = (map: Record<string, bigint>) =>
            Object.fromEntries(Object.entries(map).map(([symbol, amount]) => [symbol, amount.toString()]));
        return {
            'shelter-confirmed': str(totals['shelter-confirmed']),
            'shelter-signed': str(totals['shelter-signed']),
        };
    }

    /** Paid toward the purchase pledge, in USD cents by `pledgeMonth`. USD amounts or dated USD equivalents. */
    async pledgePaidCents(): Promise<Map<string, number>> {
        const rows: any[] = await this.payoutModel
            .find(
                { purpose: 'purchase-pledge', status: { $in: ['SHELTER_CONFIRMED', 'SHELTER_SIGNED'] } },
                { pledgeMonth: 1, amount: 1, symbol: 1, usdEquivalent: 1 }
            )
            .lean();
        const paid = new Map<string, number>();
        for (const row of rows || []) {
            const cents =
                row.usdEquivalent && Number.isInteger(row.usdEquivalent.cents)
                    ? row.usdEquivalent.cents
                    : row.symbol === 'USD' && /^\d+$/.test(String(row.amount))
                    ? Number(BigInt(row.amount) / BigInt('10000000000000000'))
                    : null;
            if (row.pledgeMonth && cents !== null) {
                paid.set(row.pledgeMonth, (paid.get(row.pledgeMonth) || 0) + cents);
            }
        }
        return paid;
    }

    /** The public tier and tx hash of a payout, for an outcome that links it. */
    async linkOf(
        payoutId: unknown
    ): Promise<{ tier: AttestationTier | null; txHash: string | null; id: string } | null> {
        if (!payoutId || !Types.ObjectId.isValid(String(payoutId))) {
            return null;
        }
        const row: any = await this.payoutModel
            .findOne({ _id: new Types.ObjectId(String(payoutId)) }, { status: 1, txHash: 1, publicId: 1 })
            .lean();
        return row ? { tier: tierOf(row.status), txHash: row.txHash || null, id: row.publicId } : null;
    }
}
