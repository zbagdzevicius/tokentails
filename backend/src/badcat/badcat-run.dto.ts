import {
    ArrayMaxSize,
    ArrayMinSize,
    Equals,
    IsArray,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    registerDecorator,
    ValidationOptions,
} from 'class-validator';
import { MAX_RUN_TICKS, MAX_RUNS, SIM_VERSION } from 'src/vendor/badcat-sim';

/** `[dir 0..8, speed 0..2, buttons 0..7, count >= 1]`: one Bad Cat input run (bad-cat/src/sim/replay.ts). */
export const isBadcatInputRun = (run: unknown): boolean => {
    if (!Array.isArray(run) || run.length !== 4) {
        return false;
    }
    const [dir, speed, buttons, count] = run;
    const int = (v: unknown, lo: number, hi: number) =>
        Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
    return int(dir, 0, 8) && int(speed, 0, 2) && int(buttons, 0, 7) && int(count, 1, MAX_RUN_TICKS);
};

/** Every run valid and the counts no more than one run of the longest room. Stops at the first bad run. */
function IsBadcatRuns(options?: ValidationOptions) {
    return (object: object, propertyName: string) =>
        registerDecorator({
            name: 'isBadcatRuns',
            target: object.constructor,
            propertyName,
            options: {
                message: `runs must be [dir, speed, buttons, count] tuples of at most ${MAX_RUN_TICKS} ticks in all`,
                ...options,
            },
            validator: {
                validate(value: unknown) {
                    if (!Array.isArray(value)) {
                        return false;
                    }
                    let total = 0;
                    for (const run of value) {
                        if (!isBadcatInputRun(run)) {
                            return false;
                        }
                        total += run[3];
                        if (total > MAX_RUN_TICKS) {
                            return false;
                        }
                    }
                    return true;
                },
            },
        });
}

/**
 * The ranked-run log posted with a `BAD_CAT` save (`LiveGameDto.badcat`, GDD 10 Phase 2). Mirrors `BadcatRunLog` in
 * bad-cat/src/server/index.ts. The server replays `runs` on the day's room with the vendored sim and keeps only its
 * own results; `finalHash` and `score` are accepted so the client can post its record as is, never trusted.
 * `catCode` and `name` are only shown on the board (the game's codec and name filter check them).
 */
export class BadcatRunDto {
    @IsInt()
    @Min(-400)
    @Max(100000)
    dayNo: number;

    @IsInt()
    @Equals(SIM_VERSION, { message: `simVersion must be ${SIM_VERSION}` })
    simVersion: number;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(MAX_RUNS)
    @IsBadcatRuns()
    runs: [number, number, number, number][];

    @IsOptional()
    @IsInt()
    finalHash?: number;

    @IsOptional()
    @IsInt()
    score?: number;

    /** The player's cat as a codec cat code (shown on the board). */
    @IsOptional()
    @IsString()
    @Matches(/^[A-Za-z0-9_-]{8,40}$/)
    catCode?: string;

    /** The cat's name (filtered again on the server). */
    @IsOptional()
    @IsString()
    @MaxLength(24)
    name?: string;
}
