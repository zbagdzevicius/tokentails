/**
 * Party play N0 (docs/plans/moba/MULTIPLAYER.md §1.5): the party hooks leave single-player output byte-identical.
 * Every vendored v11 fixture, the 20 determinism fuzz seeds and player-bot matches (including the `pinger`, which
 * drives applyPing and the bots' orders) give the same final hash and hash trail as the golden JSON produced on
 * a923f0ac (the base before any party code). Part of the merge checklist.
 *
 * Regenerate ONLY on a commit without party code: `PARTY_GOLDEN_WRITE=1 npx vitest run tests/unit/party-identity.test.ts`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMatch, createPlayerBot, fillPicks, hashTrail, playerBotCommands, result, step, type PlayerProfile } from '../../src/sim/index';
import type { HeroId, ReplayRecord, TrickId, Difficulty } from '../../src/sim/api';
import { runReplay } from '../../src/sim/replay';
import { foldTrail, fuzzFinal, fuzzSeed } from '../../tools/lib/fuzz-entry';

const GOLDEN = join(__dirname, 'golden', 'party-identity.json');
const VENDOR = join(__dirname, '..', '..', '..', 'backend', 'src', 'vendor', 'pawlegends-sim', 'v11');
const FIXTURES = ['rookie-replay.fixture.json', 'champion-replay.fixture.json', 'forfeit-replay.fixture.json'];

interface Row {
  key: string;
  finalHash: string;
  trail: string;
  ticks: number;
}

const BOT_RUNS: readonly { seed: number; hero: HeroId; trick: TrickId; difficulty: Difficulty; profile: PlayerProfile }[] = [
  { seed: 11, hero: 'clem', trick: 'pounce', difficulty: 'normal', profile: 'pinger' },
  { seed: 12, hero: 'brutus', trick: 'snack', difficulty: 'hard', profile: 'pinger' },
  { seed: 13, hero: 'gabe', trick: 'hiss', difficulty: 'easy', profile: 'normal' },
  { seed: 14, hero: 'pixel', trick: 'purrify', difficulty: 'rookie', profile: 'novice' },
  { seed: 15, hero: 'duchess', trick: 'pounce', difficulty: 'hard', profile: 'easy' },
];

function rows(): Row[] {
  const out: Row[] = [];
  for (const f of FIXTURES) {
    const rec = JSON.parse(readFileSync(join(VENDOR, f), 'utf8')) as ReplayRecord;
    const run = runReplay(rec);
    out.push({ key: `fixture:${f}`, finalHash: run.result!.finalHash, trail: foldTrail(run.trail), ticks: run.ticks });
  }
  for (let i = 0; i < 20; i++) {
    const r = fuzzFinal(fuzzSeed(i));
    out.push({ key: `fuzz:${i}`, finalHash: r.finalHash, trail: r.trail, ticks: r.ticks });
  }
  for (const b of BOT_RUNS) {
    const { picks, tricks } = fillPicks(b.seed, b.hero, b.trick);
    const m = createMatch({ seed: b.seed, picks, tricks, difficulty: b.difficulty });
    const bot = createPlayerBot(m, b.profile);
    while (!result(m)) step(m, playerBotCommands(m, bot));
    out.push({ key: `bot:${b.profile}:${b.seed}`, finalHash: result(m)!.finalHash, trail: foldTrail(hashTrail(m)), ticks: result(m)!.ticks });
  }
  return out;
}

describe('party-identity (MULTIPLAYER.md §1.5, merge checklist)', { timeout: 600_000 }, () => {
  it('single-player output equals the a923f0ac golden', () => {
    const got = rows();
    if (process.env.PARTY_GOLDEN_WRITE === '1') {
      writeFileSync(GOLDEN, JSON.stringify({ base: 'a923f0ac', simVersion: 11, rows: got }, null, 2) + '\n');
      return;
    }
    expect(existsSync(GOLDEN)).toBe(true);
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as { rows: Row[] };
    expect(got).toEqual(golden.rows);
  });
});
