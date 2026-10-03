import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
    HEIST_LEVEL_CAPS,
    HEIST_LEVELS,
    HEIST_MAX_TICKS,
    HEIST_STAR_MASK,
    HEIST_TICK_HZ,
} from 'src/shared-contracts/caps';
import {
    CAMPAIGN_SEED,
    canonicalLogKey,
    CAT_IDS,
    LEVELS,
    MAX_REPLAY_TICKS,
    SIM_VERSION,
    STAR_ALL,
    TICK_HZ,
    verifyRun,
} from 'src/vendor/heist-sim';
import { goldenLog, HEIST_SOURCE_DIR, withRuns } from './heist-test-logs.helper-spec';

/*
 * The vendored Heist sim (backend/src/vendor/heist-sim, written by catnip-heist/scripts/vendor-sim.mjs).
 * `vendor-sim:check` in catnip-heist compares it with a fresh build; this spec checks the backend
 * side: the files match their recorded hashes (no hand edits), the derived tables match shared/caps.ts,
 * and the golden runs verify through the vendored code.
 */

const VENDOR_DIR = join(__dirname, '..', '..', 'vendor', 'heist-sim');
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

describe('vendored Heist sim', () => {
    const meta = JSON.parse(readFileSync(join(VENDOR_DIR, 'heist-sim.sha256.json'), 'utf8'));

    it('matches the hashes vendor-sim recorded (re-run `npm run vendor-sim` in catnip-heist/ after a sim change)', () => {
        for (const [file, hash] of Object.entries<string>(meta.files)) {
            expect({ file, hash: sha256(readFileSync(join(VENDOR_DIR, file), 'utf8')) }).toEqual({ file, hash });
        }
        expect(meta.simVersion).toBe(SIM_VERSION);
    });

    it('derives the shared caps: level ids, score caps and tick bounds (plan G2: 250, 240, 220, 270, 240, 240, 240, 310)', () => {
        expect(LEVELS.map(level => level.id)).toEqual(HEIST_LEVELS);
        expect(LEVELS.map(level => level.maxScore)).toEqual(HEIST_LEVEL_CAPS);
        expect(meta.levelCaps).toEqual(HEIST_LEVEL_CAPS);
        expect(MAX_REPLAY_TICKS).toBe(HEIST_MAX_TICKS);
        expect(TICK_HZ).toBe(HEIST_TICK_HZ);
        expect(STAR_ALL).toBe(HEIST_STAR_MASK);
        expect(CAMPAIGN_SEED).toBe(1);
        LEVELS.forEach(level => expect(level.tickCap).toBe(Math.min(4 * level.parTicks, 18000)));
    });

    const manifestPath = join(HEIST_SOURCE_DIR, 'public', 'assets', 'manifest.json');
    (existsSync(manifestPath) ? it : it.skip)('knows exactly the cats the Heist crew picker offers', () => {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        expect(CAT_IDS).toEqual(manifest.cats.map((cat: { id: string }) => cat.id));
    });

    it.each(HEIST_LEVELS.map(id => [id]))('verifies the golden run of %s with its recorded score and hash', levelId => {
        const log = goldenLog(levelId);
        expect(verifyRun(log)).toMatchObject({
            ok: true,
            levelId,
            score: log.score,
            finalHash: log.finalHash,
            coins: log.coins,
            ticks: log.ticks,
        });
    });

    it('refuses trailing input, a short run and the tick cap with their codes', () => {
        const log = goldenLog('heist-07');
        expect(verifyRun(withRuns(log, [...log.runs, [1, 0, 0, 2]]))).toMatchObject({ code: 'HEIST_TRAILING_INPUT' });
        expect(verifyRun(withRuns(log, log.runs.slice(0, -2)))).toMatchObject({ code: 'HEIST_NOT_WON' });
        const cap = LEVELS[6].tickCap;
        expect(verifyRun({ ...log, runs: [[0, 0, 0, cap + 1]], ticks: cap + 1 })).toMatchObject({
            code: 'HEIST_REPLAY_INVALID',
        });
    });

    it('keys the digest on the inputs, never on the crew', () => {
        const log = goldenLog('heist-01');
        expect(canonicalLogKey({ ...log, catIds: ['coco', 'fox'] } as any)).toBe(canonicalLogKey(log));
        expect(canonicalLogKey({ ...log, seed: 7 })).not.toBe(canonicalLogKey(log));
    });

    // The benchmark runs in a child Node process (Jest's sandbox slows the sim about 10x). Timing is
    // only asserted with HEIST_BENCH=1: under a parallel Jest run every worker competes for the CPU
    // and a p95 says nothing. Recorded result: docs/plans/alignment-log/3b.md (p95 about 9 ms).
    it('runs the replay benchmark on all 8 golden solutions (p95 under 50 ms with HEIST_BENCH=1)', () => {
        const output = execFileSync(
            process.execPath,
            [
                '-r',
                'ts-node/register/transpile-only',
                '-r',
                'tsconfig-paths/register',
                join(__dirname, 'replay-bench.helper-spec.ts'),
            ],
            {
                cwd: join(__dirname, '..', '..', '..'),
                env: { ...process.env, HEIST_BENCH_ROUNDS: process.env.HEIST_BENCH ? '30' : '2' },
                encoding: 'utf8',
            }
        );
        const bench = JSON.parse(output.trim().split('\n').pop() as string);
        expect(Object.keys(bench.levels)).toEqual(HEIST_LEVELS);
        expect(bench.worstCaseIdle.code).toBe('HEIST_NOT_WON');
        if (process.env.HEIST_BENCH) {
            expect(bench.p95).toBeLessThan(50);
        }
    }, 120000);
});
