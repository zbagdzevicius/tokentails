import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
    BUNDLE_SHA256,
    BUNDLE_SIM_VERSION,
    canonicalLogKey,
    canonicalRuns,
    checkRoom,
    cleanName,
    dayNoUtc,
    SIM_VERSION,
    verifyRanked,
} from 'src/vendor/badcat-sim';
import { BADCAT_DAY1 } from './badcat.contracts';

/*
 * The vendored Bad Cat sim (bad-cat/tools/vendor-sim.mjs) replays the game's own golden runs
 * (fixtures/badcat-golden.json, written by bad-cat/src/server/server.test.ts) to the same score and state hash, and
 * the files were not edited by hand.
 */

const DIR = join(__dirname, '..', 'vendor', 'badcat-sim');
const sha = (file: string) =>
    createHash('sha256')
        .update(readFileSync(join(DIR, file), 'utf8'))
        .digest('hex');

describe('vendored Bad Cat sim', () => {
    const golden = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'badcat-golden.json'), 'utf8'));

    it('is the bundle the tool wrote (no hand edits)', () => {
        const info = JSON.parse(readFileSync(join(DIR, 'badcat-sim.sha256.json'), 'utf8'));
        expect(sha('badcat-sim.bundle.ts')).toBe(info.bundle);
        expect(sha('index.ts')).toBe(info.facade);
        expect(BUNDLE_SHA256).toBe(info.bundle);
        expect(info.simVersion).toBe(SIM_VERSION);
        expect(BUNDLE_SIM_VERSION).toBe(SIM_VERSION);
    });

    it('replays the golden runs to the client score, stamp and hash', () => {
        expect(golden.simVersion).toBe(SIM_VERSION);
        expect(golden.runs.length).toBeGreaterThanOrEqual(3);
        for (const run of golden.runs) {
            const res = verifyRanked({
                dayNo: run.dayNo,
                simVersion: run.simVersion,
                runs: run.runs,
                finalHash: run.finalHash,
            });
            expect(res.ok).toBe(true);
            if (!res.ok) continue;
            expect({
                day: run.dayNo,
                score: res.score,
                stamp: res.stamp,
                hash: res.finalHash,
                ticks: res.ticks,
            }).toEqual({
                day: run.dayNo,
                score: run.score,
                stamp: run.stamp,
                hash: run.finalHash,
                ticks: run.ticks,
            });
            expect(res.hashMatch).toBe(true);
        }
    });

    it('refuses stale sims, trailing input and idle runs', () => {
        expect(verifyRanked({ dayNo: 1, simVersion: SIM_VERSION - 1, runs: [] })).toMatchObject({
            code: 'BADCAT_SIM_VERSION',
        });
        expect(verifyRanked({ dayNo: 1, simVersion: SIM_VERSION, runs: [] })).toMatchObject({
            code: 'BADCAT_NO_SCORE',
        });
        const run = golden.runs[0];
        const padded = [...run.runs, [1, 2, 0, 60]];
        expect(verifyRanked({ dayNo: run.dayNo, simVersion: SIM_VERSION, runs: padded })).toMatchObject({
            code: 'BADCAT_TRAILING_INPUT',
        });
    });

    it('canonicalises logs the same way as the game', () => {
        expect(
            canonicalRuns([
                [1, 2, 0, 3],
                [1, 2, 0, 2],
                [0, 0, 0, 4],
            ])
        ).toEqual([[1, 2, 0, 5]]);
        expect(canonicalLogKey({ dayNo: 2, simVersion: SIM_VERSION, runs: [[1, 2, 0, 5]] })).toBe(
            `badcat|v${SIM_VERSION}|d2|1.2.0.5`
        );
    });

    it('counts days from the same Day #1 as the contracts', () => {
        expect(dayNoUtc(Date.parse(`${BADCAT_DAY1}T00:00:00Z`))).toBe(1);
        expect(dayNoUtc(Date.parse(`${BADCAT_DAY1}T23:59:59Z`))).toBe(1);
    });

    it('checks player rooms and names with the game rules', () => {
        expect(checkRoom('not a room').ok).toBe(false);
        expect(cleanName('Mochi')).toBe('Mochi');
    });
});
