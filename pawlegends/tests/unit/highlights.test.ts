/**
 * HIGHLIGHTS.md §8: the highlight detector on scripted event streams (each rule fires, and a near miss does not),
 * teamfights (open, close, winner, even trade, Hearthwood's 6), merging, window lengths, picking, titles, the probe
 * against the public snapshot, the reel cache, the clip length and the montage plan; determinism on real matches and
 * a golden fixture record.
 */
import { limit } from './cpu-budget';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMatch, fillPicks, replayRecord, result, snapshot, step, tickOf, SIM_VERSION, type Command } from '../../src/sim/index';
import type { Match, ReplayRecord, SimEvent } from '../../src/sim/api';
import { Rng } from '../../src/sim/rng';
import { randomCommand } from './helpers';
import { HighlightDetector, clampWindow, distinctTitle, type DetectorMeta } from '../../src/replay/highlights/detect';
import { kindOf, probe, type HeroSample, type TowerSample, type UnitKind } from '../../src/replay/highlights/probe';
import { DETECTOR_V, RULES, SUB_MAX, TITLE_MAX, highlightAt, highlightSeconds, montageSegments, segmentOf, stepHighlight, type Highlight, type HighlightReel } from '../../src/replay/highlights/rules';
import { ALL_TITLE_TEMPLATES, titleFor, type TitleCtx } from '../../src/replay/highlights/titles';
import { ReplayCore } from '../../src/replay/core';
import { HISTORY_KEY, REPLAYS_KEY, recordMoment, reelOf, reelValid, saveReel, type KVStore } from '../../src/replay/store';
import { clipFileName, clipSeconds, clipShareText } from '../../src/share/clip';
import { HERO_IDS } from '../../src/data/heroes';
import { HERO_TEXT } from '../../src/ui/heroText';
import { bandOf, camPoint } from '../../src/replay/viewer';
import { stripCards } from '../../src/replay/strip';

const NAMES = ['Clem', 'Sage', 'Rex', 'Bravo', 'Chili', 'Howler', 'Nugget', 'Pixel', 'Duchess', 'Stilts'];

// ------------------------------------------------------------------------------------------------- harness

type Kinds = Record<number, UnitKind>;
const kindDefault = (slots: number, kinds: Kinds) => (id: number): UnitKind => {
  if (id >= 0 && id < slots) return 'hero';
  if (kinds[id]) return kinds[id];
  if (id >= 100 && id < 200) return 'minion';
  if (id >= 200 && id < 220) return 'tower';
  if (id === 250) return 'camp';
  if (id === 251) return 'pudding';
  if (id === 252) return 'boss';
  return 'other';
};

interface Harness {
  pos: HeroSample[];
  det: HighlightDetector;
  /** Queue events at tick t. */
  at(t: number, ...evs: SimEvent[]): void;
  /** Change the hero samples at tick t (before that tick's probe). */
  set(t: number, fn: (pos: HeroSample[]) => void): void;
  hit(t: number, src: number, dst: number, amount?: number): void;
  kill(t: number, id: number, killer: number, respawnAt?: number): void;
  run(until: number): void;
  finish(o?: { winner?: 0 | 1 | -1; reason?: string; ticks?: number }): HighlightReel;
}

function harness(o: { teamSize?: 3 | 5; ticks?: number; mutator?: string; towers?: TowerSample[]; emotes?: number[]; seen?: (t: number, h: number) => boolean; kinds?: Kinds; me?: number } = {}): Harness {
  const teamSize = o.teamSize ?? 3;
  const slots = teamSize * 2;
  const ticks = o.ticks ?? 9000;
  // heroes 30 m apart by default: nobody is near anybody
  const pos: HeroSample[] = Array.from({ length: slots }, (_, i) => ({ x: 5_000 + i * 30_000, y: 10_000, hp: 1000, maxHp: 1000, alive: true, napping: false, benched: false }));
  const meta: DetectorMeta = {
    seed: 7,
    key: '7:abc:9000',
    simVersion: 29,
    slots,
    teamSize,
    ticks,
    mutator: o.mutator ?? 'none',
    tricks: Array.from({ length: slots }, () => 'pounce'),
    names: NAMES.slice(0, slots),
    bots: Array.from({ length: slots }, (_, i) => i !== 0),
    vsBots: true,
    me: o.me ?? 0,
    kindOf: kindDefault(slots, o.kinds ?? {}),
    ...(o.emotes ? { emotes: o.emotes } : {}),
  };
  const det = new HighlightDetector(meta);
  const queue = new Map<number, SimEvent[]>();
  const muts = new Map<number, ((p: HeroSample[]) => void)[]>();
  let tick = 0;
  const h: Harness = {
    pos,
    det,
    at: (t, ...evs) => queue.set(t, [...(queue.get(t) ?? []), ...evs]),
    set: (t, fn) => muts.set(t, [...(muts.get(t) ?? []), fn]),
    hit: (t, src, dst, amount = 50) => h.at(t, { type: 'hit', tick: t, src, dst, amount, shielded: 0, kind: 'ability' }),
    kill: (t, id, killer, respawnAt) => {
      h.at(t, { type: 'death', tick: t, id, killer });
      h.set(t, (p) => (p[id].alive = false));
      if (respawnAt !== undefined) h.set(respawnAt, (p) => (p[id].alive = true));
    },
    run: (until) => {
      for (; tick <= until; tick++) {
        for (const fn of muts.get(tick) ?? []) fn(pos);
        const sample = tick % RULES.fightEvery === 0 || tick % 5 === 0;
        det.feed(tick, queue.get(tick) ?? [], sample && tick % 5 === 0 ? { heroes: pos.map((p) => ({ ...p })), towers: o.towers ?? [], ...(o.seen && tick % 30 === 0 ? { seen: pos.map((_, i) => o.seen!(tick, i)) } : {}) } : null);
      }
    },
    finish: (e = {}) => {
      h.run(e.ticks ?? ticks);
      return det.finish({ winner: e.winner ?? 0, reason: e.reason ?? 'forfeit', ticks: e.ticks ?? ticks });
    },
  };
  return h;
}

const types = (r: HighlightReel): string[] => r.list.map((x) => x.type);
const find = (r: HighlightReel, type: string): Highlight | undefined => r.list.find((x) => x.type === type || x.tags.some((t) => t === type || t.startsWith(`${type}:`)));
const near = (h: Harness, ids: number[], x: number, y = 30_000): void => {
  ids.forEach((id, k) => {
    h.pos[id].x = x + (k % 3) * 1500;
    h.pos[id].y = y + Math.floor(k / 3) * 1500;
  });
};

// ------------------------------------------------------------------------------------------------- epic and fights

describe('highlights: fights', () => {
  it('multikill: kills ≤ 240 ticks apart chain; 241 apart are two kills', () => {
    const a = harness();
    a.kill(1000, 3, 0, 1600);
    a.kill(1240, 4, 0, 1800);
    const r = a.finish();
    const m = find(r, 'multikill')!;
    expect(m).toBeTruthy();
    expect(m.title).toBe('Double Knockout');
    expect(m.mine).toBe('actor');
    expect(m.actors[0]).toBe(0);
    const b = harness();
    b.kill(1000, 3, 0, 1600);
    b.kill(1241, 4, 0, 1800);
    expect(find(b.finish(), 'multikill')).toBeUndefined();
  });

  it('a triple and an ace: the whole enemy team down', () => {
    const h = harness();
    h.kill(2000, 3, 0, 2900);
    h.kill(2100, 4, 0, 2900);
    h.kill(2200, 5, 0, 2900);
    const r = h.finish();
    const top = r.list.find((x) => x.id === r.top[0])!;
    // the ace and the triple overlap: one highlight, the other as a tag
    expect(top.type === 'ace' || top.tags.includes('ace')).toBe(true);
    expect(top.type === 'multikill' || top.tags.includes('multikill:3')).toBe(true);
    expect(top.score).toBeGreaterThanOrEqual(75);
  });

  it('no ace while one enemy is still up; none in a Duel', () => {
    const h = harness();
    h.kill(2000, 3, 0, 2900);
    h.kill(2100, 4, 0, 2900);
    expect(find(h.finish(), 'ace')).toBeUndefined();
    const d = harness({ mutator: 'duel' });
    d.set(0, (p) => {
      for (const i of [1, 2, 4, 5]) {
        p[i].benched = true;
        p[i].alive = false;
      }
    });
    d.kill(2000, 3, 0, 2900);
    expect(find(d.finish(), 'ace')).toBeUndefined();
  });

  const brawl = (h: Harness, ids: number[], from: number, to: number): void => {
    for (let t = from; t <= to; t += 10)
      for (const a of ids)
        for (const b of ids) if (a < b && (a < 3) !== (b < 3)) {
          h.hit(t, a, b, 30);
          h.hit(t + 1, b, a, 30);
        }
  };

  it('teamfight: 4 fighting heroes (2 a side) within 12 m open it; it closes after 4 s quiet; the side with more kills wins', () => {
    const h = harness();
    h.set(900, (p) => near({ pos: p } as Harness, [0, 1, 3, 4], 50_000));
    brawl(h, [0, 1, 3, 4], 1000, 1400);
    h.kill(1300, 3, 0, 2400);
    const r = h.finish();
    const f = find(r, 'teamfight');
    expect(f).toBeTruthy();
    expect(f!.type).toBe('teamfight');
    expect(f!.side).toBe(0);
    expect(f!.mine).not.toBe('none');
    expect(f!.start).toBeLessThanOrEqual(1000);
    expect(f!.end).toBeGreaterThanOrEqual(1400);
    expect(f!.cam.mode).toBe('frame');
  });

  it('teamfight near miss: 3 heroes on 3v3 do not open one', () => {
    const h = harness();
    h.set(900, (p) => near({ pos: p } as Harness, [0, 1, 3], 50_000));
    brawl(h, [0, 1, 3], 1000, 1400);
    h.kill(1300, 3, 0, 2400);
    expect(find(h.finish(), 'teamfight')).toBeUndefined();
  });

  it('teamfight: equal kills and damage is an even trade', () => {
    const h = harness();
    h.set(900, (p) => near({ pos: p } as Harness, [0, 1, 3, 4], 50_000));
    brawl(h, [0, 1, 3, 4], 1000, 1400);
    h.kill(1300, 3, 0, 2400);
    h.kill(1310, 1, 4, 2400);
    const f = find(h.finish(), 'teamfight')!;
    expect(f.side).toBe(-1);
    expect(f.title).toMatch(/even|trade/i);
  });

  it('an ace inside a teamfight titles it over a double (live check Nov 15: an ace was shown as "Double Pounce")', () => {
    const h = harness();
    h.set(900, (p) => near({ pos: p } as Harness, [0, 1, 3, 4, 5], 50_000));
    brawl(h, [0, 1, 3, 4, 5], 1000, 1500);
    h.kill(1200, 3, 0, 2800);
    h.kill(1300, 4, 0, 2800);
    h.kill(1400, 5, 1, 2800);
    const r = h.finish();
    const fights = r.list.filter((x) => x.type === 'teamfight' || x.type === 'multikill' || x.type === 'ace');
    expect(fights).toHaveLength(1);
    expect(fights[0].title).not.toMatch(/Double/);
    expect(['Ace!', 'Clean sweep', 'Team wiped']).toContain(fights[0].title);
  });

  it('Hearthwood: a fight needs 6 heroes (5 do not open one)', () => {
    const five = harness({ teamSize: 5 });
    five.set(900, (p) => near({ pos: p } as Harness, [0, 1, 2, 5, 6], 50_000));
    brawl(five, [0, 1, 2, 5, 6], 1000, 1400);
    five.kill(1300, 5, 0, 2400);
    expect(find(five.finish(), 'teamfight')).toBeUndefined();
    const six = harness({ teamSize: 5 });
    six.set(900, (p) => near({ pos: p } as Harness, [0, 1, 2, 5, 6, 7], 50_000));
    brawl(six, [0, 1, 2, 5, 6, 7], 1000, 1400);
    six.kill(1300, 5, 0, 2400);
    expect(find(six.finish(), 'teamfight')).toBeTruthy();
  });

  it('a triple inside a teamfight becomes one teamfight titled by the triple', () => {
    const h = harness();
    h.set(900, (p) => near({ pos: p } as Harness, [0, 1, 3, 4, 5], 50_000));
    brawl(h, [0, 1, 3, 4, 5], 1000, 1500);
    h.kill(1200, 3, 0, 2800);
    h.kill(1300, 4, 0, 2800);
    h.kill(1400, 5, 0, 2800);
    const r = h.finish();
    const fights = r.list.filter((x) => x.type === 'teamfight' || x.type === 'multikill' || x.type === 'ace');
    expect(fights).toHaveLength(1);
    expect(fights[0].type).toBe('teamfight');
    expect(fights[0].title).toBe('Triple Knockout');
    expect(fights[0].tags).toContain('multikill:3');
  });

  it('shutdown, first blood, kaboom, a strike of 3 (not 2), the boss down and the finale', () => {
    const h = harness({ mutator: 'boss' });
    h.at(500, { type: 'firstBlood', tick: 500, killer: 0, victim: 4 });
    h.at(1500, { type: 'shutdown', tick: 1500, killer: 0, victim: 4, value: 300, fish: 0 });
    h.at(2500, { type: 'cannonFire', tick: 2500, id: 0, x: 0, y: 0, ax: 1, ay: 1 });
    h.at(2520, { type: 'kaboom', tick: 2520, src: 0, dst: 5 });
    h.at(3500, { type: 'yarnKick', tick: 3500, id: 1, ball: 0 }, { type: 'yarnStrike', tick: 3530, id: 1, n: 3 });
    h.at(4500, { type: 'yarnStrike', tick: 4500, id: 1, n: 2 });
    h.kill(8000, 3, 0);
    const r = h.finish({ winner: 0, reason: 'goal' });
    for (const t of ['firstBlood', 'shutdown', 'kaboom', 'strike', 'bossDown']) expect(find(r, t), t).toBeTruthy();
    expect(r.list.filter((x) => x.type === 'strike')).toHaveLength(1);
    const c = harness();
    expect(find(c.finish({ winner: 0, reason: 'core' }), 'finale')).toBeTruthy();
    // a forfeit has no finale
    expect(find(harness().finish({ winner: 1, reason: 'forfeit' }), 'finale')).toBeUndefined();
  });

  it('a match shorter than 60 s keeps only the finale', () => {
    const h = harness({ ticks: 1500 });
    h.kill(500, 3, 0);
    h.kill(600, 4, 0);
    const r = h.finish({ winner: 0, reason: 'core', ticks: 1500 });
    expect(types(r)).toEqual(['finale']);
  });
});

// ------------------------------------------------------------------------------------------- clutch, steals, dives

describe('highlights: clutch, steals, dives, comebacks', () => {
  it('clutch: ≤ 15% HP, hit by a hero, an enemy within 8 m, alive 5 s later; 20% is a near miss; dying cancels it', () => {
    const mk = (hp: number, dies: boolean) => {
      const h = harness();
      h.set(1900, (p) => {
        p[0].x = 50_000;
        p[3].x = 53_000;
        p[3].y = p[0].y;
      });
      h.hit(1990, 3, 0, 40);
      h.set(2000, (p) => (p[0].hp = hp));
      if (dies) h.kill(2100, 0, 3, 2500);
      return h.finish();
    };
    const yes = find(mk(40, false), 'clutch');
    expect(yes).toBeTruthy();
    expect(yes!.mine).toBe('actor');
    expect(yes!.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(find(mk(200, false), 'clutch')).toBeUndefined();
    expect(find(mk(40, true), 'clutch')).toBeUndefined();
  });

  it('steal: the last hit by a team that did < 40% of the damage; buff and cannon steals', () => {
    const mk = (mine: number) => {
      const h = harness();
      for (let i = 0; i < 5; i++) h.hit(3000 + i * 10, 3, 251, 100);
      h.hit(3060, 0, 251, mine);
      h.at(3070, { type: 'objective', tick: 3070, kind: 'pudding', team: 0, slot: 0 });
      return h.finish();
    };
    const s = find(mk(100), 'steal');
    expect(s).toBeTruthy();
    expect(s!.title).toMatch(/Pudding|Mine now|Yoink/);
    expect(find(mk(800), 'steal')).toBeUndefined();
    const b = harness();
    b.at(2000, { type: 'buffSteal', tick: 2000, id: 0, from: 3, kind: 'prickle' });
    b.at(4000, { type: 'cannonPick', tick: 4000, id: 1, team: 0, steal: true });
    const r = b.finish();
    expect(r.list.filter((x) => x.type === 'steal')).toHaveLength(2);
  });

  it('dive: a kill under the victim’s own tower, the diver alive 3 s later; dying to the tower is a failed dive', () => {
    const towers: TowerSample[] = [{ id: 200, team: 1, x: 90_000, y: 10_000, alive: true }];
    const ok = harness({ towers });
    ok.set(1900, (p) => (p[3].x = 93_000));
    ok.kill(2000, 3, 0, 2600);
    expect(find(ok.finish(), 'dive')).toBeTruthy();
    const bad = harness({ towers });
    bad.set(1900, (p) => (p[3].x = 93_000));
    bad.kill(2000, 3, 0, 2600);
    bad.kill(2060, 0, 200, 2600);
    const r = bad.finish();
    expect(find(r, 'dive')?.type).not.toBe('dive');
    expect(find(r, 'diveFail')).toBeTruthy();
  });

  it('comeback: the winner trailed by 3 takedowns; the flipping kill is the highlight', () => {
    const h = harness();
    h.kill(1000, 0, 3, 1500);
    h.kill(1010, 1, 3, 1500);
    h.kill(1020, 2, 3, 1500);
    h.kill(3000, 3, 0, 4000);
    h.kill(3500, 4, 0, 4500);
    h.kill(5000, 5, 1, 6000);
    const r = h.finish({ winner: 0, reason: 'core' });
    const c = find(r, 'comeback');
    expect(c).toBeTruthy();
    expect(c!.start).toBeLessThanOrEqual(5000);
    expect(c!.end).toBeGreaterThanOrEqual(5000);
    // no comeback when the winner always led
    const w = harness();
    w.kill(1000, 3, 0, 1500);
    expect(find(w.finish({ winner: 0, reason: 'core' }), 'comeback')).toBeUndefined();
  });
});

// ------------------------------------------------------------------------------------------------- funny

describe('highlights: funny', () => {
  it('minion, tower and camp deaths', () => {
    const h = harness();
    h.kill(1000, 1, 150, 1500);
    h.kill(3000, 2, 201, 3500);
    h.kill(5000, 4, 250, 5500);
    const r = h.finish();
    expect(find(r, 'minionDeath')!.funny).toBeGreaterThanOrEqual(60);
    expect(find(r, 'minionDeath')!.title).toMatch(/^Bot /);
    expect(find(r, 'minionDeath')!.sub).toContain('(bot)');
    expect(find(r, 'towerDeath')).toBeTruthy();
    expect(find(r, 'campDeath')).toBeTruthy();
  });

  it('a minion takedown of a healthy hero scores more', () => {
    const h = harness();
    h.set(1500, (p) => (p[1].hp = 900));
    h.set(1950, (p) => (p[1].hp = 100));
    h.kill(2000, 1, 150);
    expect(find(h.finish(), 'minionDeath')!.funny).toBe(RULES.minionDeath + 15);
  });

  it('wall pounce: a Pounce aimed ≥ 3 m that moved < 1.6 m; 1.7 m is a near miss', () => {
    const mk = (moved: number) => {
      const h = harness();
      h.at(2002, { type: 'cast', tick: 2002, src: 1, slot: 4, x: h.pos[1].x + 5000, y: h.pos[1].y, target: -1 });
      h.set(2005, (p) => (p[1].x += moved));
      return h.finish();
    };
    expect(find(mk(300), 'wallPounce')).toBeTruthy();
    expect(find(mk(1700), 'wallPounce')).toBeUndefined();
  });

  it('boing: a chain of two, and boinged to doom; a single boing is nothing', () => {
    const h = harness();
    h.at(1000, { type: 'boing', tick: 1000, id: 1, x: 0, y: 0, tx: 1, ty: 1 });
    h.at(1100, { type: 'boing', tick: 1100, id: 1, x: 0, y: 0, tx: 1, ty: 1 });
    h.set(2990, (p) => {
      p[3].x = 60_000;
      p[3].y = 30_000;
      p[4].x = 61_000;
      p[4].y = 30_000;
    });
    h.at(3000, { type: 'boing', tick: 3000, id: 2, x: 0, y: 0, tx: 60_500, ty: 30_000 });
    h.kill(3060, 2, 3, 3600);
    h.at(6000, { type: 'boing', tick: 6000, id: 0, x: 0, y: 0, tx: 1, ty: 1 });
    const r = h.finish();
    const b = r.list.filter((x) => x.type === 'boing');
    expect(b).toHaveLength(2);
    expect(b.some((x) => x.funny === RULES.boingDoom)).toBe(true);
  });

  it('return to sender, fumbles, an ult on a minion (not when a hero is hit), overkill, nap interrupted, clip markers', () => {
    const h = harness();
    h.at(1000, { type: 'cannonFire', tick: 1000, id: 3, x: 0, y: 0, ax: 1, ay: 1 });
    h.at(1010, { type: 'cannonParry', tick: 1010, id: 0 });
    h.at(1030, { type: 'kaboom', tick: 1030, src: 0, dst: 3 });
    h.at(2000, { type: 'cannonDrop', tick: 2000, id: 1, x: 0, y: 0, why: 'fumble' });
    h.at(3000, { type: 'cast', tick: 3000, src: 2, slot: 3, x: 0, y: 0, target: -1 });
    h.hit(3010, 2, 150, 300);
    h.at(4000, { type: 'cast', tick: 4000, src: 4, slot: 3, x: 0, y: 0, target: -1 });
    h.hit(4010, 4, 151, 300);
    h.hit(4011, 4, 0, 300);
    h.set(5000, (p) => (p[5].hp = 30));
    h.hit(5002, 1, 5, 400);
    h.set(6000, (p) => (p[3].napping = true));
    h.kill(6060, 3, 0, 6600);
    h.at(7000, { type: 'clip', tick: 7000, id: 4, what: 'ko' });
    const r = h.finish();
    const rts = find(r, 'returnToSender')!;
    expect(rts.title).toMatch(/^(Return to sender!|Parried it back!)$/);
    expect(rts.funny).toBe(RULES.returnToSender);
    expect(find(r, 'fumble')).toBeTruthy();
    const ult = r.list.filter((x) => x.type === 'ultOnMinion');
    expect(ult).toHaveLength(1);
    expect(ult[0].actors).toEqual([2]);
    expect(find(r, 'overkill')).toBeTruthy();
    expect(find(r, 'napFail')).toBeTruthy();
    expect(find(r, 'clipKind')!.funny).toBe(50);
  });

  it('a bot that walks alone into 3 enemies; ping spam (4 in 10 s, not 3); the emote sidecar', () => {
    const h = harness({ emotes: [6000, 6040, 6080] });
    h.set(1990, (p) => {
      near({ pos: p } as Harness, [3, 4, 5], 70_000);
      p[1].x = 71_000;
      p[1].y = 31_000;
    });
    h.kill(2000, 1, 3, 2600);
    for (const t of [4000, 4050, 4100, 4150]) h.at(t, { type: 'ping', tick: t, kind: 'focus', x: 0, y: 0, target: -1, took: 0 } as SimEvent);
    const r = h.finish();
    const bb = find(r, 'botBlunder')!;
    expect(bb.title).toMatch(/^Bot /);
    expect(find(r, 'pingSpam')).toBeTruthy();
    expect(find(r, 'emoteSpam')).toBeTruthy();
    const few = harness();
    for (const t of [4000, 4050, 4100]) few.at(t, { type: 'ping', tick: t, kind: 'focus', x: 0, y: 0, target: -1, took: 0 } as SimEvent);
    expect(find(few.finish(), 'pingSpam')).toBeUndefined();
    // without the sidecar the emote rule is silent
    expect(find(harness().finish(), 'emoteSpam')).toBeUndefined();
  });

  it('gaps5: the emote storm fires for 3 Waves at the solo cooldown (3 s apart), not for 3 spread over 10 s', () => {
    // MatchSession.emote() allows one Wave every 3 s: 3 in a row take 6 s (180 ticks)
    expect(find(harness({ emotes: [6000, 6090, 6180] }).finish(), 'emoteSpam')).toBeTruthy();
    expect(find(harness({ emotes: [6000, 6150, 6300] }).finish(), 'emoteSpam')).toBeUndefined();
    expect(RULES.emoteWindow).toBeGreaterThanOrEqual(2 * 90);
  });

  it('gaps5: four Nine Lives saves in one reel get four different titles', () => {
    const h = harness();
    // four heroes each saved by Nine Lives, far apart in time and on the map (no merging)
    [1, 2, 4, 5].forEach((id, k) => h.at(1000 + k * 1500, { type: 'buff', tick: 1000 + k * 1500, id, kind: 'nineLives', ticks: 60 } as SimEvent));
    const r = h.finish();
    const nine = r.list.filter((x) => x.type === 'clutch');
    expect(nine.length).toBe(4);
    const titles = nine.map((x) => x.title);
    expect(new Set(titles).size).toBe(4);
    for (const t of titles) expect(t.length).toBeLessThanOrEqual(TITLE_MAX);
  });
});

describe('highlights: distinct titles (gaps5)', () => {
  it('moves to the next variant, then "… again", then repeats', () => {
    const variants = ['Nine Lives, used one', 'Saved by Nine Lives', 'Eight lives left'];
    const used = new Set<string>();
    const make = (k: number) => ({ title: variants[k % variants.length], sub: 'Sage (bot)' });
    const got = [0, 1, 2, 3, 4].map(() => distinctTitle(make, used).title);
    expect(got).toEqual(['Nine Lives, used one', 'Saved by Nine Lives', 'Eight lives left', 'Nine Lives, used one again', 'Nine Lives, used one']);
    expect(distinctTitle(() => ({ title: 'Shut down!', sub: '' }), new Set(['Shut down!'])).title).toBe('Shut down again');
  });
});

// --------------------------------------------------------------------------------------- picking, merging, fog

describe('highlights: ranking and picking', () => {
  const busy = (): HighlightReel => {
    const h = harness();
    // the player's own moments
    h.kill(1000, 3, 0, 1600);
    h.kill(1200, 4, 0, 1800);
    h.at(3000, { type: 'shutdown', tick: 3000, killer: 0, victim: 5, value: 300, fish: 0 });
    h.kill(3000, 5, 0, 3600);
    // bots' moments
    h.at(4500, { type: 'cannonFire', tick: 4500, id: 1, x: 0, y: 0, ax: 1, ay: 1 });
    h.at(4520, { type: 'kaboom', tick: 4520, src: 1, dst: 4 });
    h.at(5500, { type: 'yarnKick', tick: 5500, id: 2, ball: 0 }, { type: 'yarnStrike', tick: 5520, id: 2, n: 4 });
    h.kill(6500, 1, 150, 7000);
    h.at(7500, { type: 'clip', tick: 7500, id: 4, what: 'flop' });
    h.kill(8000, 2, 201, 8500);
    return h.finish({ winner: 0, reason: 'core' });
  };

  it('top: 3, best first, ≤ 1 without the player when the player has 2 of its own; the Funniest is not in the top', () => {
    const r = busy();
    expect(r.top).toHaveLength(3);
    const top = r.top.map((id) => r.list.find((x) => x.id === id)!);
    expect(top.filter((x) => x.mine === 'none').length).toBeLessThanOrEqual(1);
    for (let i = 1; i < top.length; i++) expect(top[i - 1].score).toBeGreaterThanOrEqual(top[i].score);
    expect(r.funniest).not.toBeNull();
    expect(r.top).not.toContain(r.funniest);
    expect(r.list.find((x) => x.id === r.funniest)!.funny).toBeGreaterThanOrEqual(RULES.funniestMin);
  });

  it('list ≤ 12, chronological; every window 6 to 20 s inside the match', () => {
    const r = busy();
    expect(r.list.length).toBeLessThanOrEqual(12);
    for (let i = 1; i < r.list.length; i++) expect(r.list[i].start).toBeGreaterThanOrEqual(r.list[i - 1].start);
    for (const x of r.list) {
      expect(x.end - x.start).toBeGreaterThanOrEqual(RULES.minTicks);
      expect(x.end - x.start).toBeLessThanOrEqual(RULES.maxTicks);
      expect(x.start).toBeGreaterThanOrEqual(0);
      expect(x.end).toBeLessThanOrEqual(9000);
      expect(x.peak).toBeGreaterThanOrEqual(x.start);
      expect(x.peak).toBeLessThanOrEqual(x.end);
    }
  });

  it('montage: 3 to 5 highlights in match order, 20 to 30 s, no overlaps; fewer than 3 highlights, no montage', () => {
    const r = busy();
    expect(r.montage.length).toBeGreaterThanOrEqual(3);
    expect(r.montage.length).toBeLessThanOrEqual(5);
    const segs = montageSegments(r, 9000);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].at).toBeGreaterThan(segs[i - 1].at);
      expect(segs[i].at).toBeGreaterThanOrEqual(segs[i - 1].at + segs[i - 1].ticks);
    }
    const total = segs.reduce((n, s) => n + s.ticks, 0);
    expect(total).toBeGreaterThanOrEqual(RULES.montageMin);
    expect(total).toBeLessThanOrEqual(RULES.montageMax);
    for (const s of segs) expect(s.ticks).toBeLessThanOrEqual(RULES.montageSegMax);
    const one = harness();
    one.at(1000, { type: 'firstBlood', tick: 1000, killer: 0, victim: 3 });
    expect(one.finish().montage).toEqual([]);
  });

  it('an enemy-only moment the player’s team could not see is dropped (fog)', () => {
    const mk = (seen: boolean) => {
      const h = harness({ seen: (_t, i) => (i < 3 ? true : seen) });
      h.at(3000, { type: 'clip', tick: 3000, id: 4, what: 'bigdog' });
      return h.finish();
    };
    expect(find(mk(true), 'clipKind')).toBeTruthy();
    expect(find(mk(false), 'clipKind')).toBeUndefined();
  });

  it('clampWindow: short windows grow around the peak, long ones lose their lead, all inside [0, total]', () => {
    expect(clampWindow(100, 130, 120, 9000)).toEqual([10, 190]);
    const [a, b] = clampWindow(0, 2000, 1500, 9000);
    expect(b - a).toBe(RULES.maxTicks);
    expect(a).toBeLessThanOrEqual(1500);
    expect(b).toBeGreaterThanOrEqual(1500);
    expect(clampWindow(8990, 9000, 8995, 9000)).toEqual([8820, 9000]);
    expect(clampWindow(0, 10, 5, 9000)).toEqual([0, 180]);
  });

  it('stepHighlight and highlightAt (N / Shift+N, "This highlight")', () => {
    const r = busy();
    const first = r.list[0];
    expect(highlightAt(r, first.start + 1)?.id).toBe(first.id);
    expect(stepHighlight(r.list, 0, 1)?.id).toBe(r.list.find((x) => x.start > 30)!.id);
    expect(stepHighlight(r.list, 99999, 1)?.id).toBe(first.id);
    expect(stepHighlight(r.list, r.list[1].start + 10, -1)?.id).toBe(first.id);
    expect(highlightSeconds({ start: 0, end: 30 })).toBe(6);
    expect(highlightSeconds({ start: 0, end: 900 })).toBe(20);
  });
});

// ------------------------------------------------------------------------------------------------- titles

describe('highlights: titles', () => {
  const heroNames = HERO_IDS.map((h) => HERO_TEXT[h].title);
  it('every template is ≤ 28 characters and never says "player"', () => {
    for (const t of ALL_TITLE_TEMPLATES) {
      expect(t.replace('{hp}', '15').replace('{a}', '5').replace('{b}', '5').replace('{team}', 'Purrhaven').length, t).toBeLessThanOrEqual(TITLE_MAX);
      expect(t.toLowerCase()).not.toContain('player');
    }
  });

  it('every title ≤ 28 and sub ≤ 40 for every type and every roster name; bots are "(bot)"; solo subs end "vs bots"', () => {
    const typesAll = ['multikill', 'ace', 'teamfight', 'shutdown', 'firstBlood', 'kaboom', 'strike', 'bossDown', 'finale', 'clutch', 'steal', 'dive', 'comeback', 'minionDeath', 'towerDeath', 'campDeath', 'diveFail', 'wallPounce', 'boing', 'returnToSender', 'fumble', 'ultOnMinion', 'overkill', 'napFail', 'clipKind', 'botBlunder', 'pingSpam', 'emoteSpam'] as const;
    for (const name of [...heroNames, 'Sir Brutus Biscuit the Third of Purrhaven']) {
      const ctx: TitleCtx = { seed: 3, names: [name, name, name, name, name, name], bots: [false, true, true, true, true, true], vsBots: true, teams: ['Purrhaven', 'Woof'], me: 0 };
      for (const type of typesAll)
        for (const start of [0, 1, 2, 3, 4])
          for (const bot of [false, true]) {
            const actor = bot ? 1 : 0;
            const { title, sub } = titleFor({ type, start, actors: [actor], victims: [3], n: 5, kills: [3, 1], seconds: 14, side: 0, hpPct: 3, sort: 'objective', what: 'pudding', behind: 3 }, ctx, bot);
            expect(title.length, `${type} ${title}`).toBeLessThanOrEqual(TITLE_MAX);
            expect(sub.length, `${type} ${sub}`).toBeLessThanOrEqual(SUB_MAX);
            expect(sub.endsWith('vs bots'), sub).toBe(true);
            expect(`${title} ${sub}`.toLowerCase()).not.toContain('player');
            if (bot && ['minionDeath', 'towerDeath', 'campDeath', 'napFail'].includes(type)) expect(title.startsWith('Bot '), title).toBe(true);
            if (sub.includes(name.slice(0, 10)) && actor === 1) expect(sub).toContain('(bot)');
          }
    }
    const t = titleFor({ type: 'multikill', start: 0, actors: [0], victims: [3, 4, 5, 3, 4], n: 5, seconds: 9 }, { seed: 0, names: NAMES, bots: [false, true, true, true, true, true], vsBots: true, teams: ['Purrhaven', 'Woof'], me: 0 }, false);
    expect(t.title).toBe('PAWNTA KNOCKOUT');
    expect(t.sub).toBe('Clem · 5 down in 9 s · vs bots');
  });

  it('the choice is deterministic: (seed + start) % variants', () => {
    const ctx: TitleCtx = { seed: 1, names: NAMES, bots: [false, true, true, true, true, true], vsBots: true, teams: ['Purrhaven', 'Woof'], me: 0 };
    const a = titleFor({ type: 'shutdown', start: 1, actors: [0], victims: [3] }, ctx, false);
    const b = titleFor({ type: 'shutdown', start: 1, actors: [0], victims: [3] }, ctx, false);
    const c = titleFor({ type: 'shutdown', start: 2, actors: [0], victims: [3] }, ctx, false);
    expect(a).toEqual(b);
    expect(a.title).not.toBe(c.title);
  });
});

// ------------------------------------------------------------------------------------------ real matches

function playWithDetector(seed: number, ticks: number, map?: 'hearthwood'): { reel: HighlightReel; m: Match } {
  const { picks, tricks } = fillPicks(seed, 'clem', 'pounce', map);
  const m = createMatch({ seed, picks, tricks, difficulty: 'easy', ...(map ? { map } : {}) });
  const det = new HighlightDetector({ seed, key: `${seed}`, simVersion: SIM_VERSION, slots: picks.length, teamSize: picks.length / 2, ticks, mutator: 'none', tricks, names: picks, bots: picks.map((_, i) => i !== 0), vsBots: true, kindOf: kindOf(m) });
  const r = new Rng(seed ^ 0x5eed);
  while (tickOf(m) < ticks && !result(m)) {
    const c = randomCommand(r);
    step(m, c ? [c as Command] : []);
    const t = tickOf(m);
    det.feed(t, (m as unknown as { events: SimEvent[] }).events, t % 5 === 0 ? probe(m, picks.length, t % 30 === 0) : null);
  }
  const res = result(m);
  return { reel: det.finish({ winner: res ? res.winner : -1, reason: res ? res.reason : 'safetyEnd', ticks: tickOf(m) }), m };
}

describe('highlights: real matches', { timeout: limit(240_000) }, () => {
  it('determinism: 20 seeds, run twice, the same reels', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = playWithDetector(seed, 4500).reel;
      const b = playWithDetector(seed, 4500).reel;
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.detector).toBe(DETECTOR_V);
      for (const h of a.list) {
        expect(h.title.length).toBeLessThanOrEqual(TITLE_MAX);
        expect(h.sub.length).toBeLessThanOrEqual(SUB_MAX);
      }
    }
  });

  it('the probe agrees with the public snapshot (hero x / y / hp, alive) on a sample tick', () => {
    for (const map of [undefined, 'hearthwood'] as const) {
      const { m } = playWithDetector(5, 1500, map);
      const slots = map ? 10 : 6;
      const p = probe(m, slots, true);
      for (const team of [0, 1] as const) {
        const snap = snapshot(m, team);
        for (const e of snap.entities.filter((x) => x.kind === 'hero' && x.team === team)) {
          const s = p.heroes[e.id];
          expect([s.x, s.y, s.hp, s.maxHp]).toEqual([e.x, e.y, e.hp, e.maxHp]);
          expect(s.alive).toBe(e.state !== 'dead');
        }
      }
      // seen = the player's team's view
      const vis = new Set(snapshot(m, 0).entities.map((e) => e.id));
      p.seen!.forEach((v, i) => expect(v).toBe(vis.has(i)));
      // towers: the snapshot's towers of each team are the probe's living ones
      const towers = snapshot(m, 0).entities.filter((e) => e.kind === 'tower' && e.team === 0);
      for (const t of towers) expect(p.towers.find((x) => x.id === t.id)).toMatchObject({ x: t.x, y: t.y, team: 0, alive: true });
      const kind = kindOf(m);
      expect(kind(0)).toBe('hero');
      expect(kind(towers[0].id)).toBe('tower');
    }
  });

  it('a golden fixture record: the scan (ReplayCore, no keyframes) gives the pinned reel', () => {
    const file = join(__dirname, '../fixtures/highlights/golden.json');
    // HL_FIXTURE=1 npx vitest run tests/unit/highlights.test.ts regenerates it (after a sim or detector change)
    if (process.env.HL_FIXTURE === '1') {
      const seed = 2;
      const { picks, tricks } = fillPicks(seed, 'clem', 'pounce');
      const m = createMatch({ seed, picks, tricks, difficulty: 'easy' });
      const rng = new Rng(seed ^ 0x5eed);
      for (let t = 0; t < 30000 && !result(m); t++) {
        const c = randomCommand(rng);
        step(m, c ? [c as Command] : []);
      }
      const record = replayRecord(m)!;
      const core = new ReplayCore();
      core.load(record, undefined, { highlights: { names: NAMES.slice(0, 6) }, scanOnly: true });
      while (!core.info.done) core.scoutFor(5000, 1e9, () => performance.now());
      mkdirSync(join(__dirname, '../fixtures/highlights'), { recursive: true });
      writeFileSync(file, `${JSON.stringify({ record, names: NAMES.slice(0, 6), reel: core.reel }, null, 1)}\n`);
    }
    const fx = JSON.parse(readFileSync(file, 'utf8')) as { record: ReplayRecord; names: string[]; reel: HighlightReel };
    if (fx.record.simVersion !== SIM_VERSION) {
      // the sim moved on: regenerate the fixture with HL_FIXTURE=1 (see above)
      expect(existsSync(file)).toBe(true);
      return;
    }
    const core = new ReplayCore();
    expect(core.load(fx.record, undefined, { highlights: { names: fx.names }, scanOnly: true })).toBeNull();
    while (!core.info.done) core.scoutFor(5000, 1e9, () => performance.now());
    expect(core.info.ok).toBe(true);
    expect(core.reel).toEqual(fx.reel);
    // compact enough for the history row
    expect(JSON.stringify(core.reel).length).toBeLessThan(6 * 1024);
  });
});

// -------------------------------------------------------------------------------------- store, clip, viewer

class Mem implements KVStore {
  m = new Map<string, string>();
  full = false;
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.full) throw new Error('QuotaExceededError');
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe('highlights: cache, clip length, montage plan, viewer helpers', () => {
  const rec = { v: 1, simVersion: SIM_VERSION, seed: 9, difficulty: 'easy', hero: 'clem', trick: 'pounce', ticks: 9000, inputs: 'AA==', outcome: 'won', finalHash: 'abcd1234' } as ReplayRecord;
  const reel = (detector = DETECTOR_V, key = '9:abcd1234:9000'): HighlightReel => ({ v: 1, detector, simVersion: SIM_VERSION, key, list: [], top: [], funniest: null, montage: [] });
  const row = { id: 'a', at: 1, hero: 'clem', mode: 'skirmish' as const, difficulty: 'easy', outcome: 'won' as const, grade: 'A', k: 1, d: 0, a: 0, seconds: 300, simVersion: SIM_VERSION };

  it('the cache holds for this detector and this record only; full storage keeps the row', () => {
    const s = new Mem();
    recordMoment(row, rec, s);
    expect(reelOf('a', s)).toBeNull();
    expect(saveReel('a', reel(), s)).toBe(true);
    expect(reelOf('a', s)).toEqual(reel());
    expect(reelValid(reel(DETECTOR_V - 1), rec)).toBe(false);
    expect(reelValid(reel(DETECTOR_V, '9:other:9000'), rec)).toBe(false);
    expect(reelValid(reel(), rec)).toBe(true);
    s.full = true;
    expect(saveReel('a', { ...reel(), top: ['x'] }, s)).toBe(false);
    // the row and its replay are still there, with the reel that was saved before
    expect(JSON.parse(s.getItem(HISTORY_KEY)!)[0].id).toBe('a');
    expect(s.getItem(REPLAYS_KEY)).toContain('abcd1234');
    expect(reelOf('a', s)?.top).toEqual([]);
  });

  it('clipSeconds: the fixed lengths, and any 6-20 s in exact mode; file names and share text', () => {
    expect(clipSeconds(12)).toBe(15);
    expect(clipSeconds(12, true)).toBe(12);
    expect(clipSeconds(3, true)).toBe(6);
    expect(clipSeconds(31, true)).toBe(20);
    expect(clipSeconds(7.4, true)).toBe(7);
    const d = new Date(2026, 10, 14);
    expect(clipFileName('mp4', d, 'highlight')).toBe('paw-legends-highlight-20261114.mp4');
    expect(clipFileName('webm', d, 'montage')).toBe('paw-legends-montage-20261114.webm');
    expect(clipFileName('mp4', d)).toBe('paw-legends-clip-20261114.mp4');
    expect(clipShareText('x', 'Clem', 'montage')).toBe('My Paw Legends match montage with Clem!');
  });

  it('the montage plan trims each highlight to ≤ 8 s around its peak and grows short ones to 20 s', () => {
    expect(segmentOf({ start: 0, end: 600, peak: 400 }, 9000, 240)).toEqual([256, 496]);
    const mk = (id: string, start: number, end: number, peak: number) => ({ id, start, end, peak, title: id, sub: '' }) as Highlight;
    const r = { list: [mk('a', 1000, 1180, 1100), mk('b', 3000, 3180, 3100), mk('c', 5000, 5180, 5100)], montage: ['c', 'a', 'b'] };
    const segs = montageSegments(r, 9000);
    expect(segs.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(segs.reduce((n, s) => n + s.ticks, 0)).toBe(RULES.montageMin);
  });

  it('viewer: the director interpolates its keys; the band colours', () => {
    const h = { cam: { mode: 'frame' as const, keys: [[0, 10, 20, 80], [90, 40, 20, 80]] as [number, number, number, number][] } };
    expect(camPoint(h, 45)).toEqual({ x: 2500, y: 2000 });
    expect(camPoint(h, -5)).toEqual({ x: 1000, y: 2000 });
    expect(camPoint(h, 500)).toEqual({ x: 4000, y: 2000 });
    expect(camPoint({ cam: { mode: 'frame', keys: [] } }, 1)).toBeNull();
    expect(bandOf({ category: 'funny' })).toBe('funny');
    expect(bandOf({ category: 'teamfight' })).toBe('fight');
    expect(bandOf({ category: 'clutch' })).toBe('bolt');
    expect(bandOf({ category: 'epic' })).toBe('epic');
  });

  it('strip: the 3 best and the Funniest as cards', () => {
    const mk = (id: string) => ({ id, start: 0, end: 300, peak: 100 }) as Highlight;
    const r: HighlightReel = { ...reel(), list: [mk('a'), mk('b'), mk('c'), mk('f')], top: ['b', 'a', 'c'], funniest: 'f' };
    expect(stripCards(r).map((c) => [c.h.id, c.funniest])).toEqual([
      ['b', false],
      ['a', false],
      ['c', false],
      ['f', true],
    ]);
  });
});
