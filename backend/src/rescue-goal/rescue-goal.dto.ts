import { Transform } from 'class-transformer';
import {
    IsBoolean,
    IsIn,
    IsInt,
    IsMongoId,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';
import {
    BUDGET_MONTH_PATTERN,
    GOAL_TARGET_MAX,
    GOAL_TARGET_MIN,
    PLEDGE_MAX,
    PLEDGE_MIN,
} from './rescue-goal.constants';
import { GOAL_FUNDING_CURRENCIES } from './rescue-goal.schema';

/** `POST /rescue-goals/:id/pledge`. `pledgeId` is the client's UUID, the idempotency key. */
export class PledgeDto {
    @IsInt()
    @Min(PLEDGE_MIN)
    @Max(PLEDGE_MAX)
    amount: number;

    @IsUUID()
    pledgeId: string;
}

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const bool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);
const int = ({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;

/** `POST /rescue-goals` (MANAGER). The service re-checks every field and the funding rule. */
export class CreateGoalDto {
    @IsMongoId()
    shelter: string;

    @Transform(trim)
    @IsString()
    @MinLength(3)
    @MaxLength(80)
    title: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(600)
    description?: string;

    @Transform(trim)
    @IsString()
    @MinLength(3)
    @MaxLength(140)
    deliverable: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    image?: string;

    @Transform(int)
    @IsInt()
    @Min(GOAL_TARGET_MIN)
    @Max(GOAL_TARGET_MAX)
    targetTails: number;

    @IsOptional()
    @IsString()
    endsAt?: string;

    @Matches(BUDGET_MONTH_PATTERN)
    budgetMonth: string;

    @Transform(trim)
    @IsString()
    @MinLength(2)
    @MaxLength(80)
    proofOwner: string;

    /** Must be `true`: a goal opens only when its money is set aside (decision #37). */
    @Transform(bool)
    @IsBoolean()
    fundingSetAside: boolean;

    @Transform(trim)
    @IsString()
    @MinLength(2)
    @MaxLength(80)
    fundingLine: string;

    /** Decimal string, at most 2 decimals ("50", "49.90"). */
    @Transform(({ value }) => (typeof value === 'number' ? String(value) : value))
    @Matches(/^\d{1,9}(\.\d{1,2})?$/)
    fundingAmount: string;

    @IsIn(GOAL_FUNDING_CURRENCIES as unknown as string[])
    fundingCurrency: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(300)
    fundingNote?: string;
}

/** `PUT /rescue-goals/:id` (MANAGER): wording, picture, end date and proof owner only. */
export class UpdateGoalDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(3)
    @MaxLength(80)
    title?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(600)
    description?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(3)
    @MaxLength(140)
    deliverable?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    image?: string;

    @IsOptional()
    @IsString()
    endsAt?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(2)
    @MaxLength(80)
    proofOwner?: string;
}

/** `POST /rescue-goals/:id/deliver` (MANAGER), multipart with `photo` and `receipt` files. */
export class DeliverGoalDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    note?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @Matches(/^(0x)?[0-9a-fA-F]{64}$/)
    txHash?: string;
}

/** `POST /rescue-goals/:id/cancel` (MANAGER). */
export class CancelGoalDto {
    @Transform(trim)
    @IsString()
    @MinLength(3)
    @MaxLength(300)
    reason: string;
}
