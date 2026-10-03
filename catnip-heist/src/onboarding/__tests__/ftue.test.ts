import { describe, expect, it } from 'vitest';
import { getLevel, LEVEL_IDS } from '../../levels';
import { initSim, stepSim } from '../../sim';
import { NO_INPUT, type SimState } from '../../types';
import { FTUE_KEY, FtueStore, parseFtue, type FtueStorage } from '../ftue-store';
import { briefFor } from '../brief';
import { ROUTE_FAILS, ROUTE_IDLE_TICKS, RouteHintTracker } from '../hint-tracker';
import { RewindFunnel } from '../rewind';

function mem(initial: Record<string, string> = {}): FtueStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

describe('FTUE store', () => {
  it('remembers briefs per level and survives a reload', () => {
    const storage = mem();
    const a = new FtueStore(storage);
    expect(a.briefSeen('heist-01')).toBe(false);
    a.markBriefSeen('heist-01');
    a.markBriefSeen('heist-01');
    expect(new FtueStore(storage).briefSeen('heist-01')).toBe(true);
    expect(new FtueStore(storage).briefSeen('heist-02')).toBe(false);
    expect(JSON.parse(storage.map.get(FTUE_KEY)!)).toMatchObject({ v: 1, briefs: ['heist-01'] });
  });

  it('starts fresh on bad or old data and works when storage throws', () => {
    expect(parseFtue('{nope').briefs).toEqual([]);
    expect(parseFtue(JSON.stringify({ v: 0, briefs: ['heist-01'] })).briefs).toEqual([]);
    expect(parseFtue(JSON.stringify({ v: 1, briefs: ['heist-01', 3, 'heist-01'], routeTaps: -2 }))).toEqual({ v: 1, briefs: ['heist-01'], routeTaps: 0, rewinds: 0 });
    const broken: FtueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const s = new FtueStore(broken);
    s.markBriefSeen('heist-02');
    expect(s.briefSeen('heist-02')).toBe(true);
    s.noteRewind();
    expect(s.novice).toBe(false);
    expect(new FtueStore(null).briefSeen('heist-02')).toBe(false);
  });
});

describe('brief card content', () => {
  it('every level has a title, an intro and a plan; levels 1-3 mention the rewind', () => {
    LEVEL_IDS.forEach((id, i) => {
      const b = briefFor(getLevel(id));
      expect(b.kicker).toBe(`Heist ${i + 1} of ${LEVEL_IDS.length}`);
      expect(b.title.length).toBeGreaterThan(3);
      expect(b.title).not.toMatch(/^Heist \d/);
      expect(b.intro.length).toBeGreaterThan(10);
      expect(b.steps.length).toBeGreaterThan(0);
      expect(b.steps.length).toBeLessThanOrEqual(5);
      expect(b.steps.join(' ')).not.toContain('{cat}');
      expect(b.tips.some((t) => /route/i.test(t))).toBe(true);
      expect(b.tips.some((t) => /rewind/i.test(t))).toBe(i < 3);
      expect(b.controls).toBe(i < 2);
    });
  });
});

describe('route hint triggers', () => {
  const level = getLevel('heist-01');
  const idle = (s: SimState, n: number, t: RouteHintTracker) => {
    let change = null;
    for (let i = 0; i < n; i++) {
      s = stepSim(level, s, NO_INPUT);
      change = t.observe(level, s) ?? change;
    }
    return { s, change };
  };

  it('shows the route after 20 s of sim time without progress, once', () => {
    const t = new RouteHintTracker();
    const s0 = initSim(level, 1, ['bob', 'oreo']);
    t.reset(level, s0);
    const a = idle(s0, ROUTE_IDLE_TICKS - 1, t);
    expect(a.change).toBeNull();
    const b = idle(a.s, 1, t);
    expect(b.change).toEqual({ type: 'show', trigger: 'idle' });
    expect(t.active).toBe('idle');
    expect(idle(b.s, 60, t).change).toBeNull();
  });

  it('shows the route after two detections on one objective, and is done when the objective moves on', () => {
    const t = new RouteHintTracker();
    const s0 = initSim(level, 1, ['bob', 'oreo']);
    t.reset(level, s0);
    const spotted = (s: SimState): SimState => ({ ...s, tick: s.tick + 1, events: [{ type: 'SPOTTED', cat: 0 }] });
    let s = spotted(s0);
    expect(t.observe(level, s)).toBeNull();
    s = spotted(s);
    expect(t.observe(level, s)).toEqual({ type: 'show', trigger: 'fails' });
    expect(ROUTE_FAILS).toBe(2);
    // The key is taken: the stage moves on and the hint is done.
    const later = { ...s, tick: s.tick + 1, events: [], keyTaken: true, cats: [{ ...s.cats[0], pos: { x: 30 * 16 + 8, y: 8 * 16 + 8 } }, { ...s.cats[1], pos: { x: 31 * 16 + 8, y: 8 * 16 + 8 } }] } as SimState;
    expect(t.observe(level, later)).toEqual({ type: 'done', trigger: 'fails' });
    expect(t.active).toBeNull();
  });

  it('a tap shows it at once and a second tap hides it; levels already won only show on a tap', () => {
    const t = new RouteHintTracker({ auto: false });
    const s0 = initSim(level, 1, ['bob', 'oreo']);
    t.reset(level, s0);
    expect(idle(s0, ROUTE_IDLE_TICKS + 30, t).change).toBeNull();
    expect(t.tap()).toEqual({ type: 'show', trigger: 'tap' });
    expect(t.active).toBe('tap');
    expect(t.tap()).toBeNull();
    expect(t.active).toBeNull();
  });

  it('progress (a door opening, a checkpoint) restarts the idle clock', () => {
    const t = new RouteHintTracker();
    const s0 = initSim(level, 1, ['bob', 'oreo']);
    t.reset(level, s0);
    let s = idle(s0, ROUTE_IDLE_TICKS - 10, t).s;
    s = { ...s, tick: s.tick + 1, events: [{ type: 'DOOR', id: 'd', open: true }] };
    expect(t.observe(level, s)).toBeNull();
    expect(idle(s, ROUTE_IDLE_TICKS - 5, t).change).toBeNull();
  });
});

describe('RewindFunnel (rewind analytics, once per run)', () => {
  it('sends shown on the first offer and done on the first rewind only, so done never exceeds shown', () => {
    const f = new RewindFunnel();
    let shown = 0;
    let done = 0;
    // Three detections and three rewinds in one run.
    for (let i = 0; i < 3; i++) {
      if (f.offered()) shown++;
      if (f.rewound()) done++;
    }
    expect([shown, done]).toEqual([1, 1]);
    // An offer that was never used: shown 1, done 0.
    f.reset();
    expect(f.offered()).toBe(true);
    expect(f.offered()).toBe(false);
    f.reset();
    // No rewind without an offer in this run.
    expect(f.rewound()).toBe(false);
  });
});
