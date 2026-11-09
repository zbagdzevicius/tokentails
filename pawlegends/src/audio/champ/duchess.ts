/**
 * Duchess: Royal Persian: tiny gold crowns and fluff. Timbre: harpsichord flick (filtered saw).
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: a harpsichord flick on every Q/E (E a fourth up); Not Amused swaps it for a falling two-note "hmph" on the
 * harpsichord; the Snub (Utter Disdain's stun) rings a tiny crown "ting" on top of the shadow thud. Fluff Puff's ball
 * carries the projectile travel whoosh. Basic voice (plucked flick) and ult voice (royal flourish) from IDENTITY.
 * Look: tiny gold crowns (three gold spikes and a plum jewel) floating up out of plum fluff wisps. On Fluff Puff a
 * crown sits on the rolling ball; on the Snub it drops onto the stunned head.
 */
import type { SkillKey } from '../../render/identity';
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE ids (numbers here: this file stays free of render imports). */
const FADE_HOLD = 2;
const FADE_IN_OUT = 4;

const AT = { x: 0, y: 0, z: 0 };
const SPIKE = { shape: 0, color: 0, size0: 0.2, size1: 0.2, life: 0.6, alpha: 1, additive: false, fade: FADE_HOLD, grow: 0, rot: 0, spin: 0, vx: 0, vy: 0.8, vz: 0 };
const FLUFF = { n: 1, exact: true, shape: 0, color: 0, additive: false, size: [0.24, 0.36], sizeEnd: 1.4, life: [0.5, 0.7], speed: [0.5, 1.1], up: 0.7, drag: 2, fade: FADE_IN_OUT, jitter: 0.2 };

/** One crown at AT (+dx): three gold spikes (the middle one tallest) over a plum jewel. 4 particles. */
function crown(p: MotifPainter, dx: number, s: number, life: number, vy: number): void {
  const x = AT.x;
  const y = AT.y;
  SPIKE.shape = p.shape.FEATHER;
  SPIKE.color = p.colors.secondary;
  SPIKE.life = life;
  SPIKE.vy = vy;
  for (let i = -1; i <= 1; i++) {
    AT.x = x + dx + i * s * 0.34;
    AT.y = y + (i === 0 ? s * 0.3 : s * 0.2);
    SPIKE.size0 = SPIKE.size1 = s * (i === 0 ? 0.62 : 0.48);
    SPIKE.rot = -i * 0.28;
    p.single(AT, SPIKE);
  }
  AT.x = x + dx;
  AT.y = y;
  SPIKE.shape = p.shape.STAR4;
  SPIKE.color = p.colors.primary;
  SPIKE.size0 = SPIKE.size1 = s * 0.3;
  SPIKE.rot = 0;
  p.single(AT, SPIKE);
  AT.x = x;
}

/** Crowns (4 particles each, at most 2) and plum fluff wisps with what is left. */
export function paintDuchess(p: MotifPainter, pos: P3, n: number, _dir: { x: number; z: number } | null, skill: SkillKey): boolean {
  if (n <= 0) return true;
  AT.x = pos.x;
  AT.z = pos.z;
  // Fluff Puff: the crown rides the rolling ball (short-lived, re-laid as it rolls); the Snub drops one on the head
  const onBall = skill === 'q';
  const drop = skill === 'passive';
  AT.y = pos.y + (onBall ? 0.45 : drop ? 1.0 : 0.9);
  const crowns = Math.min(2, n >> 2);
  for (let c = 0; c < crowns; c++) crown(p, crowns === 2 ? (c ? 0.32 : -0.32) : 0, onBall ? 0.42 : 0.36, onBall ? 0.14 : 0.7, onBall ? 0 : drop ? -0.9 : 0.8);
  const rest = n - crowns * 4;
  if (rest > 0) {
    AT.y = pos.y + 0.6;
    FLUFF.n = rest;
    FLUFF.shape = p.shape.SOFT;
    FLUFF.color = p.colors.primary;
    p.burst(AT, FLUFF);
  }
  return true;
}

export const duchess: ChampAudio = {
  hero: 'duchess',
  // harpsichord flick: a low-passed saw pluck at B5 (≈0.16 s)
  motif: [0.26, 0, 988, 0, 0.015, 0.12, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.02, 0, -3200],
  // Q B5, E up a fourth; Utter Disdain a step down
  motifRate: { q: 1, w: 0.75, e: 1.33, passive: 0.89 },
  sounds: {
    // Not Amused: a falling two-note harpsichord sniff
    hmph: [0.26, 0, 784, 0, 0.03, 0.12, 2, 1, 0, 0, -196, 0.05, 0, 0, 0, 0, 0, 0.5, 0.02, 0, -2800],
    // the Snub: a tiny crown ting, high and bright
    crownTing: [0.24, 0, 1976, 0, 0.01, 0.2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.4, 0.03, 0, -5000],
  },
  skills: {
    w: { cast: { sound: 'hmph', vol: 0.3 } },
    passive: { impact: { sound: 'crownTing', vol: 0.26 } },
  },
  // skillfx/duchess.ts draws the crowns and fluff on every cast itself (identity()), so the owned-cast burst is off
  fx: { motifCount: 6, ownedMotif: false, paint: paintDuchess },
};
