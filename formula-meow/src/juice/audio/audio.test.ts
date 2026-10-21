import { describe, expect, it } from 'vitest';
import { HAZARD_KINDS, ITEM_IDS, type RaceEvent } from '../../types';
import { ALL_TRACKS, KITCHEN, RUG } from '../../core/track/tracks';
import { GO_TICK } from '../../core/sim/world';
import { musicMix, SONG, SONGS, songFor, songIndexForTrack } from './music';
import { cuesFor, incomingCue, incomingInterval, PRIO_CAP, VoiceBudget, cueLength, type SfxId } from './sfx';
import { ANNOUNCE_IDS, ANNOUNCE_TEXT, AnnouncerLogic, lineLength } from './announcer';
import { UI_SOUND_IDS, uiSoundSpec } from './stings';
import { prng } from './synth';
import { audioResumable, RaceAudio } from './race-audio';

const ev = (type: RaceEvent['type'], kart: number, a?: number, b?: number, tick = GO_TICK + 600, item?: RaceEvent['item']): RaceEvent => ({ tick, type, kart, a, b, item });

describe('music (iteration 2)', () => {
  it('has one song per circuit theme plus the arena and the menus, each in its own key', () => {
    expect(SONGS).toHaveLength(8);
    expect(new Set(SONGS.map((s) => s.root)).size).toBe(SONGS.length);
    expect(new Set(SONGS.map((s) => s.name)).size).toBe(SONGS.length);
    for (const s of SONGS) {
      expect(s.bass).toHaveLength(16);
      expect(s.arp).toHaveLength(16);
      expect(s.lead).toHaveLength(32);
      expect(s.prog).toHaveLength(4);
      for (const i of s.arp) expect(i).toBeLessThan(6);
      expect(s.bpm).toBeGreaterThanOrEqual(100);
      expect(s.bpm).toBeLessThanOrEqual(140);
    }
  });
  it('every track and the arena pick a song; TrackDef.music wins; the arena plays the battle song', () => {
    for (const t of ALL_TRACKS) {
      const i = songIndexForTrack(t);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(SONGS.length);
      expect(i).not.toBe(SONG.menu);
    }
    expect(songIndexForTrack(KITCHEN)).toBe(SONG.kitchen);
    expect(songIndexForTrack(RUG)).toBe(SONG.arena);
    expect(songIndexForTrack({ ...KITCHEN, music: SONG.cafe })).toBe(SONG.cafe);
    expect(songIndexForTrack({ ...KITCHEN, music: 99 })).toBe(SONG.kitchen);
    expect(songIndexForTrack({ theme: 7 })).toBe(0);
    // themes 2..6 each get their own song
    expect(new Set([2, 3, 4, 5, 6].map((theme) => songIndexForTrack({ theme }))).size).toBe(5);
    expect(songFor(SONG.menu).name).toBe('Purr Lounge');
  });
  it('the menu mix is a half-time band without the heartbeat', () => {
    const m = musicMix('menu', 8, false, false);
    expect(m.heart).toBe(0);
    expect(m.kick).toBeGreaterThan(0);
    expect(m.lead).toBeGreaterThan(0);
    expect(m.pad).toBe(1);
  });
});

describe('sfx: iteration 2 cues', () => {
  const me = 5;
  it('coins pling for the player only, pitched by the coins held; a drop has its own sound', () => {
    expect(cuesFor(ev('coin', me, 4), me)[0]).toMatchObject({ id: 'coin', n: 4 });
    expect(cuesFor(ev('coin', 2, 4), me)).toEqual([]);
    expect(cuesFor(ev('coinLoss', me, 3), me)[0].id).toBe('coinLoss');
    expect(cuesFor(ev('coinLoss', me, 0), me)).toEqual([]);
  });
  it('every hazard kind sounds for the player, and near rivals get a quiet copy', () => {
    for (let k = 0; k < HAZARD_KINDS.length; k++) {
      const c = cuesFor(ev('hazard', me, k), me)[0];
      expect(c).toMatchObject({ id: 'hazard', n: k, prio: 2 });
      const o = cuesFor(ev('hazard', 2, k), me)[0];
      expect(o.near).toBe(2);
      expect(o.vol).toBeLessThan(1);
    }
  });
  it('the hit sound names the item that landed (the attacker’s last use, when it fits the hit kind)', () => {
    expect(cuesFor(ev('hit', me, 0, 2), me, () => 'yarn')[0].item).toBe('yarn');
    // a leap can only be a cucumber, whatever the attacker used last
    expect(cuesFor(ev('hit', me, 1, 2), me, () => 'bell')[0].item).toBe('cucumber');
    expect(cuesFor(ev('hit', me, 3, 2), me)[0].item).toBe('laser');
    expect(cuesFor(ev('hit', 3, 2, me), me, () => 'bell')[0]).toMatchObject({ id: 'hitConfirm', item: 'bell' });
  });
  it('battle: pops, steals and eliminations', () => {
    expect(cuesFor(ev('balloonPop', me, 0, 2), me)[0]).toMatchObject({ id: 'balloonPop', prio: 3 });
    expect(cuesFor(ev('balloonPop', 2, 0, me), me)[0]).toMatchObject({ id: 'balloonPop', prio: 2 });
    expect(cuesFor(ev('balloonSteal', 2, 0, me), me)[0].id).toBe('balloonSteal');
    expect(cuesFor(ev('balloonSteal', me, 0, 2), me)[0].id).toBe('balloonPop');
    expect(cuesFor(ev('eliminated', me), me)[0]).toMatchObject({ id: 'eliminated', prio: 3 });
  });
  it('the respawn hand, wrong way, fizzles and the shield that blocked', () => {
    expect(cuesFor(ev('respawnStart', me), me)[0].id).toBe('respawnHand');
    expect(cuesFor(ev('wrongWay', me), me)[0].id).toBe('wrongWay');
    expect(cuesFor(ev('itemFizzle', me, 0, 0, 900, 'laser'), me)[0].id).toBe('itemFizzle');
    expect(cuesFor(ev('blocked', me, 0, 0, 900, 'yarn'), me)[0].item).toBe('yarn');
    expect(cuesFor(ev('blocked', me), me)[0].item).toBe('box');
  });
  it('every item has a use cue; the incoming beeper speeds up as it closes', () => {
    for (const item of ITEM_IDS) expect(cuesFor({ tick: 900, type: 'itemUse', kart: me, item }, me)[0]).toMatchObject({ id: 'item', item });
    expect(incomingInterval(0.3)).toBeLessThan(incomingInterval(2));
    expect(incomingInterval(0)).toBeGreaterThan(0.05);
    expect(incomingCue(2, 0.5).n).toBe(2);
    expect(incomingCue(0, 0.2).vol).toBeGreaterThan(incomingCue(0, 2.4).vol);
  });
  it('every cue has a length that holds a voice', () => {
    const ids: SfxId[] = ['coin', 'hazard', 'incoming', 'timerTick', 'timeUp', 'splitAhead', 'eliminated', 'respawnHand'];
    for (const id of ids) expect(cueLength(id)).toBeGreaterThan(0);
  });
});

describe('voice budget: never more than 24', () => {
  it('a seeded storm of cues, notes, lines and UI sounds never passes 24 voices', () => {
    const b = new VoiceBudget(24);
    const r = prng(12345);
    let t = 0;
    let admittedTop = 0;
    for (let i = 0; i < 20000; i++) {
      t += r() * 0.01;
      const prio = Math.floor(r() * 4);
      if (b.admit(t, prio, 0.05 + r() * 1.4) && prio === 3) admittedTop++;
      expect(b.active).toBeLessThanOrEqual(24);
    }
    expect(b.peak).toBeLessThanOrEqual(24);
    expect(admittedTop).toBeGreaterThan(0);
  });
  it('low priorities stop at their ceiling and leave room for the countdown, hits and the announcer', () => {
    const b = new VoiceBudget(24);
    let n = 0;
    while (b.admit(0, 0, 10)) n++;
    expect(n).toBe(PRIO_CAP[0]);
    while (b.admit(0, 1, 10)) n++;
    expect(n).toBe(PRIO_CAP[1]);
    while (b.admit(0, 2, 10)) n++;
    expect(n).toBe(PRIO_CAP[2]);
    while (b.admit(0, 3, 10)) n++;
    expect(n).toBe(24);
    expect(b.admit(0, 3, 10)).toBe(false);
    // voices expire
    expect(b.admit(20, 1, 1)).toBe(true);
    expect(b.active).toBe(1);
  });
});

describe('announcer', () => {
  const me = 5;
  it('has a caption for every line and every line is short', () => {
    for (const id of ANNOUNCE_IDS) {
      expect(ANNOUNCE_TEXT[id]).toBeTruthy();
      expect(lineLength(id)).toBeGreaterThan(0.1);
      expect(lineLength(id)).toBeLessThan(1);
    }
  });
  it('counts down "mrrp, mrrp, mrrp, MEOW!" and calls the final lap', () => {
    const a = new AnnouncerLogic();
    expect(a.onEvent(ev('countdown', -1, 3, undefined, 60), me, 'race')).toBe('three');
    expect(a.onEvent(ev('countdown', -1, 2, undefined, 120), me, 'race')).toBe('two');
    expect(a.onEvent(ev('countdown', -1, 1, undefined, 180), me, 'race')).toBe('one');
    expect(a.onEvent(ev('go', -1, undefined, undefined, GO_TICK), me, 'race')).toBe('go');
    expect(a.onEvent(ev('finalLap', me), me, 'race')).toBe('finalLap');
    expect(a.onEvent(ev('finalLap', 2), me, 'race')).toBeNull();
  });
  it('takes the lead at most every 6 s, never in the first 2 s', () => {
    const a = new AnnouncerLogic();
    expect(a.onEvent(ev('overtake', me, 1, 2, GO_TICK + 60), me, 'race')).toBeNull();
    expect(a.onEvent(ev('overtake', me, 1, 2, GO_TICK + 200), me, 'race')).toBe('lead');
    expect(a.onEvent(ev('overtake', me, 1, 3, GO_TICK + 300), me, 'race')).toBeNull();
    expect(a.onEvent(ev('overtake', me, 1, 3, GO_TICK + 600), me, 'race')).toBe('lead');
    expect(a.onEvent(ev('overtake', me, 2, 3, GO_TICK + 2000), me, 'race')).toBeNull();
  });
  it('says ouch with a long cooldown, and the finish line depends on the place and the mode', () => {
    const a = new AnnouncerLogic();
    expect(a.onEvent(ev('hit', me, 0, 2, 1000), me, 'race')).toBe('ouch');
    expect(a.onEvent(ev('hit', me, 0, 2, 1100), me, 'race')).toBeNull();
    expect(a.onEvent(ev('hit', me, 0, 2, 1600), me, 'race')).toBe('ouch');
    expect(new AnnouncerLogic().onEvent(ev('finish', me, 1), me, 'race')).toBe('win');
    expect(new AnnouncerLogic().onEvent(ev('finish', me, 3), me, 'race')).toBe('podium');
    expect(new AnnouncerLogic().onEvent(ev('finish', me, 6), me, 'race')).toBe('lose');
    expect(new AnnouncerLogic().onEvent(ev('finish', me, 1), me, 'battle')).toBe('battleWin');
    const done = new AnnouncerLogic();
    done.onEvent(ev('finish', me, 4), me, 'race');
    // nothing after the finish
    expect(done.onEvent(ev('hit', me, 0, 2, 5000), me, 'race')).toBeNull();
  });
  it('battle: popped and out', () => {
    const a = new AnnouncerLogic();
    expect(a.onEvent(ev('balloonPop', me, 0, 2), me, 'battle')).toBe('pop');
    expect(a.onEvent(ev('eliminated', me), me, 'battle')).toBe('out');
    expect(a.onEvent(ev('eliminated', 2), me, 'battle')).toBeNull();
  });
});

describe('ui sounds', () => {
  it('every UI sound has a priority and a length; stingers always play', () => {
    for (const id of UI_SOUND_IDS) {
      const s = uiSoundSpec(id);
      expect(s.len).toBeGreaterThan(0);
      expect(s.prio).toBeGreaterThanOrEqual(0);
    }
    for (const id of ['unlock', 'achievement', 'podium', 'cupWin'] as const) expect(uiSoundSpec(id).prio).toBe(3);
    expect(uiSoundSpec('hover').prio).toBe(0);
  });
});

describe('audio context resume (WebKit interrupted state)', () => {
  const fakeCtx = (state: string) => {
    const c = { state, resumes: 0, suspends: 0, resume: () => (c.resumes++, Promise.resolve()), suspend: () => (c.suspends++, Promise.resolve()) };
    return c;
  };
  it('treats every state but running and closed as resumable', () => {
    expect(audioResumable('suspended')).toBe(true);
    expect(audioResumable('interrupted')).toBe(true);
    expect(audioResumable('running')).toBe(false);
    expect(audioResumable('closed')).toBe(false);
  });
  it('unlock() and resume() resume an interrupted context; suspend() suspends it', () => {
    for (const call of ['unlock', 'resume'] as const) {
      const a = new RaceAudio();
      const c = fakeCtx('interrupted');
      (a as unknown as { ctx: unknown }).ctx = c;
      a[call]();
      expect(c.resumes).toBe(1);
    }
    const a = new RaceAudio();
    const c = fakeCtx('interrupted');
    (a as unknown as { ctx: unknown }).ctx = c;
    a.suspend();
    expect(c.suspends).toBe(1);
    const closed = fakeCtx('closed');
    (a as unknown as { ctx: unknown }).ctx = closed;
    a.unlock();
    a.resume();
    a.suspend();
    expect(closed.resumes + closed.suspends).toBe(0);
  });
});
