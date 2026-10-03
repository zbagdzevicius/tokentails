import {
    ArrayMaxSize,
    ArrayMinSize,
    ArrayUnique,
    Equals,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Max,
    Min,
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
} from 'class-validator';
import { HEIST_LEVELS, HEIST_MAX_RUNS, HEIST_MAX_TICKS } from 'src/shared-contracts/caps';
import { CAMPAIGN_SEED, CAT_IDS, SIM_VERSION } from 'src/vendor/heist-sim';

const AXIS = [-1, 0, 1];
const MAX_INPUT_FLAGS = 7;

/** True for `[dx, dy, flags, count]` with dx, dy in {-1, 0, 1}, integer flags 0..7 and count >= 1. */
export const isHeistInputRun = (run: unknown): boolean => {
    if (!Array.isArray(run) || run.length !== 4) {
        return false;
    }
    const [dx, dy, flags, count] = run;
    return (
        AXIS.indexOf(dx) !== -1 &&
        AXIS.indexOf(dy) !== -1 &&
        Number.isInteger(flags) &&
        flags >= 0 &&
        flags <= MAX_INPUT_FLAGS &&
        Number.isInteger(count) &&
        count >= 1
    );
};

/**
 * Every run is a valid input run and the counts sum exactly to the sibling `ticks`. Stops as soon as
 * the sum passes `ticks`, so a hostile array costs at most `HEIST_MAX_RUNS` cheap checks.
 */
function IsHeistRuns(options?: ValidationOptions) {
    return (object: object, propertyName: string) =>
        registerDecorator({
            name: 'isHeistRuns',
            target: object.constructor,
            propertyName,
            options: { message: 'runs must be [dx, dy, flags, count] tuples whose counts sum to ticks', ...options },
            validator: {
                validate(value: unknown, args: ValidationArguments) {
                    const ticks = (args.object as { ticks?: unknown }).ticks;
                    if (!Array.isArray(value) || !Number.isInteger(ticks)) {
                        return false;
                    }
                    let total = 0;
                    for (const run of value) {
                        if (!isHeistInputRun(run)) {
                            return false;
                        }
                        total += run[3];
                        if (total > (ticks as number)) {
                            return false;
                        }
                    }
                    return total === ticks;
                },
            },
        });
}

/**
 * The Heist input log posted with a `CATNIP_HEIST` save (plan G2 layer 2, F6). The same shape as
 * `HeistRunLog` in `src/shared-contracts/heist-bridge.ts` and `InputLog` in the Heist sim, so the
 * client can post the log it recorded as is.
 *
 * Strict: the campaign seed, the current sim version, two different known cats, at most
 * `HEIST_MAX_TICKS` ticks and `HEIST_MAX_RUNS` runs. The per-level tick cap
 * (`min(4 x parTicks, 18000)`) and the outcome are checked by `verifyRun` (the vendored sim) before
 * and during the replay.
 */
export class HeistReplayDto {
    @IsString()
    @IsIn(HEIST_LEVELS)
    levelId: string;

    @IsInt()
    @Equals(SIM_VERSION, { message: `simVersion must be ${SIM_VERSION}` })
    simVersion: number;

    @IsInt()
    @Equals(CAMPAIGN_SEED, { message: `seed must be ${CAMPAIGN_SEED}` })
    seed: number;

    @IsArray()
    @ArrayMinSize(2)
    @ArrayMaxSize(2)
    @ArrayUnique()
    @IsString({ each: true })
    @IsIn(CAT_IDS as string[], { each: true })
    catIds: [string, string];

    @IsInt()
    @Min(1)
    @Max(HEIST_MAX_TICKS)
    ticks: number;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(HEIST_MAX_RUNS)
    @IsHeistRuns()
    runs: [number, number, number, number][];

    // What the recorder expected. Accepted so the log can be posted verbatim, never trusted: the
    // server replays the run and keeps only its own results.
    @IsOptional()
    @IsInt()
    finalHash?: number;

    @IsOptional()
    @IsInt()
    score?: number;

    @IsOptional()
    @IsInt()
    spottedCount?: number;

    @IsOptional()
    @IsInt()
    coins?: number;
}
