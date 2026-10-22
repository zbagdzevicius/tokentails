import { describe, expect, it } from 'vitest';
import { BoostSource, type KartState, type RaceEvent, type RaceResult, type RaceState } from '../types';
import { BOOST, DRIFT } from '../tuning';
import { PhotoFinishJudge, PHOTO_WAIT_TICKS, fmtMargin } from './photo-finish';
import { DODGE, DodgeWatcher, projSamples } from './dodge';
import { DUEL, DramaCalls, FastestLap, GapSmoother, PassZips, duelGlow, duelTension, fmtGap, raceGaps, type Zip } from './duel';
import { BoostChain, CHAIN, boostChainTally } from './boost-chain';
import { aheadOf, lipMatrix, lipPulse, lipsOf } from './vfx/paw-rings';
import { Matrix4, Vector3 } from 'three';
import { buildTrack } from '../core/track/build';
import { KITCHEN } from '../core/track/tracks/kitchen';
import { stuntLab } from '../test/fixtures';
import { THEMES } from '../core/track/themes';
import { chordTones, degreeSemis, MINOR, musicMix, SONGS, songFor } from './audio/music';
import { cuesFor, VoiceBudget } from './audio/sfx';
import { engineParams } from './audio/engine';
import { TimeWarp } from './time';
import { DPR_MIN, DprGovernor, defaultTier, TIERS } from './perf/quality';
import { overtakeCallout } from './vfx/popups';
import { boostColor } from './vfx/kart-fx';

const ev = (type: RaceEvent['type'], kart: number, a?: number, b?: number): RaceEvent => ({ tick: 300, type, kart, a, b });

describe('adaptive music mix (GDD 10)', () => {
  it('5th–8th is the full band plus lead', () => {
    for (const p of [5, 6, 7, 8]) {
      const m = musicMix('race', p, false, false);
      expect(m.kick).toBe(1);
      expect(m.snare).toBe(1);
      expect(m.lead).toBe(1);
      expect(m.heart).toBe(0);
    }
  });
  it('2nd–4th drops the lead and opens the arpeggio filter 800 Hz → 4 kHz', () => {
    expect(musicMix('race', 4, false, false).arpCut).toBe(800);
    expect(musicMix('race', 3, false, false).arpCut).toBe(2400);
    expect(musicMix('race', 2, false, false).arpCut).toBe(4000);
    expect(musicMix('race', 3, false, false).lead).toBe(0);
  });
  it('1st drops the drums to hats + heartbeat and lifts the lead an octave', () => {
    const m = musicMix('race', 1, false, false);
    expect(m.kick).toBe(0);
    expect(m.snare).toBe(0);
    expect(m.hats).toBe(1);
    expect(m.heart).toBe(1);
    expect(m.leadUp).toBe(12);
  });
  it('the closing stretch of the final lap doubles the hats', () => {
    expect(musicMix('race', 5, true, true).hats16).toBe(true);
    expect(musicMix('race', 5, true, false).hats16).toBe(false);
    expect(musicMix('race', 5, false, true).hats16).toBe(false);
  });
  it('countdown is drone + heartbeat only; off is silent', () => {
    const pre = musicMix('pre', 6, false, false);
    expect(pre.kick + pre.snare + pre.lead + pre.arp).toBe(0);
    expect(pre.heart).toBeGreaterThan(0);
    const off = musicMix('off', 1, true, true);
    expect(Object.values(off).filter((v) => typeof v === 'number' && v > 0 && v !== off.arpCut).length).toBe(0);
  });
  it('every theme has its own song with sane patterns', () => {
    expect(new Set(SONGS.map((s) => s.root)).size).toBe(SONGS.length);
    for (let t = 0; t < 4; t++) {
      const s = songFor(t);
      expect(s.bass).toHaveLength(16);
      expect(s.arp).toHaveLength(16);
      expect(s.lead).toHaveLength(32);
      expect(s.prog).toHaveLength(4);
      for (const i of s.arp) expect(i).toBeLessThan(6);
    }
  });
  it('chords are diatonic triads', () => {
    expect(degreeSemis(MINOR, 0)).toBe(0);
    expect(degreeSemis(MINOR, 9)).toBe(15);
    const rooftops = songFor(1);
    expect(chordTones(rooftops, 0).slice(0, 3)).toEqual([0, 3, 7]); // A minor
    expect(chordTones(rooftops, 1).slice(0, 3)).toEqual([8, 12, 15]); // F major
  });
});

describe('sfx cue table', () => {
  const me = 5;
  it('only the player hears its own drift, turbo and item cues', () => {
    expect(cuesFor(ev('miniTurbo', me, 3), me)[0].id).toBe('turbo');
    expect(cuesFor(ev('miniTurbo', 2, 3), me)).toEqual([]);
    expect(cuesFor(ev('driftTier', me, 2), me)[0].n).toBe(2);
  });
  it('global countdown and go always play', () => {
    expect(cuesFor(ev('countdown', -1, 3), me)[0].id).toBe('count');
    expect(cuesFor(ev('go', -1), me)[0].id).toBe('go');
  });
  it('hits: hiss when you are hit, a confirm when you land one', () => {
    expect(cuesFor(ev('hit', me, 0, 2), me)[0].id).toBe('hit');
    expect(cuesFor(ev('hit', 2, 0, me), me)[0].id).toBe('hitConfirm');
    expect(cuesFor(ev('hit', 2, 0, 3), me)).toEqual([]);
  });
  it('overtakes: trill when you pass, yowl when a rival passes you', () => {
    expect(cuesFor(ev('overtake', me, 4, 2), me)[0].id).toBe('trill');
    expect(cuesFor(ev('overtake', 2, 5, me), me)[0].id).toBe('yowl');
  });
  it('finish fanfare depends on the place', () => {
    expect(cuesFor(ev('finish', me, 1), me)[0].id).toBe('win');
    expect(cuesFor(ev('finish', me, 3), me)[0].id).toBe('podium');
    expect(cuesFor(ev('finish', me, 6), me)[0].id).toBe('finish');
  });
  it('slipstream and catnip boosts have their own cue', () => {
    expect(cuesFor(ev('boost', me, BoostSource.Slipstream), me)[0].id).toBe('slipstream');
    expect(cuesFor(ev('boost', me, BoostSource.Pad), me)).toEqual([]);
  });
});

describe('voice budget (24 voices)', () => {
  // iteration 2 (audio-ui): priority 3 no longer passes the cap; it has reserved headroom instead (audio/audio.test.ts)
  it('drops low-priority cues when full and keeps room for priority 3', () => {
    const b = new VoiceBudget(24);
    let n = 0;
    while (b.admit(0, 1, 1)) n++;
    expect(n).toBeLessThan(24);
    expect(b.admit(0.1, 3, 1)).toBe(true);
    // voices expire
    expect(b.admit(2, 1, 1)).toBe(true);
    expect(b.active).toBe(1);
  });
});

describe('engine purr mapping', () => {
  const k = { driftDir: 0, driftTier: 0, boostTicks: 0, air: 0, spinTicks: 0 };
  it('maps rpm to 70–240 Hz and the low-pass to 600–3,200 Hz', () => {
    expect(engineParams(0, k, true).hz).toBe(70);
    expect(engineParams(1, k, true).hz).toBe(240);
    expect(engineParams(0, k, true).cutoff).toBe(600);
    expect(engineParams(1, k, true).cutoff).toBe(3200);
    expect(engineParams(1, k, true).purrHz).toBe(28);
  });
  it('drift adds squeal and a whine that steps per tier; silent when not running', () => {
    const d1 = engineParams(0.8, { ...k, driftDir: 1, driftTier: 1 }, true);
    const d3 = engineParams(0.8, { ...k, driftDir: 1, driftTier: 3 }, true);
    expect(d1.squeal).toBeGreaterThan(0);
    expect(d3.whine).toBeGreaterThan(d1.whine);
    expect(engineParams(0.8, { ...k, driftDir: 1 }, false).gain).toBe(0);
  });
});

describe('time warp', () => {
  it('hit-stop holds the scale for its duration, then returns to 1', () => {
    const w = new TimeWarp();
    w.hitStop(0.1, 0.05);
    expect(w.scale(0.016)).toBe(0.05);
    for (let i = 0; i < 10; i++) w.scale(0.016);
    expect(w.scale(0.016)).toBe(1);
  });
  it('slow-mo eases back to real time', () => {
    const w = new TimeWarp();
    w.slowMo(1, 0.3);
    const first = w.scale(0.01);
    expect(first).toBeLessThan(0.35);
    let last = first;
    for (let i = 0; i < 99; i++) last = w.scale(0.01);
    expect(last).toBeGreaterThan(0.95);
  });
  it('disabled warp is always 1 (e2e speed runs)', () => {
    const w = new TimeWarp();
    w.enabled = false;
    w.hitStop(1, 0);
    expect(w.scale(0.016)).toBe(1);
  });
});

describe('quality auto-scaler', () => {
  it('steps DPR down after 2 slow windows and back up after 10 fast ones', () => {
    const g = new DprGovernor(1.5, 3);
    for (let i = 0; i < 2 * 31; i++) g.sample(1 / 30);
    expect(g.dpr).toBe(1.25);
    for (let i = 0; i < 10 * 60 + 5; i++) g.sample(1 / 60);
    expect(g.dpr).toBe(1.5);
  });
  it('counts slow windows at the floor (feeds the tier drop)', () => {
    const g = new DprGovernor(DPR_MIN, 2);
    for (let i = 0; i < 3 * 21; i++) g.sample(1 / 20);
    expect(g.floorSlow).toBe(3);
  });
  it('phones start mid, desktop high, ?quality= forces', () => {
    expect(defaultTier({ isIOS: true, isAndroid: false, dpr: 3, touch: true })).toBe('mid');
    expect(defaultTier({ isIOS: false, isAndroid: false, dpr: 1, touch: false })).toBe('high');
    expect(defaultTier({ isIOS: false, isAndroid: false, dpr: 1, touch: false }, '?quality=low')).toBe('low');
    expect(TIERS.low.outlineDist).toBe(0);
  });
});

describe('juice helpers', () => {
  it('overtake chains escalate', () => {
    expect(overtakeCallout(1, 5).text).toBe('P5');
    expect(overtakeCallout(2, 4).text).toBe('DOUBLE!');
    expect(overtakeCallout(3, 3).text).toBe('TRIPLE!');
    expect(overtakeCallout(5, 2).text).toBe('MEOWTASTIC!');
    expect(overtakeCallout(1, 1).text).toBe('P1!');
  });
  it('mini-turbo flames take the drift tier colour', () => {
    for (let t = 1; t <= 3; t++) expect(boostColor(BoostSource.MiniTurbo, t, THEMES[0])).toBe(DRIFT.colors[t - 1]);
    expect(boostColor(BoostSource.Pad, 1, THEMES[1])).toBe(THEMES[1].pad);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// iteration 4 (juice lane): the photo finish, DODGED!, the final-lap duel, boost chains
// ---------------------------------------------------------------------------------------------------------------------

type Row = RaceResult['places'][number];
const row = (kart: number, place: number, time: number | null, gap?: number | null): Row => ({ kart, name: `c${kart}`, place, time, bestLap: null, ...(time == null ? { gap } : {}) });
const res = (...places: Row[]) => ({ places });

/** Step the judge from `t0` every tick with `at(tick)` until it decides (or 40 ticks). */
function judgeRun(t0: number, me: number, place: number, at: (tick: number) => ReturnType<typeof res>) {
  const j = new PhotoFinishJudge();
  j.begin(t0);
  let certainAt = -1;
  for (let tk = t0; tk < t0 + 40; tk++) {
    const r = j.step(tk, at(tk), me, place);
    if (r.certain) certainAt = tk;
    if (r.decided) return { call: r.decided, at: tk, certainAt, again: j.step(tk + 1, at(tk + 1), me, place) };
  }
  throw new Error('the judge never decided');
}

describe('photo finish (F4)', () => {
  it('a cat just ahead: certain at once, decided once the margin has elapsed, lost by 0.07 s', () => {
    const r = judgeRun(1000, 5, 2, () => res(row(1, 1, 80), row(5, 2, 80.07), row(3, 3, null, 1.5)));
    expect(r.certainAt).toBe(1000);
    expect(r.call.kind).toBe('photo');
    if (r.call.kind !== 'photo') return;
    expect(r.call.margin.won).toBe(false);
    expect(fmtMargin(r.call.margin.margin)).toBe('0.07');
    // decided as soon as no cat still racing could be closer (0.07 s = 4.2 ticks), never later than 18 ticks
    expect(r.at - 1000).toBeGreaterThanOrEqual(5);
    expect(r.at - 1000).toBeLessThanOrEqual(PHOTO_WAIT_TICKS);
    // once only
    expect(r.again.decided).toBeNull();
    expect(r.again.certain).toBe(false);
  });

  it('a cat just behind: the judge waits for it to cross, then a win by a whisker', () => {
    // the player crosses at 80.00 (tick 1000); the second cat crosses 0.1 s later (tick 1006)
    const r = judgeRun(1000, 5, 1, (tk) => (tk < 1006 ? res(row(5, 1, 80), row(2, 2, null, 0.1)) : res(row(5, 1, 80), row(2, 2, 80.1))));
    expect(r.certainAt).toBe(1006);
    expect(r.call.kind).toBe('photo');
    if (r.call.kind !== 'photo') return;
    expect(r.call.margin).toMatchObject({ other: 2, won: true });
    expect(r.call.margin.margin).toBeCloseTo(0.1, 9);
    expect(r.at).toBe(1006);
  });

  it('a lapped kart never counts; a clear win shows WON BY with the projection', () => {
    // a lapped cat (gap −1) is right behind on the road; the real runner-up is 2 s back and still racing
    const r = judgeRun(1000, 5, 1, () => res(row(5, 1, 80), row(2, 2, null, 2.04), row(3, 3, null, -1)));
    expect(r.certainAt).toBe(-1);
    expect(r.at - 1000).toBe(PHOTO_WAIT_TICKS);
    expect(r.call.kind).toBe('won');
    if (r.call.kind !== 'won') return;
    expect(r.call.margin).toMatchObject({ other: 2, won: true, projected: true });
    expect(fmtMargin(r.call.margin.margin)).toBe('2.0');
  });

  it('no one within 0.3 s: nothing (a normal finish), decided after 18 ticks', () => {
    const r = judgeRun(1000, 5, 3, () => res(row(1, 1, 79), row(2, 2, 80.5), row(5, 3, 81.5), row(4, 4, null, 3)));
    expect(r.call).toEqual({ kind: 'none' });
    expect(r.at - 1000).toBe(PHOTO_WAIT_TICKS);
    expect(r.certainAt).toBe(-1);
    // a win by more than 0.3 s against a finished cat is the banner, not a photo
    const w = judgeRun(1000, 5, 1, () => res(row(5, 1, 80), row(2, 2, 81.8)));
    expect(w.call.kind).toBe('won');
  });

  it('a battle or a DNF (no finish time): nothing', () => {
    const j = new PhotoFinishJudge();
    j.begin(10);
    expect(j.step(10, res(row(5, 1, null, null)), 5, 1).decided).toEqual({ kind: 'none' });
    expect(j.active).toBe(false);
  });

  it('formats the margin like the stamp: 2 decimals under a second, 1 above', () => {
    expect(fmtMargin(0.0712)).toBe('0.07');
    expect(fmtMargin(0.3)).toBe('0.30');
    expect(fmtMargin(1.84)).toBe('1.8');
  });
});

describe('DODGED! (F5)', () => {
  /** A shot that closes from 12 m to `closest` then flies away (or vanishes when `vanish`); one sample per tick. */
  function shot(w: DodgeWatcher, t0: number, closest: number, vanish = false, hitAt = -1): number[] {
    const calls: number[] = [];
    const path = [12, 9, 6, 4, closest, closest + 2, closest + 5, closest + 9];
    for (let i = 0; i < 60; i++) {
      const tk = t0 + i;
      if (tk === hitAt) w.onHit(tk);
      const d = path[i];
      const alive = d != null && !(vanish && i >= 5);
      const closing = i < 4;
      const samples = alive ? [{ id: 7 + t0, dist: d, eta: closing ? d / 20 : Infinity }] : [];
      if (w.step(tk, samples)) calls.push(tk);
    }
    return calls;
  }

  it('a locked shot that flew past within 3 m: one call, 20 ticks after it ended', () => {
    const w = new DodgeWatcher();
    const calls = shot(w, 100, 1.2);
    expect(calls).toHaveLength(1);
    expect(calls[0] - 105).toBeGreaterThanOrEqual(DODGE.confirmTicks);
  });

  it('a hit (or a shield block) within 20 ticks cancels it', () => {
    expect(shot(new DodgeWatcher(), 100, 0.5, false, 106)).toHaveLength(0);
    expect(shot(new DodgeWatcher(), 100, 0.5, true, 104)).toHaveLength(0);
  });

  it('a shot that died in a wall far away, or passed wide, says nothing', () => {
    // vanished while still 5 m out
    const w = new DodgeWatcher();
    const calls: number[] = [];
    for (let i = 0; i < 40; i++) if (w.step(i, i < 3 ? [{ id: 1, dist: 9 - i * 2, eta: 0.25 }] : [])) calls.push(i);
    expect(calls).toHaveLength(0);
    // passed 5 m wide
    expect(shot(new DodgeWatcher(), 100, 5)).toHaveLength(0);
    // never locked (ETA always over 0.6 s): a slow shot drifting by is no dodge
    const s = new DodgeWatcher();
    let n = 0;
    for (let i = 0; i < 60; i++) if (s.step(i, i < 10 ? [{ id: 2, dist: Math.abs(5 - i), eta: i < 5 ? 3 : Infinity }] : [])) n++;
    expect(n).toBe(0);
  });

  it('at most one call per 2 s', () => {
    const w = new DodgeWatcher();
    const a = shot(w, 100, 1);
    const b = shot(w, 160, 1); // a second miss 1 s later
    const c = shot(w, 400, 1); // and one 5 s later
    expect(a.length + b.length).toBe(1);
    expect(c).toHaveLength(1);
  });

  it('samples: other karts’ shots only, with an ETA when they close on the player', () => {
    const st = {
      karts: [{ x: 0, z: 20, vx: 0, vz: 20, finished: 0 }, { x: 0, z: 0, vx: 0, vz: 0, finished: 0 }],
      items: { s: { proj: [{ id: 3, kind: 0, owner: 1, x: 0, z: 0, vx: 0, vz: 40, target: -1 }, { id: 4, kind: 0, owner: 0, x: 0, z: 10, vx: 0, vz: 40, target: -1 }] } },
    } as unknown as RaceState;
    const out = projSamples(st, 0, []);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(3);
    expect(out[0].eta).toBeCloseTo(1, 5);
  });
});

describe('final-lap duel (F5)', () => {
  it('gaps are the distance over the chaser’s speed, to the cats one place ahead and behind', () => {
    const k = (place: number, dist: number, vz = 20, extra: Partial<KartState> = {}) => ({ place, dist, vx: 0, vz, out: 0, finished: 0, ...extra }) as unknown as KartState;
    const g = raceGaps({ karts: [k(2, 500), k(1, 508), k(3, 494, 30), k(4, 100)] }, 0);
    expect(g.aheadKart).toBe(1);
    expect(g.ahead).toBeCloseTo(8 / 20, 9);
    expect(g.behindKart).toBe(2);
    expect(g.behind).toBeCloseTo(6 / 30, 9);
    // a cat already over the line is no longer a rival
    const h = raceGaps({ karts: [k(2, 500), k(1, 508, 20, { finished: 1 } as Partial<KartState>)] }, 0);
    expect(h.ahead).toBeNull();
  });

  it('the chip eases over 0.3 s and snaps when the rival changes', () => {
    const s = new GapSmoother();
    expect(s.step(1, 2, 1 / 60)).toBe(1);
    let v = 1;
    for (let i = 0; i < 18; i++) v = s.step(0, 2, 1 / 60)!;
    expect(v).toBeCloseTo(Math.exp(-1), 2);
    expect(s.step(0.7, 3, 1 / 60)).toBe(0.7);
    expect(s.step(null, -1, 1 / 60)).toBeNull();
    expect(s.step(0.4, 3, 1 / 60)).toBe(0.4);
    expect(DUEL.tau).toBe(0.3);
  });

  it('edge glow within 0.5 s: red DEFEND behind, gold CATCH ahead, the nearer one wins; tension follows the gap', () => {
    expect(duelGlow(0.4, null)).toBe('catch');
    expect(duelGlow(null, 0.3)).toBe('defend');
    expect(duelGlow(0.2, 0.3)).toBe('catch');
    expect(duelGlow(0.4, 0.4)).toBe('defend');
    expect(duelGlow(0.6, 0.9)).toBeNull();
    expect(duelTension(null, null)).toBe(0);
    expect(duelTension(0, 2)).toBe(1);
    expect(duelTension(0.75, null)).toBeCloseTo(0.5, 9);
    expect(fmtGap(0.42, true)).toBe('+0.4 s');
    expect(fmtGap(0.26, false)).toBe('−0.3 s');
  });

  it('COMEBACK! once for 3+ places gained on the final lap; the music drop on taking P1', () => {
    const d = new DramaCalls();
    expect(d.step(100, 6, null)).toEqual([]);
    d.onFinalLap(200, 6);
    expect(d.step(210, 4, null)).toEqual([]);
    expect(d.step(220, 3, null)).toEqual(['comeback']);
    expect(d.step(230, 2, null)).toEqual([]);
    expect(d.step(240, 1, null)).toEqual(['drop']);
    expect(d.step(250, 1, null)).toEqual([]);
    // no drop before the final lap
    const e = new DramaCalls();
    e.step(10, 2, null);
    expect(e.step(11, 1, null)).toEqual([]);
  });

  it('Hold on! when leading with a cat within 0.3 s behind, not in the first 3 s of the lap, every 6 s at most', () => {
    const d = new DramaCalls();
    d.onFinalLap(0, 1);
    expect(d.step(100, 1, 0.2)).toEqual([]);
    expect(d.step(200, 1, 0.2)).toEqual(['holdOn']);
    expect(d.step(300, 1, 0.2)).toEqual([]);
    expect(d.step(600, 1, 0.2)).toEqual(['holdOn']);
    expect(d.step(1000, 1, 0.5)).toEqual([]);
  });

  it('STOLEN AT THE LINE! when the place got better in the last second', () => {
    const d = new DramaCalls();
    d.onFinalLap(0, 2);
    for (let tk = 1; tk < 500; tk++) d.step(tk, 2, 0.5);
    for (let tk = 500; tk < 530; tk++) d.step(tk, 1, 0.5);
    expect(d.onFinish(530, 1)).toBe('stolen');
    const e = new DramaCalls();
    e.onFinalLap(0, 1);
    for (let tk = 1; tk < 500; tk++) e.step(tk, 1, 0.5);
    expect(e.onFinish(500, 1)).toBeNull();
  });

  it('FASTEST LAP only against cats that have run a lap, and only when it is the race’s best', () => {
    const f = new FastestLap();
    const ks = (...b: number[]) => b.map((bestLapTicks) => ({ bestLapTicks }));
    expect(f.step(ks(0, 0), 0)).toBe(false);
    expect(f.step(ks(1800, 1900), 0)).toBe(false); // the first lap (standing start) never flashes
    expect(f.step(ks(1800, 1850), 0)).toBe(false); // unchanged
    expect(f.step(ks(1700, 1850), 0)).toBe(true); // a flying lap, the race's best
    expect(f.step(ks(1650, 1600), 0)).toBe(false);
    f.reset();
    f.step(ks(1800, 0), 0);
    expect(f.step(ks(1700, 0), 0)).toBe(false); // no one else has run a lap: nothing to beat
  });

  it('pass-by zips: silent until GO + 3 s, panned to the side the cat passes', () => {
    const z = new PassZips();
    const out: Zip[] = [];
    const k = (dist: number, d: number, vz: number) => ({ dist, d, vx: 0, vz, branch: -1, out: 0, finished: 0 }) as unknown as KartState;
    const run = (t0: number) => {
      const got: Zip[] = [];
      z.reset();
      z.step(t0, 100, [k(100, 0, 20), k(99, 2, 28)], 0, out);
      got.push(...z.step(t0 + 1, 100, [k(100, 0, 20), k(101, 2, 28)], 0, out));
      return got;
    };
    expect(run(150)).toHaveLength(0);
    const got = run(400);
    expect(got).toHaveLength(1);
    expect(got[0].pan).toBeGreaterThan(0);
  });
});

describe('boost chains and ON FIRE (F6)', () => {
  const padLen = Math.round(BOOST.pad.time * 60);
  const pads = (ticks: number[]): RaceEvent[] => ticks.map((tick) => ({ tick, type: 'pad', kart: 0 }));
  /** pads each starting `gap` ticks after the last one ended */
  const chained = (n: number, gap: number, t0 = 100) => Array.from({ length: n }, (_, i) => t0 + i * (padLen + gap));

  it('a boost starting within 1.2 s of the last one ending links; a longer gap starts over', () => {
    const s = boostChainTally(pads(chained(3, CHAIN.gapTicks)), 0);
    expect(s.best).toBe(3);
    const t = boostChainTally(pads(chained(3, CHAIN.gapTicks + 1)), 0);
    expect(t.best).toBe(1);
    expect(t.links).toBe(3);
  });

  it('callouts only from ×3; ON FIRE at ×4 for 5 s', () => {
    const c = new BoostChain();
    const links = pads(chained(4, 30)).map((e) => c.onEvent(e, 0)!);
    expect(links.map((l) => l.chain)).toEqual([1, 2, 3, 4]);
    expect(links.map((l) => l.callout)).toEqual([false, false, true, true]);
    expect(links.map((l) => l.newFire)).toEqual([false, false, false, true]);
    const lit = chained(4, 30)[3];
    expect(c.onFire(lit + CHAIN.fireTicks - 1)).toBe(true);
    expect(c.onFire(lit + CHAIN.fireTicks)).toBe(false);
    expect(c.fireFrac(lit)).toBe(1);
    expect(c.fireLeft(lit + CHAIN.fireTicks - 30)).toBeCloseTo(0.5, 9);
    expect(c.summary).toMatchObject({ best: 4, chains3: 1, fires: 1, links: 4 });
  });

  it('a TRIPLE overtake lights ON FIRE from outside; a lit fire is not counted twice', () => {
    const c = new BoostChain();
    expect(c.ignite(50)).toBe(true);
    expect(c.ignite(60)).toBe(false);
    expect(c.onFire(349)).toBe(true);
    expect(c.summary.fires).toBe(1);
  });

  it('item boosts neither link nor break; other karts do not count; a landing and its trick are one link', () => {
    const ev2 = (tick: number, type: RaceEvent['type'], kart: number, a?: number): RaceEvent => ({ tick, type, kart, a });
    const s = boostChainTally(
      [
        ev2(100, 'boost', 0, BoostSource.MiniTurbo),
        ev2(100, 'miniTurbo', 0, 2),
        ev2(150, 'boost', 0, BoostSource.Catnip),
        ev2(160, 'boost', 1, BoostSource.Trick),
        ev2(170, 'boost', 0, BoostSource.Trick),
        ev2(172, 'boost', 0, BoostSource.Stunt),
        ev2(230, 'boost', 0, BoostSource.Slipstream),
      ],
      0,
    );
    expect(s.links).toBe(3);
    expect(s.best).toBe(3);
    expect(boostChainTally([], 0)).toEqual(BoostChain.empty());
  });
});

describe('paw TAP! rings (F3 view)', () => {
  it('one ring per ramp lip and per jump-gap lip, standing on the lip', () => {
    for (const def of [KITCHEN, stuntLab()]) {
      const t = buildTrack(def);
      const lips = lipsOf(t);
      const gaps = (t.pieces ?? []).filter((p) => p.kind === 'jump' && p.gap > 0);
      expect(lips.length).toBe(t.ramps.length + gaps.length);
      for (const g of gaps) expect(lips.some((l) => l.i === g.i0)).toBe(true);
      for (const l of lips) {
        expect(l.size).toBeGreaterThanOrEqual(2.2);
        expect(l.size).toBeLessThanOrEqual(3.4);
        expect(Number.isFinite(l.x + l.y + l.z)).toBe(true);
      }
    }
    expect(lipsOf(buildTrack(KITCHEN)).length).toBeGreaterThan(0);
  });
  it('lies flat on the run-up and ends at the lip, never standing over the kart (playtest)', () => {
    for (const def of [KITCHEN, stuntLab()]) {
      const t = buildTrack(def);
      for (const l of lipsOf(t)) {
        const m = lipMatrix(l, t.tx[l.i], t.tz[l.i], new Matrix4());
        const e = m.elements;
        // the plane's normal (its z axis) points up: a decal, not a hoop
        const n = new Vector3(e[8], e[9], e[10]).normalize();
        expect(n.y).toBeGreaterThan(0.8);
        // its far edge (local y = +0.5) sits at the lip, its near edge back down the run-up
        const far = new Vector3(0, 0.5, 0).applyMatrix4(m);
        const near = new Vector3(0, -0.5, 0).applyMatrix4(m);
        expect(Math.hypot(far.x - l.x, far.z - l.z)).toBeLessThan(0.3);
        expect(far.y - l.y).toBeLessThan(0.2);
        expect(near.y).toBeLessThanOrEqual(far.y + 0.01);
        // the whole decal is under 0.3 m above the lip: it can never hang over the kart
        expect(Math.max(far.y, near.y) - l.y).toBeLessThan(0.3);
      }
    }
  });
  it('asleep far away, waking from 60 m, hot through the trick window, dim once past', () => {
    const v = 25;
    expect(lipPulse(120, v)).toBe(0.2);
    expect(lipPulse(40, v)).toBeGreaterThan(0.2);
    expect(lipPulse(20, v)).toBeGreaterThan(lipPulse(40, v));
    // hot from a little before the 0.12 s buffer window until 0.45 s past the lip
    expect(lipPulse(v * BOOST.trick.pre, v)).toBe(1);
    expect(lipPulse(0, v)).toBe(1);
    expect(lipPulse(-v * 0.44, v)).toBe(1);
    expect(lipPulse(-v * 0.5, v)).toBe(0.25);
  });
  it('distance along the loop wraps at half a lap', () => {
    const t = { step: 1, length: 1000 };
    expect(aheadOf(t, 100, 40)).toBe(60);
    expect(aheadOf(t, 10, 980)).toBe(30);
    expect(aheadOf(t, 990, 10)).toBe(-20);
  });
});
