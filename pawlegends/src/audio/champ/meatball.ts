/**
 * Meatball: Sleepy bowler: bowling pins and Zzz. Timbre: tuba oompah (low saw).
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: every Q/E cast is a tuba "oom-pah" (a low saw jumping up a fifth). Loaf Mode swaps that ping for a sleepy
 * tuba yawn sliding down. Each Bowling Roll and Chonk bump adds a clatter of bowling pins on top of the impact thud,
 * and Big Brother's landing scatters pins. The ult voice and the belly-bump voice stay the IDENTITY tuba.
 * Look: white bowling pins (a fat drop) with a basil-green glint spin off his casts and hits; Loaf Mode and Food Coma
 * draw lilac "Z"s instead.
 */
import type { SkillKey } from '../../render/identity';
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE ids (numbers: audio/champ never imports three.js). */
const FADE_HOLD = 2;
const FADE_TWINKLE = 3;
const PIN = 0xfffaf0;
const _p = { x: 0, y: 0, z: 0 };

/** Pins (spinning white drops with a green glint) or, for the sleepy skills, rising lilac Zs. */
function paint(p: MotifPainter, pos: P3, n: number, _dir: { x: number; z: number } | null, skill: SkillKey): boolean {
  _p.x = pos.x;
  _p.y = pos.y + 0.7;
  _p.z = pos.z;
  if (skill === 'w' || skill === 'passive') {
    p.burst(_p, { n, exact: true, shape: p.shape.ZED, color: p.colors.secondary, size: [0.24, 0.36], life: [0.8, 1.1], speed: [0.3, 0.7], up: 1.6, gravity: -1.2, spin: 0.8, fade: FADE_HOLD });
    return true;
  }
  const pins = Math.max(1, Math.ceil(n * 0.6));
  p.burst(_p, { n: pins, exact: true, shape: p.shape.DROPLET, color: PIN, size: [0.26, 0.36], life: [0.55, 0.8], speed: [1.6, 2.8], up: 2.4, gravity: 7, spin: 9, fade: FADE_HOLD });
  if (n - pins > 0)
    p.burst(_p, { n: n - pins, exact: true, additive: true, shape: p.shape.SOFT, color: p.colors.primary, intensity: 1.3, size: [0.14, 0.2], life: [0.35, 0.5], speed: [1.4, 2.4], up: 2, gravity: 5, fade: FADE_TWINKLE });
  return true;
}

export const meatball: ChampAudio = {
  hero: 'meatball',
  // tuba oom-pah: a low saw, up a fifth after 70 ms, low-passed
  motif: [0.3, 0, 98, 0.01, 0.07, 0.12, 2, 1, 0, 0, 49, 0.07, 0, 0, 0, 0, 0, 0.7, 0.03, 0, -900],
  motifRate: { q: 1, e: 1.12, passive: 0.75 },
  sounds: {
    // bowling pins: a clattering tan wave, retriggered and stepping down
    pins: [0.4, 0.15, 1200, 0, 0.02, 0.16, 3, 1, 0, 0, -300, 0.04, 0.045, 0.6, 0, 0, 0, 0.6, 0.02, 0, 0],
    // a sleepy tuba yawn sliding down with a slow wobble
    yawn: [0.35, 0, 180, 0.06, 0.22, 0.28, 2, 1, -0.3, 0, 0, 0, 0, 0, 5, 0, 0, 0.75, 0.05, 0.2, -700],
  },
  skills: {
    q: { impact: { sound: 'pins' } },
    w: { cast: { sound: 'yawn' } },
    e: { impact: { sound: 'pins', rate: 1.2 } },
    r: { impact: { sound: 'pins', rate: 0.85 } },
  },
  fx: { paint },
};
