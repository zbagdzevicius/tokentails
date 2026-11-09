/**
 * Clem: Sunrise knight: every hit throws golden-hour sun rays. Timbre: kalimba pluck (bright triangle).
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: a kalimba pluck on every Q/W/E (a rising C arpeggio: Q C6, W E6, E G6); each Paw Combo hit adds a soft
 * fifth pluck; The Stand's parry (a reflected bolt) rings a high kalimba "ting" on top of the guard clank. The basic
 * voice (880 Hz pluck) and the ult voice (rising C chord) come from IDENTITY.clem.voice.
 * Look: a sunburst: one peach 8-ray sun with sunlight rays streaking flat out of it (bigger on Paw Combo and Golden
 * Hour; on Tumble the sun drifts back along the dash like an afterimage).
 */
import type { SkillKey } from '../../data/identity';
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE / GROW ids (numbers here: this file stays free of render imports). */
const FADE_TWINKLE = 3;
const FADE_HOLD = 2;
const GROW_OUT = 1;

const AT = { x: 0, y: 0, z: 0 };
const DIR3 = { x: 0, y: 0, z: 0 };
const SUN = { shape: 0, color: 0, size0: 0.5, size1: 0.2, life: 0.45, alpha: 1, intensity: 1.6, additive: true, fade: FADE_HOLD, grow: GROW_OUT, rot: 0, spin: 2, vx: 0, vy: 0, vz: 0 };
const RAYS = {
  n: 1,
  exact: true,
  shape: 0,
  color: 0,
  additive: true,
  intensity: 1.5,
  size: [0.08, 0.13],
  life: [0.2, 0.32],
  speed: [3, 5],
  flat: true,
  up: 0.4,
  stretch: 3,
  drag: 4,
  fade: FADE_TWINKLE,
  dir: undefined as typeof DIR3 | undefined,
  spread: Math.PI,
};

/** The sunburst: one sun disc in the primary peach, the rest sunlight rays streaking out flat. */
export function paintClem(p: MotifPainter, pos: P3, n: number, dir: { x: number; z: number } | null, skill: SkillKey): boolean {
  if (n <= 0) return true;
  const big = skill === 'r' || skill === 'q';
  AT.x = pos.x;
  AT.y = pos.y + 0.6;
  AT.z = pos.z;
  SUN.shape = p.shape.STAR8;
  SUN.color = p.colors.primary;
  SUN.size0 = big ? 0.7 : 0.5;
  SUN.size1 = SUN.size0 * 0.35;
  SUN.rot = pos.x * 1.7;
  const trail = skill === 'e' && dir !== null;
  SUN.vx = trail ? -dir.x * 1.2 : 0;
  SUN.vz = trail ? -dir.z * 1.2 : 0;
  p.single(AT, SUN);
  if (n <= 1) return true;
  RAYS.n = n - 1;
  RAYS.shape = p.shape.SPARK;
  RAYS.color = p.colors.secondary;
  if (dir && skill !== 'r' && skill !== 'passive') {
    DIR3.x = dir.x;
    DIR3.z = dir.z;
    RAYS.dir = DIR3;
    RAYS.spread = 0.9;
  } else {
    RAYS.dir = undefined;
    RAYS.spread = Math.PI;
  }
  p.burst(AT, RAYS);
  return true;
}

export const clem: ChampAudio = {
  hero: 'clem',
  // kalimba pluck: a bright triangle at C6 with a quick pluck decay (≈0.24 s)
  motif: [0.28, 0, 1046.5, 0.001, 0.02, 0.18, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.45, 0.04, 0, 0],
  // the rising C arpeggio: C6, E6, G6; Valor a low C
  motifRate: { q: 1, w: 1.26, e: 1.5, passive: 0.5 },
  sounds: {
    // a soft fifth (G6) on each Paw Combo hit
    ray: [0.22, 0, 1568, 0.001, 0.01, 0.14, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.4, 0.03, 0, 0],
    // The Stand's parry: a high kalimba ting that lifts an octave
    sunTing: [0.3, 0, 2093, 0, 0.02, 0.2, 1, 1, 0, 0, 2093, 0.04, 0, 0, 0, 0, 0, 0.4, 0.03, 0, 0],
  },
  skills: {
    q: { impact: { sound: 'ray', vol: 0.2 } },
    w: { impact: { sound: 'sunTing', vol: 0.3 } },
  },
  // skillfx/clem.ts draws the sunburst on every cast itself (identity()), so the framework's owned-cast burst is off
  fx: { motifCount: 6, ownedMotif: false, paint: paintClem },
};
