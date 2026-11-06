// @vitest-environment happy-dom
/**
 * Lane F (docs/FUN-PROGRESSION-V12.md F1–F6): the progression UI. Toy and level words (no "Treat" anywhere), the
 * progression rail merge, the announcer's buy / geared / First Blood / shutdown Fish / Clean Sweep / On the Prowl
 * moments, the Fish chip ring, merged Fish pops, scoreboard pips, the fed-enemy crown and the results summary.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import { FISH } from '../../src/data/fish';
import { TOY_COST, TOY_TIERS } from '../../src/data/toys';
import { XP } from '../../src/data/xp';
import { Announcer, STREAK_NAMES, type Moment } from '../../src/render/announcer';
import { DAMAGE_FX, DamageNumbers } from '../../src/render/fx/DamageNumbers.js';
import { MERGE_TICKS, PROGRESS_KEY, ProgressRail } from '../../src/ui/progressRail';
import { fishProgress, gearedLine, levelLine, levelWhat, mmss, toyCumulative, toyName, toyPassiveText, toyToast, TOY_NAME } from '../../src/ui/toyText';
import { fishSources, medals, progressBlock, progressRows } from '../../src/ui/progressSummary';
import { toyPips } from '../../src/ui/scoreboard';
import { fedPips } from '../../src/ui/overhead';
import type { HeroId, SlotStats } from '../../src/sim/api';

const names = (s: number) => ['Clem', 'Sage', 'Sir Brutus', 'Rex', 'Cacklejaw', 'Bengas'][s];
const picks: HeroId[] = ['clem', 'sage', 'brutus', 'cacklejaw', 'sage', 'clem'].filter((h) => (HERO_IDS as readonly string[]).includes(h)) as HeroId[];
const heroOf = (s: number): HeroId | undefined => picks[s] ?? 'clem';
const death = (tick: number, id: number, killer: number) => ({ type: 'death' as const, tick, id, killer });
const keys = (ms: Moment[]) => ms.map((m) => m.key);

describe('toy words (F2)', () => {
  it('every hero and tier has a phone-length toast, and no line says "Treat"', () => {
    const all: string[] = [];
    for (const h of HERO_IDS) {
      for (let t = 1; t <= TOY_TIERS; t++) {
        const toast = toyToast(h, t);
        expect(toast.title.length, `${h} ${t}: ${toast.title}`).toBeLessThanOrEqual(28);
        expect(toast.title).toContain(toyName(h, t));
        expect(toast.head).toMatch(/^\+\d+(% (damage|atk speed|speed)| HP)$/);
        all.push(toast.title, toast.sub, toast.name);
      }
      all.push(toyPassiveText(HEROES[h].role));
    }
    for (const n of Object.values(TOY_NAME)) expect(n.length).toBeLessThanOrEqual(11);
    for (let lv = 1; lv <= XP.maxLevel; lv++) all.push(levelLine(lv), levelLine(lv, true));
    all.push(gearedLine('Rex'));
    for (const line of all) expect(line, line).not.toMatch(/treat/i);
  });

  it('a tier-3 toast names the role passive; the last tier says fully geared', () => {
    expect(toyToast('clem', 3).sub).toContain('new: basics heal 8% of hero damage');
    expect(toyToast('sage', 4).sub).toContain('fully geared');
    expect(toyToast('clem', 1)).toMatchObject({ title: 'Chew Rope I — +14% damage', name: 'Chew Rope I', head: '+14% damage' });
  });

  it('the Fish chip ring fills toward the next step and is full at the last tier', () => {
    expect(fishProgress(0, 0)).toEqual({ frac: 0, next: TOY_COST[0] });
    expect(fishProgress(TOY_COST[0] / 2, 0).frac).toBeCloseTo(0.5);
    expect(fishProgress(350, 1)).toEqual({ frac: 350 / TOY_COST[1], next: TOY_COST[1] });
    expect(fishProgress(9999, TOY_TIERS)).toEqual({ frac: 1, next: 0 });
    expect([1, 2, 3, 4].map(toyCumulative)).toEqual([550, 1300, 2200, 3150]);
    expect(mmss(131 * 30)).toBe('2:11');
    expect(mmss(-1)).toBe('–');
  });
});

describe('level words (F3)', () => {
  it('each level says what is new (rank and talent tables)', () => {
    const table = Array.from({ length: XP.maxLevel }, (_, i) => levelLine(i + 1));
    expect(table).toEqual([
      'Level 1',
      'Level 2 — Q W E rank 2',
      'Level 3 — pick a talent',
      'Level 4 — Ultimate unlocked!',
      'Level 5 — Q W E rank 3',
      'Level 6 — pick a talent',
      'Level 7 — Ultimate rank 2',
      'Level 8 — Q W E rank 4',
      'Level 9 — pick a talent',
      'Level 10 — Ultimate rank 3 · max level',
    ]);
    expect(levelWhat(5, true)).toBe('Skills rank 3');
    for (let lv = 1; lv <= XP.maxLevel; lv++) expect(levelLine(lv, true).length, levelLine(lv, true)).toBeLessThanOrEqual(28);
  });
});

describe('progression rail (F2, F3)', () => {
  const buy = { name: 'Yarn Ball II', head: '+6% damage', sub: '+6% damage · +50 HP' };
  it('a level-up alone says what it brings; a Toy alone says what it adds', () => {
    const r = new ProgressRail();
    expect(r.level({ level: 4, what: 'Ultimate unlocked!' }, 100)).toMatchObject({ key: PROGRESS_KEY, title: 'Level 4 — Ultimate unlocked!', prio: 3, tone: 'gold' });
    const n = r.bought(buy, 100 + MERGE_TICKS + 1);
    expect(n.title).toBe('Yarn Ball II — +6% damage');
    // the second part only adds what the title does not say
    expect(n.sub).toBe('+50 HP');
    expect(new ProgressRail().bought({ name: 'Chew Rope I', head: '+8% damage', sub: '+8% damage' }, 0).sub).toBeUndefined();
    expect(n.icon).toContain('<svg');
  });
  it('a buy and a level-up within 2 s are one rail item, in either order', () => {
    const r = new ProgressRail();
    r.level({ level: 5, what: 'Q W E rank 3' }, 1000);
    const n = r.bought(buy, 1000 + MERGE_TICKS);
    expect(n).toMatchObject({ key: PROGRESS_KEY, title: 'Level 5 · Yarn Ball II', sub: 'Q W E rank 3 · +6% damage' });
    const r2 = new ProgressRail();
    r2.bought(buy, 50);
    expect(r2.level({ level: 6, what: 'pick a talent' }, 80).title).toBe('Level 6 · Yarn Ball II');
    for (const l of [...r.lines, ...r2.lines]) expect(l).not.toMatch(/treat/i);
  });
});

describe('announcer (F2, F4)', () => {
  it('the own buy is a buy moment with the Toy; an enemy shows only at its last tier', () => {
    const a = new Announcer(0, 0, names, heroOf);
    const m = a.feed({ type: 'buy', tick: 900, id: 0, tier: 2 });
    expect(keys(m)).toEqual(['buy']);
    expect(m[0].toy).toMatchObject({ tier: 2, name: toyName(heroOf(0)!, 2) });
    expect(m[0].tick).toBe(900);
    expect(m[0].title).not.toMatch(/treat/i);
    expect(a.feed({ type: 'buy', tick: 901, id: 3, tier: 2 })).toEqual([]);
    expect(a.feed({ type: 'buy', tick: 902, id: 1, tier: 4 })).toEqual([]);
    const g = a.feed({ type: 'buy', tick: 903, id: 3, tier: TOY_TIERS });
    expect(g).toMatchObject([{ key: 'geared', title: 'Rex is fully geared up', tone: 'bad' }]);
    expect(a.toysBought).toBe(1);
  });

  it('the player\'s First Blood says its Fish from the data', () => {
    const a = new Announcer(0, 0, names, heroOf);
    const fb = a.feed(death(300, 3, 0)).find((m) => m.key === 'firstBlood');
    expect(fb?.title).toBe(`First Blood! +${FISH.kill + FISH.firstBlood} Fish`);
    expect(FISH.kill + FISH.firstBlood).toBe(170);
    // someone else's: no Fish
    const b = new Announcer(1, 0, names, heroOf);
    expect(b.feed(death(300, 3, 0)).find((m) => m.key === 'firstBlood')?.title).toBe('First Blood!');
  });

  it('the sim shutdown adds its Fish to the shutdown line', () => {
    const a = new Announcer(0, 0, names, heroOf);
    a.feed(death(100, 0, 3));
    a.feed(death(200, 1, 3));
    a.feed(death(300, 2, 3));
    expect(a.feed(death(400, 3, 0)).find((m) => m.key === 'shutdown')?.title).toBe('Shut down!');
    const extra = a.feed({ type: 'shutdown', tick: 400, killer: 0, victim: 3, value: 120, fish: 120 });
    expect(extra.find((m) => m.key === 'shutdownFish')?.title).toBe('Shut down! +120 Fish');
    expect(extra.find((m) => m.key === 'shutdownXp')?.title).toBe('+120 XP');
    // a shutdown first seen from the sim carries the Fish in its title
    const b = new Announcer(0, 0, names, heroOf);
    expect(b.feed({ type: 'shutdown', tick: 50, killer: 0, victim: 4, value: 80, fish: 80 })[0].title).toBe('Shut down! +80 Fish');
  });

  it('the player in on all three enemy knockouts within the multikill window: Clean Sweep beside the ACE', () => {
    const down = new Set<number>();
    const a = new Announcer(0, 0, names, heroOf);
    a.down = (s) => down.has(s);
    // 3 and 5 by the player, 4 by an ally after the player hit it (an assist)
    a.feed(death(1000, 3, 0));
    down.add(3);
    a.feed({ type: 'hit', tick: 1050, src: 0, dst: 4, amount: 40, shielded: 0, kind: 'basic' });
    a.feed(death(1100, 4, 1));
    down.add(4);
    const m = a.feed(death(1200, 5, 0));
    expect(keys(m)).toContain('cleanSweep');
    expect(keys(m)).toContain('ace');
    expect(m.find((x) => x.key === 'cleanSweep')).toMatchObject({ title: 'Clean Sweep!', size: 'callout', tone: 'gold' });
    // an ally's knockout the player had no part in: no sweep (the ACE still comes)
    const down2 = new Set<number>();
    const b = new Announcer(0, 0, names, heroOf);
    b.down = (s) => down2.has(s);
    b.feed(death(1000, 3, 0));
    down2.add(3);
    b.feed(death(1100, 4, 1));
    down2.add(4);
    const m2 = b.feed(death(1200, 5, 0));
    expect(keys(m2)).not.toContain('cleanSweep');
    expect(keys(m2)).toContain('ace');
    // over the window between two of them: no sweep
    const c = new Announcer(0, 0, names, heroOf);
    c.feed(death(1000, 3, 0));
    c.feed(death(1300, 4, 0));
    expect(keys(c.feed(death(1400, 5, 0)))).not.toContain('cleanSweep');
  });

  it('a streak of 5 is On the Prowl', () => {
    expect(STREAK_NAMES[5]).toBe('On the Prowl');
  });
});

describe('fish pops (F1)', () => {
  it('own Fish within 300 ms merge into one "+N"; later ones start a new pop', () => {
    let t = 0;
    const dn = new DamageNumbers({ game: { get realTime() { return t; } }, cam: { isIso: true, distance: 27 } });
    const p = new THREE.Vector3();
    dn.show(p, '+7', 'fish', 'fish', 7);
    t += 0.2;
    dn.show(p, '+5', 'fish', 'fish', 5);
    expect(dn.merged).toBe(1);
    const nodes = (dn as unknown as { pool: { active: boolean; style: string; value: number }[] }).pool.filter((n) => n.active && n.style === 'fish');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].value).toBe(12);
    t += DAMAGE_FX.fishMerge + 0.01;
    dn.show(p, '+3', 'fish', 'fish', 3);
    expect(dn.merged).toBe(1);
    // a damage number on the same key never merges into Fish
    dn.show(p, '40', 'normal', 'fish', 40);
    expect(dn.merged).toBe(1);
  });
});

describe('scoreboard pips and the fed crown (F2, F6)', () => {
  it('toy pips light per tier; hidden heroes show "?"', () => {
    expect(toyPips(2)).toContain('data-toy="2"');
    expect((toyPips(2).match(/class="tp on"/g) ?? []).length).toBe(2);
    expect(toyPips(undefined)).toContain('?');
  });
  it('only enemies ahead of the player on Toys get the crown', () => {
    const e = { kind: 'hero', team: 1, toy: 3, state: 'idle' } as const;
    expect(fedPips(e, 0, 2)).toBe(3);
    expect(fedPips(e, 0, 3)).toBe(0);
    expect(fedPips({ ...e, team: 0 }, 0, 0)).toBe(0);
    expect(fedPips({ ...e, state: 'dead' }, 0, 0)).toBe(0);
  });
});

describe('results summary (F5)', () => {
  const st = (slot: number, o: Partial<SlotStats> = {}): SlotStats => ({
    slot,
    hero: picks[slot] ?? 'clem',
    kills: 0,
    deaths: 0,
    assists: 0,
    heroDamage: 0,
    towerDamage: 0,
    level: 6,
    damageTaken: 0,
    healShield: 0,
    objective: 0,
    fish: 1000,
    toys: 1,
    lastHits: 10,
    toy1At: 3930,
    toy2At: -1,
    toy3At: -1,
    toy4At: -1,
    ...o,
  });
  it('MVP plus Gold, Silver and Bronze by score (ties by takedowns, then slot)', () => {
    const stats = [st(0, { kills: 3 }), st(1), st(2), st(3, { kills: 1 }), st(4), st(5)];
    const scores = [0.9, 0.5, 0.2, 0.5, 0.7, 0.1].map((score, slot) => ({ slot, score }));
    const m = medals(stats, scores, 0);
    expect([...m.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [0, 'mvp'],
      [1, 'bronze'],
      [3, 'silver'],
      [4, 'gold'],
    ]);
  });
  it('Fish by source groups the events and calls the rest the trickle', () => {
    const src = fishSources({ lastHit: 300, minion: 100, kill: 240, assist: 60, firstBlood: 50, tower: 100, camp: 60 }, 1200);
    expect(src.map((s) => [s.key, s.amount])).toEqual([
      ['lastHit', 300],
      ['minion', 100],
      ['takedown', 350],
      ['camp', 60],
      ['objective', 100],
      ['trickle', 290],
    ]);
  });
  it('rows put the own team first and the block shows Toy timings as mm:ss chips', () => {
    const stats = [3, 4, 5, 0, 1, 2].map((s) => st(s, s === 0 ? { toys: 2, toy2At: 7590, lastHits: 23, fish: 2040 } : {}));
    const rows = progressRows(stats, 0, (s) => names(s), new Map([[0, 'mvp' as const]]));
    expect(rows.map((r) => r.slot)).toEqual([0, 1, 2, 3, 4, 5]);
    const html = progressBlock({ rows, sources: fishSources({ lastHit: 500 }, 2040) });
    expect(html).toContain('2:11');
    expect(html).toContain('4:13');
    expect(html).toContain('data-medal="mvp"');
    expect(html).toContain('data-fish-total="2040"');
    expect(html).not.toMatch(/treat/i);
  });
});
