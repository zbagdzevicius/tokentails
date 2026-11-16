/**
 * Theme soundtrack (audio/theme.ts, themeMotif.js, musicPref.ts): the cue per screen, the seamless loop window, the
 * shipped files, and the player's Music slider on top of the host's music volume.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cueFor, cycleSeconds, musicUrl } from '../../src/audio/theme';
import { CATS_MOTIF, DOGS_MOTIF, LOOP_PAD_S, MENU_LOOPS, THEME_BPM } from '../../src/audio/themeMotif.js';
import { Sfx } from '../../src/audio/sfx';

describe('theme soundtrack', () => {
  it('picks the cue from the screen: nothing in a match, the build in champion select, else home', () => {
    expect(cueFor('match', true)).toBeNull();
    expect(cueFor('match', false)).toBeNull();
    expect(cueFor('pick', true)).toBe('select');
    expect(cueFor('title', true)).toBe('select');
    expect(cueFor('title', false)).toBe('home');
    expect(cueFor('results', false)).toBe('home');
    expect(cueFor(undefined, false)).toBe('home');
  });

  it('loops whole bars at the theme tempo', () => {
    expect(cycleSeconds('home')).toBeCloseTo((MENU_LOOPS.home.bars * 4 * 60) / THEME_BPM, 4);
    expect(cycleSeconds('select')).toBeCloseTo((MENU_LOOPS.select.bars * 4 * 60) / THEME_BPM, 4);
    expect(LOOP_PAD_S).toBeGreaterThan(0.1);
  });

  it('one motif: the CATS call rises, the DOGS answer falls', () => {
    const cats = CATS_MOTIF.map(([, m]) => m);
    const dogs = DOGS_MOTIF.map(([, m]) => m);
    expect(cats[3]).toBeGreaterThan(cats[0]);
    expect(dogs[dogs.length - 1]).toBeLessThan(dogs[0]);
  });

  it('ships every cue small, beside the skin art (outside the game bundle)', () => {
    let total = 0;
    for (const n of ['home', 'select', 'lock', 'victory', 'defeat']) {
      const f = join(__dirname, '..', '..', '..', 'pawlegends-web', 'public', 'pawlegends-art', 'music', `${n}.m4a`);
      expect(existsSync(f), n).toBe(true);
      total += statSync(f).size;
    }
    expect(total).toBeLessThan(1.2 * 1024 * 1024);
    expect(musicUrl('home')).toMatch(/^https:\/\/pawlegends\.app\/pawlegends-art\/music\/home\.m4a\?v=\d+$/);
  });

  it('music level = host music volume x the player slider, clamped', () => {
    const x = new Sfx();
    expect(x.musicLevel).toBe(1);
    x.setPlayerMusic(0.5);
    x.setVolumes({ music: 0.5 });
    expect(x.musicLevel).toBe(0.25);
    expect(x.musicVolume).toBe(0.5);
    x.setPlayerMusic(4);
    expect(x.musicLevel).toBe(0.5);
    x.setPlayerMusic(Number.NaN);
    expect(x.musicLevel).toBe(0.5);
  });
});
