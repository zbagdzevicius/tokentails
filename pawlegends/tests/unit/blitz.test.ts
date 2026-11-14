/**
 * Sim v22 (docs/plans/moba/WR-BS-PLAN.md §4): Blitz, the ~3-minute Crossing match (`mutator: 'blitz'`). The rule
 * table (level 4 start with the level-3 talent offered, ×0.45 towers and ×0.5 cores, Sunset 1:30, Sudden Death 2:30,
 * the cannon at 0:20, the 6 s → 8 s respawn), the 3:15 time up (EndReason 4) and its tie-break order (structures,
 * core HP share, takedowns, structure damage, else a draw), determinism and replays, the version and map checks of
 * the record, the client's mode tiles and links, and the per-minute Treat XP.
 */
import { describe, expect, it } from 'vitest';
import { MUTATOR_RULES } from '../../src/data/mutators';
import { CROSSING_CANNON } from '../../src/data/fun';
import { createMatch, fillPicks, hash, replayRecord, result, snapshot, step, tickOf, type MatchHandle } from '../../src/sim/index';
import { checkWin, endMatch, timeUpWinner } from '../../src/sim/match';
import { endTickOf, mutatorProblem, mutatorRespawn } from '../../src/sim/mutator';
import { verifyReplay, checkReplayShape } from '../../src/sim/server';
import { checkPartyShape, checkPvpShape, partyReplayRecord, verifyPartyReplay } from '../../src/sim/party';
import { G, RANGE } from '../../src/sim/world';
import { applyBp } from '../../src/sim/fixed';
import { MUTATORS, MUTATOR_PLAY_SINCE, type MatchConfig, type Mutator } from '../../src/sim/api';
import { SIM_VERSION } from '../../src/sim/version';
import { MODE_LABEL, MODE_MUTATOR, matchModeHtml, modeFromUrl, parseMatchMode } from '../../src/ui/lobby/matchMode';
import { TREAT_XP, perMinuteShare, treatXpFor } from '../../src/meta/treats';
import { endCause } from '../../src/app/endCause';
import { HostCore } from '../../src/host/host-core';

const config = (seed: number, mutator?: Mutator, extra: Partial<MatchConfig> = {}): MatchConfig => {
  const { picks, tricks } = fillPicks(seed, 'clem', 'pounce');
  return { seed, picks, tricks, difficulty: 'normal', ...(mutator ? { mutator } : {}), ...extra };
};

function runToEnd(m: MatchHandle): void {
  while (!result(m)) step(m);
}

describe('Blitz rule table', () => {
  it('is Crossing only, sim v22, and its none row is neutral', () => {
    // sim v27 appended Cannon Chaos, the Practice ground and the weekly twists after these two
    expect(MUTATORS.slice(0, 2)).toEqual(['none', 'blitz']);
    expect(MUTATOR_PLAY_SINCE).toBe(22);
    expect(SIM_VERSION).toBeGreaterThanOrEqual(22);
    const none = MUTATOR_RULES.none;
    expect([none.startLevel, none.xpBp, none.towerHpBp, none.coreHpBp, none.heroVsHeroBp, none.takedownCoreBp]).toEqual([1, 10000, 10000, 10000, 10000, 10000]);
    expect([none.respawnFrom, none.sunset, none.suddenDeath, none.hardEnd, none.underdogTakedowns]).toEqual([0, 0, 0, 0, 0]);
    expect([none.fortifyUntil, none.catchUpFrom, none.truceUntil]).toEqual([-1, -1, -1]);
    expect(none.cannon).toBeNull();
    expect(none.decayLead).toBe(true);
    const b = MUTATOR_RULES.blitz;
    expect(b.maps).toEqual(['crossing']);
    expect([b.startLevel, b.xpBp, b.towerHpBp, b.coreHpBp]).toEqual([4, 20000, 4500, 5000]);
    expect([b.respawnFrom, b.respawnTo]).toEqual([180, 240]);
    expect([b.sunset, b.suddenDeath, b.hardEnd]).toEqual([2700, 4500, 5850]);
    expect(b.cannon).toMatchObject({ first: 600, respawn: 1200, spots: CROSSING_CANNON.spots });
  });

  it("a 'none' match hashes exactly like a match without the field", () => {
    const a = createMatch(config(41));
    const b = createMatch(config(41, 'none'));
    for (let i = 0; i < 900; i++) {
      step(a);
      step(b);
    }
    expect(hash(b)).toBe(hash(a));
  });

  it('halves the core, takes the towers to 45% and moves Sunset and Sudden Death', () => {
    const plain = createMatch(config(5));
    const blitz = createMatch(config(5, 'blitz'));
    for (let id = RANGE.towers; id < RANGE.cores; id++) {
      if (plain.world.maxHp[id] === 0) continue;
      expect(blitz.world.maxHp[id]).toBe(applyBp(plain.world.maxHp[id], 4500));
    }
    expect(blitz.world.maxHp[RANGE.cores]).toBe(applyBp(plain.world.maxHp[RANGE.cores], 5000));
    expect(blitz.world.globals[G.Sunset]).toBe(2700);
    expect(blitz.world.globals[G.SuddenDeath]).toBe(4500);
    expect(endTickOf(blitz.world)).toBe(5850);
    expect(endTickOf(plain.world)).toBe(19800);
  });

  it('starts every hero at level 4 on tick 0 and offers the human its level-3 talent', () => {
    const m = createMatch(config(9, 'blitz'));
    step(m);
    for (let s = 0; s < 6; s++) expect(m.world.level[s]).toBe(4);
    const offers = m.events.filter((e) => e.type === 'talentOffer');
    expect(offers.some((e) => e.type === 'talentOffer' && e.slot === 0 && e.tier === 0)).toBe(true);
    // bots picked theirs at once
    for (let s = 1; s < 6; s++) expect(m.world.talents[s * 3]).toBeGreaterThanOrEqual(0);
    expect(m.world.talents[0]).toBe(-1);
  });

  it('the cannon warns at 0:10 and lands at 0:20', () => {
    const m = createMatch(config(12, 'blitz'));
    let soon = -1;
    let spawn = -1;
    while (tickOf(m) < 700) {
      step(m);
      for (const e of m.events) {
        if (e.type === 'cannonSoon') soon = e.tick;
        if (e.type === 'cannonSpawn') spawn = e.tick;
      }
    }
    expect(soon).toBe(300);
    expect(spawn).toBe(600);
  });

  it('respawn rises from 6 s to 8 s over the match', () => {
    const m = createMatch(config(3, 'blitz'));
    expect(mutatorRespawn(m.world, 0)).toBe(180);
    expect(mutatorRespawn(m.world, 2925)).toBe(210);
    expect(mutatorRespawn(m.world, 5850)).toBe(240);
    expect(mutatorRespawn(createMatch(config(3)).world, 100)).toBe(-1);
  });

  it('the clock counts down to 3:15 in Sudden Death', () => {
    const m = createMatch(config(4, 'blitz'));
    m.world.globals[G.Tick] = 5000;
    expect(snapshot(m, 0).clock).toMatchObject({ phase: 'suddenDeath', nextPhaseIn: 850 });
  });

  it('refuses another map and PvP', () => {
    expect(() => createMatch({ ...config(1, 'blitz'), ...fillPicks(1, 'clem', 'pounce', 'hearthwood'), map: 'hearthwood' })).toThrow(/not played on hearthwood/);
    expect(() => createMatch(config(1, 'nope' as Mutator))).toThrow(/unknown mutator/);
  });
});

describe('Blitz time up (EndReason 4) and its tie-break', () => {
  /** A Blitz match at its hard end with the given score; returns the result. */
  function timeUp(set: (m: MatchHandle) => void) {
    const m = createMatch(config(21, 'blitz'));
    step(m);
    const w = m.world;
    w.globals[G.Kills0] = 0;
    w.globals[G.Kills1] = 0;
    w.globals[G.Towers0] = 0;
    w.globals[G.Towers1] = 0;
    w.globals[G.TowerDamage0] = 0;
    w.globals[G.TowerDamage1] = 0;
    w.hp[RANGE.cores] = w.maxHp[RANGE.cores];
    w.hp[RANGE.cores + 1] = w.maxHp[RANGE.cores + 1];
    set(m);
    w.globals[G.Tick] = 5850;
    checkWin(m);
    return { m, r: result(m) };
  }

  it('more enemy towers destroyed wins first', () => {
    const { m, r } = timeUp((m) => {
      m.world.globals[G.Towers1] = 1;
      m.world.hp[RANGE.cores + 1] = 10;
      m.world.globals[G.Kills0] = 9;
    });
    expect(r).toMatchObject({ reason: 'timeUp', winner: 1, outcome: 'lost' });
    expect(m.world.globals[G.EndReason]).toBe(4);
    expect(r?.draw).toBeUndefined();
  });

  it('then the higher core HP share', () => {
    const { r } = timeUp((m) => {
      m.world.hp[RANGE.cores + 1] -= 1;
      m.world.globals[G.Kills1] = 9;
    });
    expect(r).toMatchObject({ reason: 'timeUp', winner: 0, outcome: 'won' });
  });

  it('then takedowns, then structure damage', () => {
    expect(timeUp((m) => (m.world.globals[G.Kills1] = 2)).r).toMatchObject({ winner: 1 });
    expect(timeUp((m) => (m.world.globals[G.TowerDamage0] = 5)).r).toMatchObject({ winner: 0 });
  });

  it('all even is a draw: winner −1, a loss for both, no coin', () => {
    const { m, r } = timeUp(() => undefined);
    expect(r).toMatchObject({ reason: 'timeUp', winner: -1, outcome: 'lost', draw: true });
    expect(m.world.globals[G.Winner]).toBe(-1);
    expect(timeUpWinner(m.world)).toBe(-1);
  });

  it('a plain match never ends on time up (its safety end stays 11:00)', () => {
    const m = createMatch(config(21));
    m.world.globals[G.Tick] = 5850;
    checkWin(m);
    expect(result(m)).toBeNull();
    endMatch(m, 0, 'safetyEnd');
    expect(m.world.globals[G.EndReason]).toBe(2);
  });
});

describe('Blitz determinism and replays', () => {
  it('the same seed plays the same match, ends by 3:15, and its replay verifies', () => {
    const a = createMatch(config(77, 'blitz'));
    const b = createMatch(config(77, 'blitz'));
    runToEnd(a);
    runToEnd(b);
    const ra = result(a)!;
    expect(ra.finalHash).toBe(result(b)!.finalHash);
    expect(ra.ticks).toBeLessThanOrEqual(5850);
    expect(['core', 'timeUp']).toContain(ra.reason);
    const rec = replayRecord(a)!;
    expect(rec.mutator).toBe('blitz');
    expect(rec.map).toBeUndefined();
    const v = verifyReplay(rec);
    expect(v).toMatchObject({ ok: true, outcome: ra.outcome, ticks: ra.ticks, finalHash: ra.finalHash });
    // the same inputs as a plain match do not verify (the mutator is part of what was played)
    expect(verifyReplay({ ...rec, mutator: 'none' }).ok).toBe(false);
  }, 60_000);

  it('a Blitz party record verifies; a PvP record may not carry it', () => {
    const humans = [0, 1];
    const { picks, tricks } = fillPicks(88, 'clem', 'pounce');
    const m = createMatch({ seed: 88, picks, tricks, difficulty: 'normal', humans, mutator: 'blitz' });
    runToEnd(m);
    const rec = partyReplayRecord(m);
    if (rec) {
      expect(rec.mutator).toBe('blitz');
      expect(verifyPartyReplay(rec).ok).toBe(true);
    }
    expect(mutatorProblem('blitz', undefined, true)).toMatch(/pvp/);
    expect(checkPvpShape({ v: 3, mode: 'pvp', mutator: 'blitz' })).not.toBeNull();
    expect(checkPartyShape({ v: 2, mutator: 'blitz', map: 'hearthwood' })).not.toBeNull();
  }, 60_000);

  it('the record shape: blitz only on Crossing, unknown mutators refused', () => {
    const base = { v: 1, simVersion: SIM_VERSION, seed: 1, difficulty: 'normal', hero: 'clem', trick: 'pounce', ticks: 30, inputs: '', outcome: 'won', finalHash: '0000abcd' };
    expect(checkReplayShape({ ...base, mutator: 'blitz' })).toBeNull();
    expect(checkReplayShape({ ...base, mutator: 'blitz', map: 'hearthwood' })).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    expect(checkReplayShape({ ...base, mutator: 'chaos' })).toMatchObject({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' });
    expect(mutatorProblem(undefined, undefined, false)).toBeNull();
    expect(mutatorProblem('none', 'hearthwood', true)).toBeNull();
  });

  it('the local host plays a Blitz join and tells the client', () => {
    const w = new HostCore().join({ t: 'join', slot: 0, hero: 'sage', trick: 'hiss', difficulty: 'normal', seed: 11, mutator: 'blitz' });
    expect(w.mutator).toBe('blitz');
    // Blitz is Crossing only: a Classic join plays Classic
    expect(new HostCore().join({ t: 'join', slot: 0, hero: 'sage', trick: 'hiss', difficulty: 'normal', seed: 11, map: 'hearthwood', mutator: 'blitz' }).mutator).toBeUndefined();
  });
});

describe('PLAY screen modes (WR-BS-PLAN.md §5)', () => {
  it('three tiles with minutes, never "Quick"', () => {
    const html = matchModeHtml('blitz');
    for (const v of ['blitz', 'skirmish', 'classic']) expect(html).toContain(`data-v="${v}"`);
    expect(html).toContain('~3 min');
    expect(html).toContain('~7 min');
    expect(html).toContain('~13 min');
    expect(html).not.toMatch(/Quick/);
    expect(MODE_LABEL.skirmish).toBe('3v3 Skirmish · ~7 min');
    expect(MODE_MUTATOR.blitz).toBe('blitz');
  });

  it("reads the old stored 'quick' as Skirmish", () => {
    expect(parseMatchMode('quick')).toBe('skirmish');
    expect(parseMatchMode('blitz')).toBe('blitz');
    expect(parseMatchMode('zoomies')).toBeNull();
  });

  it('?mode= deep links; an unknown mode falls back to Skirmish and says so', () => {
    expect(modeFromUrl('?mode=blitz&from=tt-picker')).toEqual({ mode: 'blitz', known: true, asked: 'blitz' });
    expect(modeFromUrl('?mode=Classic')).toMatchObject({ mode: 'classic', known: true });
    expect(modeFromUrl('?mode=zoomies')).toEqual({ mode: 'skirmish', known: false, asked: 'zoomies' });
    expect(modeFromUrl('?dare=1')).toBeNull();
  });
});

describe('Blitz rewards and results copy', () => {
  it('pays Treat XP per minute like Skirmish; a draw is the loss plus half the win bonus', () => {
    expect(perMinuteShare(undefined)).toBe(1);
    expect(perMinuteShare(TREAT_XP.refTicks * 2)).toBe(1);
    const full = treatXpFor({ won: true, takedowns: 4, pudding: false });
    expect(treatXpFor({ won: true, takedowns: 4, pudding: false, ticks: 5400 })).toBe(Math.round(full * 0.4));
    expect(treatXpFor({ won: false, draw: true, takedowns: 0, pudding: false })).toBe(80);
  });

  it('names the time-up reason', () => {
    const base = { phase: 'suddenDeath', top: null, kills: [3, 3] as const, oursForward: 0, oursAlive: 3 };
    expect(endCause({ ...base, won: true, reason: 'timeUp', towers: [2, 1] })).toBe('Time! We took more towers (2 to 1).');
    expect(endCause({ ...base, won: false, reason: 'timeUp', towers: [0, 0] })).toBe('Time! Towers even, their core was healthier.');
    expect(endCause({ ...base, won: false, reason: 'timeUp', draw: true, towers: [0, 0] })).toMatch(/draw/);
  });
});
