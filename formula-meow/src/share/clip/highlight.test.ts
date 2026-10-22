/**
 * Iteration 4 (F8): the clip window picks the set-piece moments (a loop, a clean landing with its combo, a wall ride,
 * a photo finish), the caption stickers say what happened, and the stunt brag and the clip hype only use what this
 * race measured. Captions pass the honesty rules.
 */
import { describe, expect, it } from 'vitest';
import type { RaceEvent, RaceStats } from '../../types';
import { BANNED_CLAIMS, clipCaption, dailyCardText, dareText } from '../cards/card-text';
import { bestWindow, eventScore, finishSticker, highlightSticker, hypeReason, planClip, PHOTO_SCORE, scoredEvents, stuntBrag } from './highlight';

const ev = (tick: number, type: RaceEvent['type'], kart: number, a?: number, b?: number): RaceEvent => ({ tick, type, kart, a, b });
const LOOP = 0;
const WALL = 1;
const JUMP = 2;
const TUNNEL = 3;
const ME = 5;

const stats = (o: Partial<RaceStats>): RaceStats => ({
  kart: ME,
  hitsDealt: 0,
  hitsTaken: 0,
  miniTurbos: [0, 0, 0],
  pounce: false,
  tricks: 0,
  coinsPicked: 0,
  itemsUsed: 0,
  overtakes: 0,
  bestPlaceGain: 0,
  worstPlace: 8,
  wallHits: 0,
  respawns: 0,
  slipstreams: 0,
  shortcuts: 0,
  balloonPops: 0,
  balloonSteals: 0,
  loops: 0,
  walls: 0,
  cleanLandings: 0,
  bestCombo: 0,
  style: 0,
  ...o,
});

describe('set-piece scores (F8)', () => {
  it('a clean loop, wall ride or tunnel exit +3; a clean landing +3; entering a wall ride +1; a net catch −2', () => {
    expect(eventScore(ev(1, 'stuntExit', ME, LOOP, 1), ME)).toBe(3);
    expect(eventScore(ev(1, 'stuntExit', ME, WALL, 1), ME)).toBe(3);
    expect(eventScore(ev(1, 'stuntExit', ME, TUNNEL, 1), ME)).toBe(3);
    // a messy exit, a jump's exit (scored on the landing) and another cat's loop score nothing
    expect(eventScore(ev(1, 'stuntExit', ME, LOOP, 0), ME)).toBe(0);
    expect(eventScore(ev(1, 'stuntExit', ME, JUMP, 1), ME)).toBe(0);
    expect(eventScore(ev(1, 'stuntExit', 2, LOOP, 1), ME)).toBe(0);
    expect(eventScore(ev(1, 'stuntLand', ME, 40, 0), ME)).toBe(3);
    expect(eventScore(ev(1, 'stuntEnter', ME, WALL, 0), ME)).toBe(1);
    expect(eventScore(ev(1, 'stuntEnter', ME, LOOP, 0), ME)).toBe(0);
    expect(eventScore(ev(1, 'netCatch', ME, 0, 0), ME)).toBe(-2);
  });

  it('a clean landing earns +1 per combo step (stunts within 8 s chain, as the HUD callouts count them)', () => {
    const events = [ev(1000, 'stuntExit', ME, LOOP, 1), ev(1200, 'stuntExit', ME, WALL, 1), ev(1400, 'stuntLand', ME, 40, 2)];
    const s = scoredEvents(events, ME);
    expect(s.map((x) => x.s)).toEqual([3, 3, 3 + 2]);
    // more than 8 s after the last stunt: no combo
    const late = scoredEvents([ev(1000, 'stuntExit', ME, LOOP, 1), ev(1000 + 8 * 60 + 1, 'stuntLand', ME, 40, 2)], ME);
    expect(late.map((x) => x.s)).toEqual([3, 3]);
  });

  it('the window lands on a loop over a pair of overtakes elsewhere', () => {
    const events = [ev(1000, 'overtake', ME), ev(1040, 'overtake', ME), ev(3000, 'stuntEnter', ME, LOOP, 0), ev(3100, 'stuntExit', ME, LOOP, 1), ev(3200, 'stuntLand', ME, 40, 1), ev(6000, 'finish', ME, 2)];
    const s = bestWindow(events, ME, 180, 5964, 420);
    expect(s).toBeLessThanOrEqual(3100);
    expect(s + 420).toBeGreaterThan(3200);
  });

  it('a photo finish adds +6 just before the finish shot, so the window runs into the duel for the line', () => {
    const events = [ev(1500, 'overtake', ME), ev(1520, 'overtake', ME), ev(6000, 'finish', ME, 2)];
    const quiet = planClip(events, ME, 180, 6400);
    expect(quiet.hlStart).toBeLessThanOrEqual(1500);
    const photo = planClip(events, ME, 180, 6400, { photo: true });
    expect(photo.hlStart + photo.hlLen).toBe(photo.finishStart);
    expect(PHOTO_SCORE).toBe(6);
  });

  it('stickers: a ×3 combo beats a loop beats a ×2 combo, a wall ride, a landing; a burst of passes; the photo finish margin', () => {
    const events = [ev(1000, 'stuntExit', ME, WALL, 1), ev(1100, 'stuntExit', ME, LOOP, 1), ev(1300, 'stuntLand', ME, 40, 2), ev(2000, 'overtake', ME), ev(2050, 'overtake', ME)];
    expect(highlightSticker(events, ME, 900, 1320)?.text).toBe('STUNT COMBO ×3');
    // the loop (a ×2 with the wall ride before it) shows as the loop
    expect(highlightSticker(events, ME, 1050, 1200)?.text).toBe('LOOP-DE-MEOW');
    expect(highlightSticker([ev(1000, 'stuntExit', ME, WALL, 1), ev(1100, 'stuntLand', ME, 40, 1)], ME, 1050, 1200)?.text).toBe('STUNT COMBO ×2');
    expect(highlightSticker([ev(1100, 'stuntExit', ME, LOOP, 1)], ME, 900, 1320)).toMatchObject({ text: 'LOOP-DE-MEOW', tick: 1100 });
    // with its entry logged, the loop's sticker shows half a second into the loop
    expect(highlightSticker([ev(1010, 'stuntEnter', ME, LOOP), ev(1100, 'stuntExit', ME, LOOP, 1)], ME, 900, 1320)).toMatchObject({ text: 'LOOP-DE-MEOW', tick: 1040 });
    expect(highlightSticker([ev(1100, 'stuntExit', ME, WALL, 1)], ME, 900, 1320)?.text).toBe('WALL RIDE');
    expect(highlightSticker([ev(1100, 'stuntLand', ME, 40, 1)], ME, 900, 1320)?.text).toBe('NICE LANDING');
    expect(highlightSticker(events, ME, 1900, 2300)?.text).toBe('+2 PLACES');
    expect(highlightSticker(events, ME, 3000, 3300)).toBeNull();
    // another cat's stunts never make the player's sticker
    expect(highlightSticker([ev(1100, 'stuntExit', 2, LOOP, 1)], ME, 900, 1320)).toBeNull();
    expect(finishSticker(0.07, 6000)).toMatchObject({ text: 'PHOTO FINISH by 0.07 s', tick: 6000 });
    expect(finishSticker(null, 6000)).toBeNull();
  });
});

describe('clip hype and the stunt brag (F7, F8)', () => {
  it('the clip button pulses only after a strong highlight', () => {
    expect(hypeReason(stats({}), false)).toBeNull();
    expect(hypeReason(stats({ loops: 1, bestCombo: 2 }), false)).toBeNull();
    expect(hypeReason(stats({}), true)?.key).toBe('That photo finish deserves a clip');
    expect(hypeReason(stats({ bestCombo: 4 }), false)).toEqual({ key: 'That ×{n} combo deserves a clip', n: 4 });
    expect(hypeReason(stats({ loops: 3 }), false)).toEqual({ key: '{n} loops deserve a clip', n: 3 });
    expect(hypeReason(undefined, false)).toBeNull();
    expect(hypeReason(stats({}), false, 3)).toBeNull();
    expect(hypeReason(stats({ loops: 3 }), false, 4)).toEqual({ key: 'That ×{n} chain deserves a clip', n: 4 });
    expect(hypeReason(stats({ bestCombo: 3 }), false, 5)?.key).toBe('That ×{n} combo deserves a clip');
  });

  it('the brag counts this race only, and is honest everywhere it goes', () => {
    expect(stuntBrag(stats({}))).toBeNull();
    const brag = stuntBrag(stats({ loops: 3, cleanLandings: 1, bestCombo: 4 }))!;
    expect(brag).toBe('3 loops, 1 clean landing, STUNT COMBO ×4 🌀');
    expect(stuntBrag(stats({ loops: 1 }))).toBe('1 loop 🌀');
    const texts = [
      clipCaption({ trackName: 'Kitchen Counter', time: 91.2, place: 2, link: 'x', brag }),
      clipCaption({ trackName: 'Kitchen Counter', time: 91.2, place: 1, link: 'x', field: 1, brag }),
      dareText({ trackName: 'Kitchen Counter', time: 91.2, place: 2, link: 'x', brag }),
      dareText({ trackName: 'Kitchen Counter', time: 91.2, place: 1, link: 'x', field: 1 }),
      dailyCardText({ day: 3, place: 2, time: 91.2, laps: [3, 2, 2], link: 'x', stunts: true }),
      'LOOP-DE-MEOW',
      'STUNT COMBO ×4',
      'PHOTO FINISH by 0.07 s',
    ];
    for (const t of texts) for (const re of BANNED_CLAIMS) expect(t).not.toMatch(re);
    expect(texts[0]).toBe('2nd/8 · 1:31.20 · 3 loops, 1 clean landing, STUNT COMBO ×4 🌀 on Kitchen Counter in Formula Meow. Beat my cat: x #formulameow');
    // a duel or a time trial has no field: no "1st/1"
    expect(texts[1].startsWith('1:31.20 · 3 loops')).toBe(true);
    expect(texts[3]).toContain('My cat ran Kitchen Counter in 1:31.20. Beat my ghost.');
    expect(texts[4].split('\n')[1]).toBe('🟪🟪🟪 🌀');
  });
});
