import {
    BadRequestException,
    Body,
    Controller,
    ForbiddenException,
    Get,
    NotFoundException,
    Optional,
    Param,
    Post,
    Put,
    UseGuards,
    ValidationPipe,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsDateString,
    IsEthereumAddress,
    IsIn,
    IsMongoId,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
} from 'class-validator';
import { ISO_ALPHA2_CODES } from 'src/impact/iso-countries';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { getSlug } from 'src/shared/utils/content.utils';
import { HANDOVER_STATUSES, PARTNER_STATUSES, Shelter, SHELTER_ROLES } from 'src/shelter/shelter.schema';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { UserService } from 'src/user/user.service';
import { ShelterRepository } from './shelter.repository';
import { AUTH_USER, IAuthUser } from 'src/common/decorators/auth-user.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ShelterMembersService, ShelterMemberView, SHELTER_MEMBERS_MAX } from './shelter-members.service';

/**
 * The only shelter fields the public GETs return (F7.7, W1 security hotfix). An explicit whitelist,
 * so `wallets` (with the encrypted Stellar secret), `users`, `code` and `blessing` never leave, and a
 * field added to the schema later stays private until it is listed here. `countryCode`,
 * `partnerStatus`, `role` and `publicWallet` do not exist yet and are simply absent (W2).
 */
export const SHELTER_PUBLIC_FIELDS = [
    '_id',
    'name',
    'slug',
    'description',
    'image',
    'country',
    'countryCode',
    'partnerStatus',
    'role',
    'publicWallet',
] as const;

export const SHELTER_PUBLIC_PROJECTION = SHELTER_PUBLIC_FIELDS.join(' ');

/**
 * Contact fields the CMS shelter editor loads and writes back (cms/pages/shelters/[id].tsx). Added
 * for MANAGER and above only, so the editor does not save them back blank. Never secrets.
 */
export const SHELTER_MANAGER_FIELDS = [
    'address',
    'website',
    'facebook',
    'twitter',
    'tiktok',
    'foundedAt',
    'handoverStatus',
    'handoverAt',
    'handoverTx',
] as const;

/**
 * A blank string clears an optional field: a form that empties a select or input sends `''`, which
 * becomes `null` (stored as "not set") instead of failing the allowed-values check.
 */
const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);
const clearable = ({ value }: { value: unknown }) => blankToNull(value);
const upper = ({ value }: { value: unknown }) => {
    const v = blankToNull(value);
    return typeof v === 'string' ? v.trim().toUpperCase() : v;
};
const lower = ({ value }: { value: unknown }) => {
    const v = blankToNull(value);
    return typeof v === 'string' ? v.trim().toLowerCase() : v;
};

/**
 * Body of `POST /shelter` and `PUT /shelter/:id` (plan F7.7, G4 "validate the shelter PUT with a
 * DTO"). Only these fields can be written: `wallets`, `users`, `blessing`, `code` and `slug` are
 * rejected (400), so a raw body can no longer overwrite the custodial wallet or the member list.
 */
export class ShelterWriteDto {
    @IsOptional() @IsString() @MaxLength(200) name?: string;
    @IsOptional() @IsString() @MaxLength(10000) description?: string;
    @IsOptional() @IsString() @MaxLength(500) address?: string;
    @IsOptional() @IsString() @MaxLength(500) website?: string;
    @IsOptional() @IsString() @MaxLength(500) facebook?: string;
    @IsOptional() @IsString() @MaxLength(500) twitter?: string;
    @IsOptional() @IsString() @MaxLength(500) tiktok?: string;
    @IsOptional() @IsDateString() foundedAt?: string;
    @IsOptional() @IsMongoId() image?: string;
    /** Free text, kept for old clients. */
    @IsOptional() @IsString() @MaxLength(100) country?: string;
    @IsOptional() @Transform(upper) @IsIn(ISO_ALPHA2_CODES as string[]) countryCode?: string;
    @IsOptional()
    @Transform(clearable)
    @IsIn(PARTNER_STATUSES as unknown as string[])
    partnerStatus?: Shelter['partnerStatus'];
    @IsOptional() @Transform(clearable) @IsIn(SHELTER_ROLES as unknown as string[]) role?: Shelter['role'];
    // Custody fields decide the money tier (F7.2), so only an ADMIN writes them.
    @IsOptional()
    @Transform(clearable)
    @IsIn(HANDOVER_STATUSES as unknown as string[])
    handoverStatus?: Shelter['handoverStatus'];
    @IsOptional() @Transform(clearable) @IsDateString() handoverAt?: string;
    @IsOptional() @Transform(lower) @Matches(/^0x[0-9a-f]{64}$/) handoverTx?: string;
    @IsOptional() @Transform(lower) @IsEthereumAddress() publicWallet?: string;
}

export const SHELTER_ADMIN_ONLY_FIELDS = ['handoverStatus', 'handoverAt', 'handoverTx', 'publicWallet'] as const;
/** Fields the schema requires: a `null` in the body is dropped instead of blanking them. */
const SHELTER_REQUIRED_FIELDS = ['name', 'description', 'address', 'foundedAt', 'image'] as const;

export const shelterWritePipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    expectedType: ShelterWriteDto,
});

/** A custody field's value in comparable form: dates as epoch ms, text lowercased, empty as null. */
function custodyValue(field: string, value: unknown): string | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    if (field === 'handoverAt') {
        const time = new Date(value as string | Date).getTime();
        return Number.isNaN(time) ? String(value) : String(time);
    }
    return String(value).trim().toLowerCase();
}

/** Validates who may write what and returns the fields to store. Throws 403 or 400. */
export function shelterWrite(
    body: ShelterWriteDto,
    user: IAuthUser | undefined,
    existing?: Partial<Shelter> | null
): Partial<Shelter> {
    const write: Record<string, unknown> = { ...body };
    for (const key of Object.keys(write)) {
        if (
            write[key] === undefined ||
            (write[key] === null && (SHELTER_REQUIRED_FIELDS as readonly string[]).includes(key))
        ) {
            delete write[key];
        }
    }
    const isAdmin = (user?.permission ?? 0) >= PERMISSION_LEVEL.ADMIN;
    if (!isAdmin) {
        // The CMS editor loads the handover fields for managers and sends them back on every save, so
        // an unchanged value is dropped (nothing is written); only an actual change is refused.
        const changed: string[] = [];
        for (const field of SHELTER_ADMIN_ONLY_FIELDS.filter(key => key in write)) {
            if (custodyValue(field, write[field]) === custodyValue(field, (existing as any)?.[field])) {
                delete write[field];
            } else {
                changed.push(field);
            }
        }
        if (changed.length) {
            throw new ForbiddenException(`Only an admin can change ${changed.join(', ')}`);
        }
    }
    const merged = { ...(existing || {}), ...write } as Partial<Shelter>;
    if (merged.handoverStatus === 'handed-over' && !merged.publicWallet) {
        throw new BadRequestException('handed-over needs the shelter publicWallet');
    }
    return write as Partial<Shelter>;
}

export const shelterProjectionFor = (user?: IAuthUser | null) =>
    (user?.permission ?? 0) >= PERMISSION_LEVEL.MANAGER
        ? [...SHELTER_PUBLIC_FIELDS, ...SHELTER_MANAGER_FIELDS].join(' ')
        : SHELTER_PUBLIC_PROJECTION;

/** Body of PUT /shelter/:id/members: user ids or emails to add, user ids to remove. */
export class ShelterMembersDto {
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(SHELTER_MEMBERS_MAX)
    @IsString({ each: true })
    @MaxLength(200, { each: true })
    add?: string[];
    @IsOptional() @IsArray() @ArrayMaxSize(SHELTER_MEMBERS_MAX) @IsMongoId({ each: true }) remove?: string[];
}

export const shelterMembersPipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    expectedType: ShelterMembersDto,
});

@Controller('shelter')
export class ShelterController {
    constructor(
        private repository: ShelterRepository,
        private userService: UserService,
        @Optional() private members?: ShelterMembersService
    ) {}

    /** The members who may confirm this shelter's payouts (plan G4 "Attestation"). ADMIN only. */
    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Get(':id/members')
    async listMembers(@Param('id') id: string): Promise<ShelterMemberView[]> {
        return this.members!.list(id);
    }

    /** Grants or removes payout confirmers. ADMIN only; members must be verified registered accounts. */
    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Put(':id/members')
    async changeMembers(
        @Param('id') id: string,
        @Body(shelterMembersPipe) body: ShelterMembersDto
    ): Promise<ShelterMemberView[]> {
        return this.members!.change(id, body);
    }

    @UseGuards(AppAuthGuard)
    @Get('')
    async find(@AUTH_USER() user?: IAuthUser): Promise<Shelter[]> {
        return this.repository.find({
            searchObject: {},
            projection: shelterProjectionFor(user),
            populate: [{ path: 'image', select: 'url' }],
        });
    }

    @UseGuards(AppAuthGuard)
    @Get(':id')
    async findOne(@Param('id') id: string, @AUTH_USER() user?: IAuthUser): Promise<Shelter> {
        return this.repository.findOne({
            searchObject: { _id: id },
            projection: shelterProjectionFor(user),
            populate: [{ path: 'image', select: 'url' }],
        });
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Post('')
    async create(@Body(shelterWritePipe) body: ShelterWriteDto, @AUTH_USER() user?: IAuthUser): Promise<Shelter> {
        const object = shelterWrite(body, user);
        const missing = SHELTER_REQUIRED_FIELDS.filter(field => !(object as Record<string, unknown>)[field]);
        if (missing.length) {
            throw new BadRequestException(`Missing ${missing.join(', ')}`);
        }
        const wallets = this.userService.generateWallets();
        return this.repository.create({ ...(object as Shelter), slug: getSlug(object.name!), wallets });
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Put(':id')
    async update(
        @Param('id') id: string,
        @Body(shelterWritePipe) body: ShelterWriteDto,
        @AUTH_USER() user?: IAuthUser
    ): Promise<Shelter> {
        const existingEntity = await this.repository.findOne({
            searchObject: { _id: id },
            // Every custody field, so a manager's save that sends them back unchanged is accepted.
            projection: ['_id', ...SHELTER_ADMIN_ONLY_FIELDS].join(' '),
        });

        if (!existingEntity) {
            throw new NotFoundException();
        }
        return this.repository.update(existingEntity?._id, shelterWrite(body, user, existingEntity));
    }
}
