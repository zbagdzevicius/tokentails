// @vitest-environment happy-dom
/**
 * FEEL lane of the fun plan (docs/plans/moba fun plan F1–F4): the announcer (First Blood, streaks, multikills,
 * shutdowns, bounties, comebacks, combos, pickups, Nine Lives), XP pops, objective chips, the first-session script,
 * the Treat Track, daily quests, touch assists, the hidden Sunset timer and the music intensity rule.
 */
import { describe, expect, it } from 'vitest';
import { Announcer, XpPops, type Moment } from '../../src/render/announcer';
import { Objectives, BEAT_TTL } from '../../src/onboarding/objectives';
import { canPickDifficulty, difficultyFor, guideMode, pickable } from '../../src/app/firstSession';
import { addTreatXp, freshTreats, nextReward, parseTreats, TREAT_REWARDS, TREAT_STEP, treatXpFor } from '../../src/meta/treats';
import { dailyQuests, freshQuests, parseQuests, progressQuests, QUEST_XP } from '../../src/meta/quests';
import { autoAttackTarget, edgeGoal, laneMagnet } from '../../src/input/touch/assist';
import { phaseLine } from '../../src/ui/hud';
import { intensityOf } from '../../src/audio/music';
import { Sfx } from '../../src/audio/sfx';
import { resultLine } from '../../src/ui/screens';
import { FOUNTAIN, MAP, mirrorX } from '../../src/data/map';
import type { Unit } from '../../src/input/targeting';

const death = (tick: number, id: number, killer: number) => ({ type: 'death' as const, tick, id, killer });
const hit = (tick: number, src: number, dst: number, kind: 'basic' | 'ability') => ({ type: 'hit' as const, tick, src, dst, amount: 50, shielded: 0, kind });
const keys = (ms: Moment[]) => ms.map((m) => m.key);
const name = (s: number) => ['Clem', 'Sage', 'Sir Brutus', 'Cacklejaw', 'Sage', 'Clem'][s];

describe('announcer', () => {
  it('First Blood with slow-mo, then a multikill chain within 8 s', () => {
    const a = new Announcer(0, 0, name);
    const fb = a.feed(death(600, 3, 0));
    expect(keys(fb)).toContain('firstBlood');
    expect(fb[0].slowmo).toEqual({ ms: 400, scale: 0.4 });
    expect(keys(a.feed(death(700, 4, 0)))).toContain('multi2');
    const triple = a.feed(death(800, 5, 0));
    expect(triple.find((m) => m.key === 'multi3')?.title).toBe('Triple Pounce');
    expect(triple.find((m) => m.key === 'multi3')?.slowmo).toEqual({ ms: 600, scale: 0.3 });
    expect(keys(triple)).toContain('streak3');
    expect(a.feed(death(900, 3, 0)).find((m) => m.key === 'multi4')?.title).toBe('Cat-astrophe');
    expect(a.bestMoment?.title).toBe('Cat-astrophe');
    expect(a.takedowns).toBe(4);
    expect(a.firstTakedownTick).toBe(600);
    // 8 s later the chain is over
    expect(keys(a.feed(death(900 + 241, 4, 0)))).not.toContain('multi2');
  });

  it('a sim firstBlood after an inferred one is not announced twice; enemy First Blood reads bad', () => {
    const a = new Announcer(0, 0, name);
    const m = a.feed(death(300, 0, 3));
    expect(m[0]).toMatchObject({ key: 'firstBlood', tone: 'bad' });
    expect(a.feed({ type: 'firstBlood', tick: 300, killer: 3, victim: 0 })).toEqual([]);
    expect(a.deaths).toBe(1);
  });

  it('streak names, a bounty crown from 3 kills, and a shutdown when it falls', () => {
    const a = new Announcer(0, 0, name);
    a.feed(death(100, 0, 3));
    a.feed(death(200, 1, 3));
    const s3 = a.feed(death(300, 2, 3));
    expect(keys(s3)).toContain('enemyStreak');
    expect(a.bounty(3)).toBeGreaterThan(0);
    const sd = a.feed(death(400, 3, 0));
    expect(sd.find((m) => m.key === 'shutdown')?.title).toBe('Shut down!');
    expect(a.bounty(3)).toBe(0);
    // the sim's shutdown for the same kill only adds the XP line
    expect(a.feed({ type: 'shutdown', tick: 401, killer: 0, victim: 3, value: 120 })).toEqual([{ key: 'shutdownXp', title: '+120 XP', tone: 'gold', size: 'pop' }]);
  });

  it('own streak: On a Roll, Unstoppa-paw, Legend-dairy', () => {
    const a = new Announcer(0, 0, name);
    const titles: string[] = [];
    for (let i = 0; i < 5; i++) for (const m of a.feed(death(1000 + i * 600, 3 + (i % 3), 0))) if (m.key.startsWith('streak')) titles.push(m.title);
    expect(titles).toEqual(['On a Roll', 'Unstoppa-paw', 'Legend-dairy']);
  });

  it('assists count as takedowns; ally kills read as good', () => {
    const a = new Announcer(0, 0, name);
    a.feed(hit(100, 0, 4, 'basic'));
    const m = a.feed(death(200, 4, 1));
    expect(m.some((x) => x.tone === 'good' || x.key === 'firstBlood')).toBe(true);
    expect(a.takedowns).toBe(1);
  });

  it('combos: an ability then a basic on the same hero, and two abilities within 1 s', () => {
    const a = new Announcer(0, 0, name);
    expect(a.feed(hit(10, 0, 3, 'ability'))).toEqual([]);
    expect(a.feed(hit(30, 0, 3, 'basic'))[0]?.title).toBe('Combo x2');
    expect(a.feed(hit(50, 0, 3, 'ability'))[0]?.title).toBe('Combo x3');
    expect(a.combos).toBe(2);
    // one ability hitting two heroes on one tick is one landing
    const b = new Announcer(0, 0, name);
    b.feed(hit(10, 0, 3, 'ability'));
    expect(b.feed(hit(10, 0, 4, 'ability'))).toEqual([]);
    // minions never combo
    expect(b.feed(hit(20, 0, 20, 'basic'))).toEqual([]);
  });

  it('fun-plan events: bounty, comeback, pickups, Nine Lives', () => {
    const a = new Announcer(0, 0, name);
    expect(a.feed({ type: 'bounty', tick: 1, id: 4, value: 120 })[0]?.title).toBe('Bounty on Sage!');
    expect(a.bounty(4)).toBe(120);
    expect(a.feed({ type: 'comeback', tick: 2, team: 0 })[0]?.title).toBe('COMEBACK!');
    expect(a.feed({ type: 'comeback', tick: 3, team: 1 })[0]?.tone).toBe('bad');
    expect(a.feed({ type: 'pickupSpawn', tick: 4, index: 0, kind: 'frenzy', x: 50000, y: 40000 })[0]?.title).toBe('Frenzy Catnip in the river!');
    expect(a.feed({ type: 'pickupSpawn', tick: 4, index: 1, kind: 'snack', x: 30000, y: 40000 })).toEqual([]);
    expect(a.feed({ type: 'pickup', tick: 5, id: 0, kind: 'frenzy', team: 0 })[0]?.title).toBe('+FRENZY');
    // round 0: only the first Frenzy spawn is a banner, later ones ping the minimap
    expect(a.feed({ type: 'pickupSpawn', tick: 5, index: 0, kind: 'frenzy', x: 50000, y: 40000 })[0]?.size).toBe('ping');
    // the first Nine Lives explains itself (a banner), later ones are a callout
    const nine = a.feed({ type: 'buff', tick: 6, id: 0, buff: 'nineLives' })[0];
    expect([nine?.title, nine?.size]).toEqual(['Nine Lives', 'banner']);
    expect(a.feed({ type: 'buff', tick: 7, id: 0, buff: 'nineLives' })[0]?.size).toBe('callout');
    expect(a.pickups).toBe(1);
    // unknown events are ignored
    expect(a.feed({ type: 'somethingNew', tick: 7 })).toEqual([]);
  });

  it('XP pops merge within 8 ticks', () => {
    const x = new XpPops();
    x.add(10, 100);
    x.add(15, 104);
    expect(x.flush(105)).toEqual([]);
    x.add(40, 130);
    expect(x.flush(131)).toEqual([25]);
    expect(x.flush(140)).toEqual([40]);
    expect(x.total).toBe(65);
  });
});

describe('objective chips', () => {
  it('rookie shows each beat once, queues, and hides when done', () => {
    const root = document.createElement('div');
    const g = new Objectives(root, 'rookie');
    g.start('lane');
    g.start('minions');
    expect(g.current).toBe('lane');
    expect(root.querySelector('.pl-goal.on')?.textContent).toContain('Run to the lane!');
    g.complete('lane');
    g.update(1);
    expect(g.current).toBe('minions');
    g.update(BEAT_TTL.minions + 1);
    expect(g.current).toBeNull();
    g.start('minions');
    expect(g.current).toBeNull();
    expect(g.shown).toEqual(['lane', 'minions']);
  });
  it('lite keeps only Ultimate and Pudding; off has no chip', () => {
    const lite = new Objectives(null, 'lite');
    lite.start('lane');
    expect(lite.current).toBeNull();
    lite.start('ult');
    expect(lite.current).toBe('ult');
    const off = new Objectives(document.createElement('div'), 'off');
    off.start('ult');
    expect(off.current).toBeNull();
  });
});

describe('first-session script', () => {
  const withRookie = ['easy', 'normal', 'rookie'];
  it('match 1 Rookie (when the sim has it), 2 and 3 Easy, then the pick', () => {
    expect(difficultyFor(0, 'normal', withRookie, { rookie: {} })).toBe('rookie');
    expect(difficultyFor(0, 'normal', withRookie, {})).toBe('easy');
    expect(difficultyFor(0, 'normal', ['easy', 'normal'])).toBe('easy');
    expect(difficultyFor(1, 'normal', withRookie)).toBe('easy');
    expect(difficultyFor(2, 'normal', withRookie)).toBe('easy');
    expect(difficultyFor(3, 'normal', withRookie)).toBe('normal');
    expect(difficultyFor(5, 'rookie' as never, withRookie)).toBe('easy');
    expect(canPickDifficulty(2)).toBe(false);
    expect(pickable(withRookie)).toEqual(['easy', 'normal']);
    expect([0, 1, 2, 3].map(guideMode)).toEqual(['rookie', 'lite', 'lite', 'off']);
  });
});

describe('Treat Track', () => {
  it('fixed-order free rewards every TREAT_STEP, skipping owned ones', () => {
    expect(treatXpFor({ won: true, takedowns: 5, pudding: true })).toBe(100 + 50 + 20);
    expect(treatXpFor({ won: false, takedowns: 0, pudding: false })).toBe(60);
    const g1 = addTreatXp(freshTreats(), 170, new Set());
    expect(g1.rewards).toEqual([]);
    expect(g1.next?.id).toBe(TREAT_REWARDS[0].id);
    const g2 = addTreatXp(g1.state, 170, new Set());
    expect(g2.rewards.map((r) => r.id)).toEqual([TREAT_REWARDS[0].id]);
    expect(g2.after).toBeCloseTo(40 / TREAT_STEP);
    // the Biscuit coat (first win) is already owned: the chest skips it
    const owned = new Set(TREAT_REWARDS.slice(0, 3).map((r) => r.id).concat('coat.brutus.biscuit'));
    expect(nextReward(owned)?.id).toBe('coat.cacklejaw.spotted');
    expect(parseTreats('{"xp":-5,"chests":99}')).toEqual({ v: 1, xp: 0, chests: 0 });
    expect(parseTreats('nope')).toEqual(freshTreats());
  });
});

describe('daily quests', () => {
  it('three a day, fixed per date, at most one hero win; progress and XP', () => {
    const q = dailyQuests('2026-10-18');
    expect(q).toHaveLength(3);
    expect(new Set(q.map((x) => x.id)).size).toBe(3);
    expect(dailyQuests('2026-10-18')).toEqual(q);
    for (let d = 1; d <= 28; d++) expect(dailyQuests(`2026-11-${String(d).padStart(2, '0')}`).filter((x) => x.hero).length).toBeLessThanOrEqual(1);
    const s = freshQuests('2026-10-18');
    const r = progressQuests(s, { won: true, hero: 'sage', takedowns: 10, pudding: true, towers: 2, combos: 3 });
    expect(r.xp).toBe(QUEST_XP * r.views.filter((v) => v.fresh).length);
    // counted once
    const again = progressQuests(r.state, { won: true, hero: 'sage', takedowns: 10, pudding: true, towers: 2, combos: 3 });
    const firstDone = r.views.filter((v) => v.fresh).map((v) => v.quest.id);
    expect(again.views.filter((v) => v.fresh && firstDone.includes(v.quest.id))).toEqual([]);
    expect(parseQuests(JSON.stringify(r.state), '2026-10-19').progress).toEqual({});
  });
});

describe('touch assists', () => {
  it('lane magnet snaps a stick within 25° of the lane, not one far off', () => {
    // on the Sunny Lane river stretch (22,50 → 50,53 m), pushing east-ish
    const a = laneMagnet(30000, 51000, (10 * Math.PI) / 180);
    const lane = Math.atan2(3000, 28000);
    expect(a).toBeCloseTo(lane, 5);
    expect(laneMagnet(30000, 51000, Math.PI / 2)).toBe(Math.PI / 2);
    // far from any lane: unchanged
    expect(laneMagnet(30000, 30000, 0.1)).toBe(0.1);
  });
  it('map edge and enemy fountain stop the stick', () => {
    expect(edgeGoal(99600, 59600, 101000, 61000, 1)).toBeNull();
    const g = edgeGoal(90000, 30000, mirrorX(FOUNTAIN.x), FOUNTAIN.y, 0);
    expect(g).not.toBeNull();
    expect(Math.hypot(g!.x - mirrorX(FOUNTAIN.x), g!.y - FOUNTAIN.y)).toBeGreaterThanOrEqual(FOUNTAIN.radius);
    const inside = edgeGoal(50000, 30000, 52000, 30000, 0)!;
    expect(inside.x).toBeLessThan(MAP.width);
  });
  it('auto-attack picks the weakest minion in range, then a hero', () => {
    const me: Unit = { id: 0, kind: 'hero', team: 0, x: 0, y: 0, hp: 100, maxHp: 100, state: 'idle' };
    const u = (id: number, kind: Unit['kind'], x: number, hp: number, team = 1): Unit => ({ id, kind, team, x, y: 0, hp, maxHp: 100, state: 'idle' });
    expect(autoAttackTarget([me, u(3, 'hero', 1000, 50), u(10, 'minion', 1500, 80), u(11, 'minion', 1200, 30)], me, 0, 1800)).toBe(11);
    expect(autoAttackTarget([me, u(3, 'hero', 1000, 50), u(10, 'minion', 2500, 80)], me, 0, 1800)).toBe(3);
    expect(autoAttackTarget([me, u(12, 'minion', 500, 10, 0)], me, 0, 1800)).toBeNull();
  });
});

describe('HUD, music, results copy', () => {
  it('Sunset countdown hidden until a minute before', () => {
    expect(phaseLine({ phase: 'play', nextPhaseIn: 61 * 30 })).toBe('');
    expect(phaseLine({ phase: 'play', nextPhaseIn: 59 * 30 })).toBe('Sunset in 0:59');
    expect(phaseLine({ phase: 'sunset', nextPhaseIn: 120 * 30 })).toBe('Sudden Death in 2:00');
  });
  it('music intensity layers', () => {
    const base = { enemyNear: false, fight2v2: false, sunset: false, suddenDeath: false, coreUnderAttack: false };
    expect(intensityOf(base)).toBe(0);
    expect(intensityOf({ ...base, enemyNear: true })).toBe(1);
    expect(intensityOf({ ...base, fight2v2: true })).toBe(2);
    expect(intensityOf({ ...base, sunset: true })).toBe(2);
    expect(intensityOf({ ...base, coreUnderAttack: true })).toBe(3);
  });
  it('host volumes: music and sfx apart, clamped, a missing one kept', () => {
    const x = new Sfx();
    expect(x.musicVolume).toBe(1);
    x.setVolumes({ music: 0.25, sfx: 0.5 });
    expect(x.musicVolume).toBe(0.25);
    x.setVolumes({ sfx: 0 });
    expect(x.musicVolume).toBe(0.25);
    x.setVolumes({ music: 7 });
    expect(x.musicVolume).toBe(1);
    x.setVolumes({ music: Number.NaN });
    expect(x.musicVolume).toBe(1);
  });
  it('"jump into a fight" only with no hero damage', () => {
    expect(resultLine({ won: true, kills: 0, teamKills: [5, 3], difficulty: 'easy', heroDamage: 0 })).toMatch(/jump into a fight/);
    expect(resultLine({ won: true, kills: 0, teamKills: [5, 3], difficulty: 'easy', heroDamage: 900 })).not.toMatch(/jump into a fight/);
  });
});
