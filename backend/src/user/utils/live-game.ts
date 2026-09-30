import { BadRequestException } from '@nestjs/common';
import {
    catnipChaosLevelCatnipCaps,
    catnipChaosLevels,
    GamePlatform,
    GameType,
    match3LevelCatnipCaps,
    match3Levels,
    ScoredGameType,
    seasonEventLevelPointCaps,
    seasonEventLevels,
} from 'src/game/game.schema';
import { LiveGameDto } from '../dto/live-game.dto';

/** Per type: the level keys, the per-level point caps, and the user array the best score goes to. */
export const LIVE_GAME_LEVELS: Record<ScoredGameType, { levels: string[]; caps: number[]; field: string }> = {
    [GameType.CATNIP_CHAOS]: { levels: catnipChaosLevels, caps: catnipChaosLevelCatnipCaps, field: 'catnipChaos' },
    [GameType.PIXEL_RESCUE]: { levels: seasonEventLevels, caps: seasonEventLevelPointCaps, field: 'seasonEvent' },
    [GameType.MATCH_3]: { levels: match3Levels, caps: match3LevelCatnipCaps, field: 'match3' },
};

/** The sanitized `Game` row, before the server adds `user` and `cat`. */
export interface ILiveGameRow {
    type: ScoredGameType;
    level: string;
    points: number;
    score?: number;
    time: number;
    platform: GamePlatform;
}

export interface ILiveGame {
    row: ILiveGameRow;
    /** `$max` update for the caller's per-level best-score arrays. */
    best: Record<string, number>;
}

/**
 * Checks a validated `/live` body against the level table and per-level cap of its type, and
 * returns the only fields that are stored. Throws 400 before anything is written.
 */
export const resolveLiveGame = (game: LiveGameDto): ILiveGame => {
    const { levels, caps, field } = LIVE_GAME_LEVELS[game.type];
    const levelIndex = game.level === undefined ? -1 : levels.indexOf(game.level);
    if (levelIndex < 0) {
        throw new BadRequestException(`Invalid level for ${game.type}`);
    }
    if (game.points > caps[levelIndex]) {
        throw new BadRequestException('Artificial request is detected');
    }

    const row: ILiveGameRow = {
        type: game.type,
        level: levels[levelIndex],
        points: game.points,
        time: Math.max(0, game.time ?? 0),
        platform: game.platform ?? GamePlatform.WEB,
    };
    const best: Record<string, number> = { [`${field}.${levelIndex}`]: game.points };
    if (game.type === GameType.MATCH_3) {
        // Paw Match keeps a raw score next to catnip; old clients sent points only.
        row.score = game.score ?? game.points;
        best[`match3Score.${levelIndex}`] = row.score;
    }

    return { row, best };
};
