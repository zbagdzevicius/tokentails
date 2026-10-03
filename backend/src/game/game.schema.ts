import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as uniqueValidator from 'mongoose-unique-validator';
import { CommonSchema } from 'src/common/common.schema';
import {
    CATNIP_CHAOS_LEVEL_CAPS,
    CATNIP_CHAOS_LEVELS,
    CATNIP_CHAOS_TOTAL_CAP,
    MATCH3_LEVEL_CATNIP_CAPS,
    MATCH3_LEVELS,
    MATCH3_TOTAL_CAP,
    SEASON_EVENT_LEVEL_POINT_CAPS,
    SEASON_EVENT_LEVELS,
    TOTAL_CATNIP_CAP,
} from 'src/shared-contracts/caps';
import { GamePlatform, GameType, LIVE_GAME_OUTCOMES, LiveGameOutcome } from 'src/shared-contracts/enums';

// Enums and caps come from the generated copies of shared/ (plan F2). Change them in shared/ and run
// `node scripts/sync-contracts.mjs`; the names below are kept for existing imports.
export { GamePlatform, GameType };
export { MAX_MATCH3_SCORE_PER_LEVEL } from 'src/shared-contracts/caps';

/**
 * The only types `POST /user/catbassadors/live` accepts: the modes that save a score. SHELTER and
 * HOME never save one; PURRQUEST and CATBASSADORS stay in the enum for old `Game` rows only.
 * CATNIP_HEIST is deliberately absent: Heist runs save only through the replay-verified branch
 * (plan G2 layer 2), never through this plain points path.
 */
export const scoredGameTypes = [GameType.CATNIP_CHAOS, GameType.PIXEL_RESCUE, GameType.MATCH_3] as const;
export type ScoredGameType = typeof scoredGameTypes[number];

/**
 * Every `type` the `/live` body may name: the scored types plus CATNIP_HEIST, which the DTO accepts
 * only together with a `replay` and which takes the replay-verified branch (`src/user/heist`).
 */
export const liveGameTypes = [...scoredGameTypes, GameType.CATNIP_HEIST] as const;
export type LiveGameType = typeof liveGameTypes[number];

export const seasonEventLevels = SEASON_EVENT_LEVELS;
export const seasonEventLevelPointCaps = SEASON_EVENT_LEVEL_POINT_CAPS;
export const match3Levels = MATCH3_LEVELS;
export const match3LevelCatnipCaps = MATCH3_LEVEL_CATNIP_CAPS;
export const catnipChaosLevels = CATNIP_CHAOS_LEVELS;
export const catnipChaosLevelCatnipCaps = CATNIP_CHAOS_LEVEL_CAPS;
export const totalCatnipChaosCap = CATNIP_CHAOS_TOTAL_CAP;
export const totalMatch3CatnipCap = MATCH3_TOTAL_CAP;
export const totalCatnipCap = TOTAL_CATNIP_CAP;

@Schema({ timestamps: true })
export class Game extends CommonSchema {
    @Prop({ required: true })
    type: GameType;

    @Prop()
    points?: number;

    @Prop()
    score?: number;

    @Prop()
    time?: number;

    @Prop()
    level?: string;

    @Prop({ type: String, enum: Object.values(GamePlatform) })
    platform?: GamePlatform;

    @Prop({ type: Types.ObjectId, ref: 'User' })
    user?: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Cat' })
    cat?: Types.ObjectId;

    /** How the run ended, when the client reported it (plan F6). Heist rows are always `won`. */
    @Prop({ type: String, enum: LIVE_GAME_OUTCOMES })
    outcome?: LiveGameOutcome;

    /**
     * Heist rows only: sha256 of the run's canonical input log (`canonicalLogKey` of the vendored
     * sim). Globally unique (`replayDigest_unique`), so one winning log saves once, from any account.
     */
    @Prop({ type: String })
    replayDigest?: string;

    /**
     * Heist rows only: the stars bitmask the server replay gave the run (win 1, every coin 2, clean
     * and quick 4). Lets a duplicate resend restore the owner's `heistStars` without replaying.
     */
    @Prop()
    stars?: number;
}

export type GameDocument = Game & Document;

export type IGame = Pick<Game, keyof Game>;

export const GameSchema = SchemaFactory.createForClass(Game);
GameSchema.index({ user: 1 });
GameSchema.index({ cat: 1 });
GameSchema.index({ type: 1, score: 1 });
// Partial on a string digest: every non-Heist row has none, and they must not collide on `null`.
// Also created by migrations/tokentails/2026-10-02-heist-replay-digest.js where autoIndex is off.
export const REPLAY_DIGEST_INDEX = {
    key: { replayDigest: 1 },
    options: {
        name: 'replayDigest_unique',
        unique: true,
        partialFilterExpression: { replayDigest: { $type: 'string' } },
    },
} as const;
GameSchema.plugin(uniqueValidator);
// Declared AFTER the unique-validator plugin on purpose: the plugin turns every unique index it sees
// into a pre-save count, and for a partial index it merges `partialFilterExpression` into the
// lookup, so `{replayDigest: <digest>}` becomes `{replayDigest: {$type: 'string'}}` and any second
// Heist save would fail as "not unique". The index itself does the job (E11000 -> 409, heist-live.ts).
// A copy of the options: Mongoose adds `background: true` to the object it is given.
GameSchema.index({ ...REPLAY_DIGEST_INDEX.key }, { ...REPLAY_DIGEST_INDEX.options });
