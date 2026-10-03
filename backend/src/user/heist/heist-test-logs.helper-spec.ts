import { readFileSync } from 'fs';
import { join } from 'path';
import { HEIST_LEVELS } from 'src/shared-contracts/caps';

/** The Heist's golden winning logs (catnip-heist/src/levels/<id>.solution.json), one per level. */
export const HEIST_SOURCE_DIR = join(__dirname, '..', '..', '..', '..', 'catnip-heist');

export interface IGoldenLog {
    levelId: string;
    simVersion: number;
    seed: number;
    catIds: [string, string];
    ticks: number;
    runs: [number, number, number, number][];
    finalHash: number;
    score: number;
    spottedCount: number;
    coins: number;
}

const cache = new Map<string, IGoldenLog>();

/** A fresh copy of the golden log of `levelId` (safe to mutate). */
export function goldenLog(levelId: string = HEIST_LEVELS[0]): IGoldenLog {
    if (!cache.has(levelId)) {
        const path = join(HEIST_SOURCE_DIR, 'src', 'levels', `${levelId}.solution.json`);
        cache.set(levelId, JSON.parse(readFileSync(path, 'utf8')));
    }
    return JSON.parse(JSON.stringify(cache.get(levelId)));
}

/** The log with `runs` replaced and `ticks` recomputed, so only the inputs differ. */
export const withRuns = (log: IGoldenLog, runs: [number, number, number, number][]): IGoldenLog => ({
    ...log,
    runs,
    ticks: runs.reduce((total, run) => total + run[3], 0),
});
