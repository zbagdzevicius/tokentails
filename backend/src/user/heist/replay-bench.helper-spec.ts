/*
 * Heist replay benchmark (plan G2 layer 2: worker_threads only if p95 > 50 ms). Plain Node, outside
 * Jest (Jest's module sandbox makes the sim about 10x slower, which says nothing about production):
 *
 *   node -r ts-node/register/transpile-only -r tsconfig-paths/register src/user/heist/replay-bench.helper-spec.ts
 *
 * Prints one JSON line: per-level median and p95 over the golden solutions, the overall p95, and the
 * worst case (an idle log at the 18,000-tick cap of heist-08). heist-sim.spec.ts runs it.
 */
import { HEIST_LEVELS } from 'src/shared-contracts/caps';
import { verifyRun } from 'src/vendor/heist-sim';
import { goldenLog } from './heist-test-logs.helper-spec';

const ROUNDS = Number(process.env.HEIST_BENCH_ROUNDS || 30);
const ms = (started: bigint) => Number(process.hrtime.bigint() - started) / 1e6;
const at = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];

const all: number[] = [];
const levels: Record<string, { ticks: number; median: number; p95: number }> = {};
for (const levelId of HEIST_LEVELS) {
    const log = goldenLog(levelId);
    for (let i = 0; i < 3; i++) verifyRun(log);
    const samples: number[] = [];
    for (let i = 0; i < ROUNDS; i++) {
        const started = process.hrtime.bigint();
        if (!verifyRun(log).ok) throw new Error(`${levelId} golden run did not verify`);
        samples.push(ms(started));
    }
    samples.sort((a, b) => a - b);
    all.push(...samples);
    levels[levelId] = { ticks: log.ticks, median: +at(samples, 0.5).toFixed(2), p95: +at(samples, 0.95).toFixed(2) };
}
all.sort((a, b) => a - b);
const idle = { ...goldenLog('heist-08'), runs: [[0, 0, 0, 18000]], ticks: 18000 };
const idleStarted = process.hrtime.bigint();
const idleResult = verifyRun(idle);
const worstCaseIdleMs = +ms(idleStarted).toFixed(1);

console.log(
    JSON.stringify({
        node: process.version,
        rounds: ROUNDS,
        p50: +at(all, 0.5).toFixed(2),
        p95: +at(all, 0.95).toFixed(2),
        p99: +at(all, 0.99).toFixed(2),
        worstCaseIdle: { ms: worstCaseIdleMs, code: idleResult.ok ? 'ok' : idleResult.code },
        levels,
    })
);
