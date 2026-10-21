import { Equals, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PAWLEGENDS_LEVELS, PAWLEGENDS_MAX_INPUT_CHARS, PAWLEGENDS_MAX_TICKS } from 'src/shared-contracts/caps';

/** The mutators a replay may carry (sim v10: only 'none'; GAPS §8 item 1). */
export const PAWLEGENDS_MUTATORS = ['none'] as const;

/**
 * The Pawlegends replay posted with a `PAWLEGENDS` save in the `pawlegends` field (POC.md §11.3): the
 * `ReplayRecord` of `pawlegends/src/sim/api.ts` as the game recorded it (sim v9 or v10).
 *
 * Shape and work bounds only (ticks ≤ PAWLEGENDS_MAX_TICKS, inputs ≤ PAWLEGENDS_MAX_INPUT_CHARS base64 characters),
 * checked before anything is queued. The sim version is compared in `pawlegends-live.ts` (so the 400 can name the
 * backend's sim); hero and trick ids, the command stream, the outcome and the hash are checked by the vendored
 * sim's `verifyReplay` in a worker thread.
 */
export class PawlegendsReplayDto {
    @Equals(1)
    v: 1;

    @IsInt()
    @Min(1)
    @Max(1_000_000)
    simVersion: number;

    @IsInt()
    @Min(0)
    @Max(0xffffffff)
    seed: number;

    @IsIn(PAWLEGENDS_LEVELS)
    difficulty: string;

    @IsString()
    @Matches(/^[a-z]{1,16}$/)
    hero: string;

    @IsString()
    @Matches(/^[a-z]{1,16}$/)
    trick: string;

    @IsInt()
    @Min(1)
    @Max(PAWLEGENDS_MAX_TICKS)
    ticks: number;

    @IsString()
    @MaxLength(PAWLEGENDS_MAX_INPUT_CHARS)
    @Matches(/^[A-Za-z0-9+/]*={0,2}$/)
    inputs: string;

    @IsIn(['won', 'lost'])
    outcome: 'won' | 'lost';

    @IsString()
    @Matches(/^[0-9a-f]{8}$/)
    finalHash: string;

    /** Sim v10 (GAPS B0): the match mutator. Only 'none' exists; v9 records have no field. */
    @IsOptional()
    @IsIn(PAWLEGENDS_MUTATORS)
    mutator?: 'none';
}
