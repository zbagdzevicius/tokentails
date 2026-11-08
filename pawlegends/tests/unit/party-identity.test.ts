/**
 * Party play N0 (docs/plans/moba/MULTIPLAYER.md §1.5): the party hooks leave single-player output byte-identical.
 * Every vendored live fixture, the 20 determinism fuzz seeds and player-bot matches (including the `pinger`, which
 * drives applyPing and the bots' orders) give the same final hash and hash trail as the golden JSON produced on
 * 262c36a0 (the five dogs on the released sim v12, no party code; its v13 fixtures). Party play rode sim v13 (v12 with
 * party code, now frozen); the dogs ship as sim v14, and with no party v14 plays exactly like that dogs-only sim.
 * Sim v15 (three more dogs, DOGS-V15.md) adds no party code: the golden was regenerated from the v15 sim itself (its
 * own vendored fixtures), since the v14 identity above already proved the party hooks change nothing single-player.
 * Sim v16: the S-PvP commit kept this v15 golden byte for byte (tests/unit/pvp-identity.test.ts, now retired); each
 * MAP-GAPS B commit changes single-player play and regenerates it from that commit's sim and its live v16 fixtures
 * (run `npm run vendor-sim` first, then write the golden).
 * The v16 release-gate fix (every hero steps against start-of-tick positions, plus the B3 hero retune) changes every
 * match too and regenerated it the same way.
 * Part of the merge checklist.
 *
 * Regenerate ONLY on a commit without party code (a worktree at that sim, with this file copied in and VENDOR pointed
 * at its live fixtures): `PARTY_GOLDEN_WRITE=1 npx vitest run tests/unit/party-identity.test.ts`. A new sim version
 * that changes single-player play regenerates it from that version's sim BEFORE party code is merged in.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMatch, createPlayerBot, fillPicks, hashTrail, playerBotCommands, result, step, type PlayerProfile } from '../../src/sim/index';
import type { HeroId, ReplayRecord, TrickId, Difficulty } from '../../src/sim/api';
import { runReplay } from '../../src/sim/replay';
import { foldTrail, fuzzFinal, fuzzSeed } from '../../tools/lib/fuzz-entry';

const GOLDEN = join(__dirname, 'golden', 'party-identity.json');
const VENDOR = join(__dirname, '..', '..', '..', 'backend', 'src', 'vendor', 'pawlegends-sim', 'v16');
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
  it('single-player output equals the golden (262c36a0 dogs-only sim at v14; regenerated at v15 and per v16 B item)', () => {
    const got = rows();
    if (process.env.PARTY_GOLDEN_WRITE === '1') {
      writeFileSync(GOLDEN, JSON.stringify({ base: process.env.PARTY_GOLDEN_BASE ?? 'v17', simVersion: 17, rows: got }, null, 2) + '\n');
      return;
    }
    expect(existsSync(GOLDEN)).toBe(true);
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as { rows: Row[] };
    expect(got).toEqual(golden.rows);
  });
});
