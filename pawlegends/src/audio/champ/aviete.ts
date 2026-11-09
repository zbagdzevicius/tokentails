/**
 * Avietė: Raspberry static: sparks that end in raspberry dots. Timbre: theremin buzz and static (square, bit-crushed).
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: every Q/E cast adds a short bit-crushed static stutter (the motif, rising Q → E); Shiny Coat (W) swaps it for
 * a theremin swell over the 0.5 s charge; a raspberry "pop" (a tiny falling sine blip) marks her own moments: the
 * Charged proc, Short Circuit's ZAP!, the Live Wire anchor. The basic and ult voices are IDENTITY.aviete.voice.
 *
 * Look: zig-zag sparks in pale volt that end in a raspberry drupelet cluster (a tight clump of raspberry dots with
 * one yellow glint), in her colour pair (#C83A8C raspberry / #FFF3A6 pale volt).
 */
import type { SkillKey } from '../../render/identity';
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE ids (numbers: this data file carries no render import). */
const FADE_HOLD = 2;
const FADE_TWINKLE = 3;

/** Avietė's own sounds, baked as `c:aviete:<name>`. */
export const AVIETE_SOUNDS = Object.freeze({
  /** The raspberry pop: a tiny bright sine blip that drops (0.07 s). */
  drupe: [0.35, 0, 2200, 0, 0.01, 0.05, 0, 1, -40, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.01, 0, 0],
  /** Shiny Coat's charge: a theremin swell (sine, wide tremolo) sliding up through the charge (0.48 s). */
  theremin: [0.3, 0, 520, 0.06, 0.24, 0.14, 0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0.04, 0.35, 0],
});

const _p: P3 = { x: 0, y: 0, z: 0 };
const _d = { x: 0, y: 0.25, z: 0 };

/** Sparks flying out, then a raspberry drupelet cluster (with a yellow glint) a little above the point. */
function paint(p: MotifPainter, pos: P3, n: number, dir: { x: number; z: number } | null, skill: SkillKey): boolean {
  const { primary, secondary } = p.colors;
  const sparks = Math.max(1, Math.round(n * 0.45));
  const dots = Math.max(1, n - sparks - 1);
  _p.x = pos.x;
  _p.y = pos.y + 0.7;
  _p.z = pos.z;
  if (dir) {
    _d.x = dir.x;
    _d.z = dir.z;
  }
  // the static: stretched volt sparks (along the skill's direction when it has one)
  p.burst(_p, {
    n: sparks,
    exact: true,
    shape: p.shape.SPARK,
    color: secondary,
    additive: true,
    intensity: 1.6,
    size: [0.1, 0.16],
    life: [0.16, 0.26],
    speed: [3, 5.5],
    dir: dir ? _d : undefined,
    spread: dir ? 0.9 : Math.PI,
    stretch: 3,
    drag: 4,
  });
  // the raspberry: a tight clump of drupelets that holds, then drops (R and the passive: a bigger berry)
  const big = skill === 'r' || skill === 'passive';
  p.burst(_p, {
    n: dots,
    exact: true,
    shape: p.shape.SOFT,
    color: primary,
    additive: false,
    size: big ? [0.13, 0.19] : [0.09, 0.14],
    life: [0.45, 0.65],
    speed: [0.05, 0.25],
    jitter: big ? 0.16 : 0.11,
    up: 0.4,
    gravity: 2.5,
    fade: FADE_HOLD,
  });
  // one glint on the berry
  p.single(_p, { shape: p.shape.STAR4, color: secondary, size0: big ? 0.34 : 0.24, size1: 0.05, life: 0.3, fade: FADE_TWINKLE, intensity: 1.4 });
  return true;
}

export const aviete: ChampAudio = {
  hero: 'aviete',
  /** The static stutter: a bit-crushed square buzz with a fast repeat that falls in pitch (0.15 s). */
  motif: [0.28, 0, 1500, 0.004, 0.035, 0.09, 5, 1, -14, 0, 0, 0, 0.025, 0.4, 0, 0.25, 0, 0.6, 0.02, 0, 1200],
  motifRate: { q: 1, w: 1.12, e: 1.26, passive: 0.9 },
  sounds: AVIETE_SOUNDS,
  skills: {
    // Shiny Coat: the theremin swell rides the empower cast in place of the stutter
    w: { cast: { sound: 'theremin', vol: 0.3 } },
    // the Charged proc (skillfx/aviete.ts plays it on the proc frame): her raspberry pop, never a second shock
    passive: { impact: { sound: 'drupe', replace: true, vol: 0.4 } },
  },
  fx: { motifCount: 7, paint },
};
