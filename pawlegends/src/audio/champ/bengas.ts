/**
 * Bengas: Diva chef: toast crumbs and camellia petals. Timbre: castanet clack and sizzle.
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: every Q/W/E cast adds a castanet double clack (the motif, rising Q → E); Striking Pose (W) swaps it for a
 * camera shutter; the toast hit adds a crunch; every Curtains Up! pulse clacks a castanet roll (in place of the old
 * stand-in drum); the toast sizzles in flight (the fire nature's travel layer, from skillfx/bengas.ts).
 *
 * Look: golden toast crumbs that tumble and bounce, with a camellia petal or two drifting in crimson; Camellia Hop
 * (E) is all petals. Colour pair #B01838 camellia crimson / #E0A050 toast gold.
 */
import type { SkillKey } from '../../data/identity';
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE ids (numbers: this data file carries no render import). */
const FADE_HOLD = 2;

/** Bengas's own sounds, baked as `c:bengas:<name>`. */
export const BENGAS_SOUNDS = Object.freeze({
  /** Striking Pose: a camera shutter (two hard noise ticks, high-passed) (0.06 s). */
  shutter: [0.32, 0, 1800, 0, 0.012, 0.035, 4, 1, 0, 0, 0, 0, 0.03, 0, 0, 0, 0, 0.6, 0.01, 0, 2500],
  /** The toast breaking: a dry low crunch (0.12 s). */
  crunch: [0.4, 0, 900, 0, 0.02, 0.08, 4, 1, -3, 0, 0, 0, 0.02, 1, 0, 0.1, 0, 0.5, 0.02, 0, -2500],
  /** A castanet roll for each Curtains Up! pulse (0.15 s). */
  roll: [0.32, 0, 2400, 0, 0.012, 0.12, 4, 1, 0, 0, 0, 0, 0.03, 0.3, 0, 0, 0, 0.5, 0.02, 0, 3500],
});

const _p: P3 = { x: 0, y: 0, z: 0 };

/** Toast crumbs (gold shards that tumble and bounce) and camellia petals (crimson feathers that drift). */
function paint(p: MotifPainter, pos: P3, n: number, _dir: { x: number; z: number } | null, skill: SkillKey): boolean {
  const { primary, secondary } = p.colors;
  // Camellia Hop and the pose are petal moves; the fire skills are crumb moves
  const petalShare = skill === 'e' ? 0.75 : skill === 'w' ? 0.5 : 0.25;
  const petals = Math.max(1, Math.round(n * petalShare));
  const crumbs = n - petals;
  _p.x = pos.x;
  _p.y = pos.y + 0.8;
  _p.z = pos.z;
  if (crumbs > 0)
    p.burst(_p, {
      n: crumbs,
      exact: true,
      shape: p.shape.SHARD,
      color: secondary,
      additive: false,
      size: [0.1, 0.16],
      life: [0.45, 0.7],
      speed: [1.4, 2.6],
      up: 1.8,
      gravity: 9,
      spin: 8,
      fade: FADE_HOLD,
    });
  p.burst(_p, {
    n: petals,
    exact: true,
    shape: p.shape.FEATHER,
    color: primary,
    additive: false,
    size: [0.18, 0.26],
    life: [0.7, 0.95],
    speed: [0.6, 1.4],
    up: 1.0,
    gravity: 1.2,
    spin: 3,
    drag: 1.5,
    fade: FADE_HOLD,
  });
  return true;
}

export const bengas: ChampAudio = {
  hero: 'bengas',
  /** The castanet double clack: short noise ticks with a 45 ms repeat, high-passed (0.06 s). */
  motif: [0.28, 0, 2200, 0, 0.012, 0.035, 4, 1, 0, 0, 0, 0, 0.045, 0.2, 0, 0, 0, 0.5, 0.01, 0, 3000],
  motifRate: { q: 1, w: 1.12, e: 1.26, passive: 0.9 },
  sounds: BENGAS_SOUNDS,
  skills: {
    // Striking Pose: the camera shutter is his flash
    w: { cast: { sound: 'shutter', vol: 0.3 } },
  },
  fx: { motifCount: 7, paint },
};
