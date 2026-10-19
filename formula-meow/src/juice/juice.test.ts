import { describe, expect, it } from 'vitest';
import { BoostSource, type RaceEvent } from '../types';
import { DRIFT } from '../tuning';
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
