import { beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CAT, Modifier } from '../types';
import { kartLookFor } from '../items-ai';
import { PINK_PAW_CATS, pinkPawCatSpec } from '../share/pinkpaw/pink-paw';
import { cupById, CUP_POINTS } from '../content/cups';
import { save } from '../core/app/save';
import { MODES_EN } from '../ui/strings/modes.en';
import { applyComeback, buildCupField, cupOutcome, EASE_NOTCH, gridOrder, meanAiSkill, newCup, playerIndex, raceField, raceModifiers, raceSeed, scoreRace, simClass, standings } from './gp/cup';
import { DEFAULT_MODES, EASE_MAX, migrateModes, modesSlot } from './store';
import { isPlainVisit } from './boot';
import { defaultRival, defaultUnlocks } from './hooks';
import { leadMark } from './hud/mode-hud';

const player = { name: 'You', cat: DEFAULT_CAT, kart: kartLookFor(0) };
const loc = (search = '', hash = '', pathname = '/') => ({ search, hash, pathname });

/** Rank the grid by slot order: slot 0 wins, slot 7 is last (deterministic places for the tests). */
const placesBySlot = (order: number[] = [0, 1, 2, 3, 4, 5, 6, 7]) => order.map((_, slot) => order.indexOf(slot) + 1);

describe('grand prix rules', () => {
  it('builds 8 cats, one player, the same 7 Pink Paw cats for the whole cup', () => {
    const run = newCup('kibble', 1, 42, player);
    expect(run.field.length).toBe(8);
    expect(run.field.filter((r) => r.player).length).toBe(1);
    expect(run.field.slice(1).every((r) => r.ai && r.pinkPawId)).toBe(true);
    expect(newCup('kibble', 1, 42, player).field.map((r) => r.name)).toEqual(run.field.map((r) => r.name));
  });

  it('never puts the roster cat the player drives in the field as an AI', () => {
    const c = PINK_PAW_CATS[0];
    for (let seed = 0; seed < 16; seed++) {
      const field = buildCupField(seed, 0, { ...player, name: c.name, cat: pinkPawCatSpec(c), pinkPawId: c.id });
      expect(field.filter((r) => r.pinkPawId === c.id).length).toBe(1);
      expect(new Set(field.map((r) => r.name)).size).toBe(8);
    }
  });

  it('race 1 grid puts the player 6th; later grids are reverse standings', () => {
    const run = newCup('kibble', 0, 7, player);
    const g1 = gridOrder(run);
    expect(g1[5]).toBe(playerIndex(run));
    expect(new Set(g1).size).toBe(8);
    const { grid } = raceField(run);
    scoreRace(run, grid, placesBySlot());
    const s = standings(run);
    expect(gridOrder(run)).toEqual(s.slice().reverse());
    // the leader starts at the back
    expect(gridOrder(run)[7]).toBe(s[0]);
  });

  it('scores 15/12/10/8/6/4/2/1 and breaks ties by the better place in the last race', () => {
    const run = newCup('catnip', 2, 9, player);
    const { grid } = raceField(run);
    const gained = scoreRace(run, grid, placesBySlot());
    expect(grid.map((fi) => gained[fi])).toEqual([...CUP_POINTS]);
    expect(run.race).toBe(1);
    // two cats level on points: the one placed better in the last race ranks higher
    run.points = [10, 10, 0, 0, 0, 0, 0, 0];
    run.lastPlaces = [5, 2, 1, 3, 4, 6, 7, 8];
    expect(standings(run).slice(0, 2)).toEqual([1, 0]);
  });

  it('four races decide the trophy', () => {
    const run = newCup('kibble', 0, 3, player);
    for (let r = 0; r < 4; r++) {
      const { grid, slot } = raceField(run);
      // the player wins every race
      const order = [slot, ...grid.map((_, s) => s).filter((s) => s !== slot)];
      scoreRace(run, grid, placesBySlot(order));
    }
    expect(run.race).toBe(4);
    expect(cupOutcome(run)).toEqual({ place: 1, trophy: 1, points: 60 });
  });

  it('seeds differ per race and repeat per cup; mirror applies on top of the cup', () => {
    expect(raceSeed(5, 0)).toBe(raceSeed(5, 0));
    expect(new Set([0, 1, 2, 3].map((r) => raceSeed(5, r))).size).toBe(4);
    const catnip = cupById('catnip')!;
    expect(raceModifiers(catnip, 0, 0)).toBe(0);
    expect(raceModifiers(catnip, 2, 0) & Modifier.Mirror).toBeTruthy();
    expect(raceModifiers(catnip, 0, 3) & Modifier.Mirror).toBeTruthy();
    expect(simClass(3)).toBe(2);
  });

  it('the rival is the best AI that was not the last rival', () => {
    const run = newCup('kibble', 2, 11, player);
    const info = run.field.map((r) => ({ name: r.name, cat: r.cat, kart: r.kart, ai: r.ai }));
    const a = defaultRival(info, '');
    expect(info[a].ai).toBeTruthy();
    const b = defaultRival(info, info[a].name);
    expect(b).not.toBe(a);
    expect(info.every((r) => !r.ai || r.ai.skill <= info[a].ai!.skill)).toBe(true);
  });
});

describe('battle leader marker (F14)', () => {
  it('in view: over the kart, no arrow; off screen or behind: clamped to the edge, pointing out', () => {
    expect(leadMark(0, 0, false, 400, 800)).toEqual({ x: 200, y: 400, angle: null });
    const right = leadMark(3, 0, false, 400, 800);
    expect(right.x).toBeCloseTo(400 - 44, 5);
    expect(right.angle).toBeCloseTo(0, 5);
    const up = leadMark(0, 4, false, 400, 800);
    expect(up.y).toBeCloseTo(44, 5);
    expect(up.angle).toBeCloseTo(-Math.PI / 2, 5);
    // behind the camera, straight back: the arrow points down (turn around)
    const back = leadMark(0, 0.2, true, 400, 800);
    expect(back.angle).toBeCloseTo(Math.PI / 2, 5);
    expect(back.y).toBeCloseTo(800 - 44, 5);
    // every edge mark stays inside the frame
    for (const [x, y, b] of [[5, 5, false], [-5, 2, false], [0.5, -9, false], [0.3, 0.3, true]] as const) {
      const m = leadMark(x, y, b, 390, 844);
      expect(m.x).toBeGreaterThanOrEqual(43.9);
      expect(m.x).toBeLessThanOrEqual(390 - 43.9);
      expect(m.y).toBeGreaterThanOrEqual(43.9);
      expect(m.y).toBeLessThanOrEqual(844 - 43.9);
    }
  });
});

describe('grand prix comeback (F13)', () => {
  /** Race the cup's next race with the player at `place` (1-based); the rest in slot order. */
  const raceAt = (run: ReturnType<typeof newCup>, place: number) => {
    const { grid, slot } = raceField(run);
    const others = grid.map((_, s) => s).filter((s) => s !== slot);
    const order = [...others.slice(0, place - 1), slot, ...others.slice(place - 1)];
    scoreRace(run, grid, placesBySlot(order));
  };

  it('8th and far back eases the next race by one notch; the field itself keeps its skill', () => {
    const run = newCup('kibble', 1, 21, player);
    const before = meanAiSkill(run);
    const own = run.field.map((r) => r.ai?.skill);
    raceAt(run, 8);
    expect(applyComeback(run, 8, 12.4)).toBe('eased');
    expect(run.ease).toBe(1);
    const eased = meanAiSkill(run);
    expect(eased).toBeLessThan(before);
    expect(before - eased).toBeCloseTo(EASE_NOTCH, 2);
    expect(run.field.map((r) => r.ai?.skill)).toEqual(own);
    // a second 8th-8th eases once more, then never past EASE_MAX
    raceAt(run, 8);
    applyComeback(run, 8, null);
    expect(run.ease).toBe(2);
    applyComeback(run, 7, 30);
    expect(run.ease).toBe(EASE_MAX);
    expect(meanAiSkill(run)).toBeLessThan(eased);
  });

  it('close behind, or mid-pack, never eases', () => {
    const run = newCup('kibble', 0, 4, player);
    expect(applyComeback(run, 8, 7.9)).toBe('');
    expect(applyComeback(run, 5, 20)).toBe('');
    expect(run.ease).toBe(0);
  });

  it('a win restores the full field', () => {
    const run = newCup('catnip', 2, 8, player);
    const full = meanAiSkill(run);
    applyComeback(run, 6, 9);
    expect(run.ease).toBe(1);
    expect(applyComeback(run, 2, 0.5)).toBe('');
    expect(run.ease).toBe(1);
    expect(applyComeback(run, 1, 0)).toBe('restored');
    expect(run.ease).toBe(0);
    expect(meanAiSkill(run)).toBeCloseTo(full, 6);
    // a win with nothing eased says nothing
    expect(applyComeback(run, 1, 0)).toBe('');
  });

  it('a saved cup keeps its ease; an old save without one starts at 0', () => {
    const run = newCup('kibble', 1, 5, player);
    applyComeback(run, 8, 10);
    expect(migrateModes({ cup: run }).cup?.ease).toBe(1);
    expect(migrateModes({ cup: run }).cup?.easeNews).toBe('eased');
    const { ease: _e, easeNews: _n, ...old } = run;
    expect(migrateModes({ cup: old }).cup?.ease).toBe(0);
  });
});

describe('modes save', () => {
  it('per-mode memory: an old save counts a mode as set when the player already raced it', () => {
    const fresh = migrateModes({});
    expect(Object.values(fresh.memo).every((m) => !m.set)).toBe(true);
    const old = migrateModes({ cupsDone: { 'kibble:0': 1 }, tt: { 'kitchen:0': { best: 50, simVersion: 10, splits: [], medal: 0 } }, battle: { played: 2, wins: 0 }, last: { quickTrack: 'yarn' } });
    expect([old.memo.gp.set, old.memo.tt.set, old.memo.battle.set, old.memo.race.set]).toEqual([true, true, true, true]);
    // its own output reads back the same (a set memo stays set, an unset one unset)
    const m = migrateModes({ memo: { gp: { cat: 'tofu', set: true } } });
    expect([m.memo.gp, m.memo.race.set]).toEqual([{ cat: 'tofu', set: true }, false]);
    expect(migrateModes(JSON.parse(JSON.stringify(m)))).toEqual(m);
    expect(migrateModes({ last: { quickWild: 'night' } }).last.quickWild).toBe('night');
    expect(migrateModes({ last: { quickWild: 'lava' } }).last.quickWild).toBe('none');
  });

  it('turns anything into a valid shape and accepts its own output', () => {
    for (const raw of [undefined, null, 3, 'x', [], { cup: { cupId: 'nope' } }, { last: { cls: 9, ttTrack: 'moon' }, look: { body: 77 } }]) {
      const m = migrateModes(raw);
      expect(m.v).toBe(1);
      expect([0, 1, 2, 3]).toContain(m.last.cls);
      expect(m.look.body).toBeLessThanOrEqual(5);
      expect(m.last.ttTrack).toBe(raw && typeof raw === 'object' && 'last' in raw ? 'kitchen' : DEFAULT_MODES.last.ttTrack);
      expect(migrateModes(JSON.parse(JSON.stringify(m)))).toEqual(m);
    }
  });

  it('keeps a valid cup in progress and drops a broken one', () => {
    const run = newCup('kibble', 1, 5, player);
    expect(migrateModes({ cup: run }).cup?.field.length).toBe(8);
    expect(migrateModes({ cup: { ...run, field: run.field.slice(0, 7) } }).cup).toBeNull();
  });
});

describe('unlocks (default rules)', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
    save.reset();
  });

  it('battle after 3 races, classes from the shell progress or cups, Catnip Cup after a Kibble trophy', () => {
    const p = { races: 0, unlocked: 0 };
    const u = defaultUnlocks(() => p);
    expect(u.lock('mode', 'battle')).toBeTruthy();
    expect(u.lock('mode', 'tt')).toBeNull();
    expect(u.lock('class', '1')).toBeTruthy();
    expect(u.lock('cup', 'kibble')).toBeNull();
    expect(u.lock('cup', 'catnip')).toBeTruthy();
    expect(u.lock('body', '0')).toBeNull();
    expect(u.lock('body', '4')).toBeTruthy();
    p.races = 3;
    p.unlocked = 1;
    expect(u.lock('mode', 'battle')).toBeNull();
    expect(u.lock('class', '1')).toBeNull();
    expect(u.lock('class', '2')).toBeTruthy();
    modesSlot().update((s) => (s.trophies['kibble:1'] = 3));
    expect(u.lock('cup', 'catnip')).toBeNull();
    expect(u.lock('class', '2')).toBeNull();
    expect(u.lock('class', '3')).toBeTruthy();
    modesSlot().update((s) => (s.trophies['kibble:2'] = 1));
    expect(u.lock('class', '3')).toBeNull();
  });
});

describe('boot routing', () => {
  it('a plain visit gets the title; deep links and QA routes go straight to the race', () => {
    expect(isPlainVisit(loc())).toBe(true);
    expect(isPlainVisit(loc('?bot=1&speed=8'))).toBe(true);
    expect(isPlainVisit(loc('?lang=xx'))).toBe(true);
    expect(isPlainVisit(loc('?seed=3'))).toBe(false);
    expect(isPlainVisit(loc('?track=rooftops'))).toBe(false);
    expect(isPlainVisit(loc('?make'))).toBe(false);
    expect(isPlainVisit(loc('?daily=1'))).toBe(false);
    expect(isPlainVisit(loc('', '#g=abc&n=Mia'))).toBe(false);
    expect(isPlainVisit(loc('', '', '/meow-race/d/3'))).toBe(false);
    expect(isPlainVisit(loc('', '', '/meow-race/make'))).toBe(false);
  });
});

describe('strings', () => {
  it("every t('…') in src/modes has an English entry", () => {
    const missing: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts') && !p.endsWith('.test.ts'))
          for (const m of readFileSync(p, 'utf8').matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) {
            const k = m[1].replace(/\\'/g, "'");
            if (!(k in MODES_EN)) missing.push(`${f}: ${k}`);
          }
      }
    };
    walk(__dirname);
    expect(missing).toEqual([]);
  });
});
