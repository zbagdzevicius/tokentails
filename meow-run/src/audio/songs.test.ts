import { describe, expect, it } from 'vitest';
import { buildPattern, degree, endingJingle, fanfare, parseMelody, sadJingle, songFor, SONGS, STEPS, type SongId, type Variant } from './songs';

const IDS = Object.keys(SONGS) as SongId[];
const VARIANTS: Variant[] = ['level', 'chase', 'calm'];

describe('songs', () => {
  it('every stage music id has a song', () => {
    for (const id of ['meadow', 'gorge', 'sunset', 'endless']) expect(songFor(id)).toBe(id);
    expect(songFor('nope')).toBe('meadow');
    expect(songFor(undefined)).toBe('meadow');
  });
  it('melodies are 8 bars of 8ths and chords cover every bar', () => {
    for (const id of IDS) {
      const m = parseMelody(SONGS[id].melody);
      expect(m.length, id).toBe(64);
      for (const t of m) expect(t === 'hold' || t === 'rest' || Number.isInteger(t), `${id} token ${t}`).toBe(true);
      expect(SONGS[id].chords.length).toBe(8);
    }
  });
  it('degrees wrap octaves', () => {
    expect(degree(60, SONGS.meadow.scale, 7)).toBe(72);
    expect(degree(60, SONGS.meadow.scale, -1)).toBe(59);
  });
  it('patterns are full, finite and in a sane range', () => {
    for (const id of IDS) {
      for (const v of VARIANTS) {
        const p = buildPattern(id, v);
        expect(p.kick.length).toBe(STEPS);
        expect(p.chord.length).toBe(STEPS * 4);
        let notes = 0;
        for (const arr of [p.bass, p.lead, p.bell, p.stab, p.chord]) {
          for (const f of arr) {
            expect(Number.isFinite(f)).toBe(true);
            if (f > 0) {
              notes++;
              expect(f, `${id}/${v}`).toBeGreaterThan(30);
              expect(f, `${id}/${v}`).toBeLessThan(5000);
            }
          }
        }
        expect(notes, `${id}/${v}`).toBeGreaterThan(40);
        for (const d of p.leadDur) expect(d).toBeGreaterThanOrEqual(0);
        if (v === 'calm') expect(p.snare.every((x) => x === 0)).toBe(true);
      }
    }
  });
  it('the chase is faster and busier than the level loop', () => {
    for (const id of IDS) {
      const a = buildPattern(id, 'level');
      const c = buildPattern(id, 'chase');
      expect(c.bpm).toBeGreaterThan(a.bpm);
      const count = (x: Float32Array) => x.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
      expect(count(c.kick)).toBeGreaterThanOrEqual(count(a.kick));
      expect(count(c.bass)).toBeGreaterThan(count(a.bass));
      expect(buildPattern(id, 'calm').bpm).toBeLessThan(a.bpm);
    }
  });
  it('patterns are deterministic', () => {
    const a = buildPattern('gorge', 'chase');
    const b = buildPattern('gorge', 'chase');
    expect(Array.from(a.lead)).toEqual(Array.from(b.lead));
  });
  it('jingles are short', () => {
    for (const j of [fanfare('meadow'), sadJingle(), endingJingle()]) {
      const beat = 60 / j.bpm;
      const end = Math.max(...j.notes.map(([t, , d]) => (t + d) * beat));
      expect(end).toBeGreaterThan(0.8);
      expect(end).toBeLessThan(12);
    }
  });
});
