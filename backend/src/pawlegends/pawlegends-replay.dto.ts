import { Equals, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import {
    PAWLEGENDS_LEVELS,
    PAWLEGENDS_MAX_INPUT_CHARS_ANY_MAP,
    PAWLEGENDS_MAX_TICKS_ANY_MAP,
} from 'src/shared-contracts/caps';

/**
 * The mutators a replay may carry (sim v10: only 'none'; GAPS §8 item 1). Sim v22 (WR-BS-PLAN.md §4): 'blitz', the
 * ~3-minute Crossing match; a record of an earlier sim version with any mutator but 'none' is refused
 * (PAWLEGENDS_MUTATOR_PLAY_SINCE in pawlegends-live.ts).
 */
export const PAWLEGENDS_MUTATORS = ['none', 'blitz'] as const;
export type PawlegendsMutatorId = typeof PAWLEGENDS_MUTATORS[number];

/**
 * The Pawlegends replay posted with a `PAWLEGENDS` save in the `pawlegends` field (POC.md §11.3): the
 * `ReplayRecord` of `pawlegends/src/sim/api.ts` as the game recorded it (sim v10 to v15).
 *
 * Shape and work bounds only (ticks and inputs within the longest map's limits, `PAWLEGENDS_LIMITS_BY_MAP`; sim v19:
 * Hearthwood Divide plays to 16:00), checked before anything is queued. The vendored sim checks the record's own map. The sim version is compared in `pawlegends-live.ts` (so the 400 can name the
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
    @Max(PAWLEGENDS_MAX_TICKS_ANY_MAP)
    ticks: number;

    @IsString()
    @MaxLength(PAWLEGENDS_MAX_INPUT_CHARS_ANY_MAP)
    @Matches(/^[A-Za-z0-9+/]*={0,2}$/)
    inputs: string;

    @IsIn(['won', 'lost'])
    outcome: 'won' | 'lost';

    @IsString()
    @Matches(/^[0-9a-f]{8}$/)
    finalHash: string;

    /** Sim v10 (GAPS B0): the match mutator; v9 records have no field. Sim v22: or 'blitz'. */
    @IsOptional()
    @IsIn(PAWLEGENDS_MUTATORS)
    mutator?: PawlegendsMutatorId;
}

/**
 * Party play (docs/plans/moba/MULTIPLAYER.md §6, D7): the result a party member posts in `pawlegends` with `v: 2`.
 * It names the room and the member's slot; the backend checks it against the room log the relay stored and the
 * referee's verified verdict (`pawlegends-party-live.ts`), so a client can never forge a party result. Under 300 B.
 */
export class PawlegendsPartyResultDto {
    @Equals(2)
    v: 2;

    @IsString()
    @Matches(/^[a-z0-9]{1,16}$/)
    room: string;

    /** 0-2 team 0, 3-5 team 1 (PvP); 0-4 and 5-9 on Hearthwood (5v5). Checked against the room's occupants. */
    @IsInt()
    @Min(0)
    @Max(9)
    slot: number;

    @IsInt()
    @Min(1)
    @Max(1_000_000)
    simVersion: number;

    @IsInt()
    @Min(1)
    @Max(PAWLEGENDS_MAX_TICKS_ANY_MAP)
    ticks: number;

    @IsIn(['won', 'lost'])
    outcome: 'won' | 'lost';

    @IsString()
    @Matches(/^[0-9a-f]{8}$/)
    finalHash: string;
}
